package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"pantara/internal/regional"
	"pantara/internal/store"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// minJWTSecretLen is the shortest JWT_SECRET accepted (32 random bytes as hex is 64).
const minJWTSecretLen = 32

// jwtSecret signs and verifies login tokens; set by InitAuth.
var jwtSecret []byte

// InitAuth reads JWT_SECRET once main has loaded .env. There is deliberately no
// built-in key: anyone who can read the source could forge login tokens with it.
func InitAuth() error {
	s := os.Getenv("JWT_SECRET")
	if len(s) < minJWTSecretLen {
		return fmt.Errorf("JWT_SECRET kosong atau kurang dari %d karakter; isi di .env dengan string acak, misalnya hasil `openssl rand -hex 32`", minJWTSecretLen)
	}
	jwtSecret = []byte(s)
	return nil
}

func jwtKey() []byte {
	return jwtSecret
}

// Account roles stored in app_users.role.
const (
	RoleMSME       = "msme"
	RoleGovernment = "government"
)

type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	// Role is empty in tokens issued before roles existed; treat that as MSME.
	Role string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

type CommodityItem struct {
	Name                string  `json:"name"`
	WeeklyConsumptionKg float64 `json:"weekly_consumption_kg"`
}

type RegisterRequest struct {
	Email             string          `json:"email"`
	Password          string          `json:"password"`
	BusinessName      string          `json:"business_name"`
	FnbCategory       string          `json:"fnb_category"`
	ReferenceMarket   string          `json:"reference_market"`
	RegionID          string          `json:"region_id"` // regency/city the business buys in
	Commodities       []CommodityItem `json:"commodities"`
	WeeklyConsumption float64         `json:"weekly_consumption_kg"`
	StorageMethod     string          `json:"storage_method"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token   string `json:"token"`
	Message string `json:"message"`
	Role    string `json:"role,omitempty"`
	Error   string `json:"error,omitempty"`
}

func handleRegisterAuth(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(req.Email)

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error hashing password", http.StatusInternalServerError)
		return
	}

	// Calculate decay rate
	decayRate := 0.03
	if req.StorageMethod == "chiller" {
		decayRate = 0.015
	} else if req.StorageMethod == "airtight" {
		decayRate = 0.005
	}

	// Start transaction
	tx, err := store.DB.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Insert into app_users
	var userID string
	err = tx.QueryRow(`
		INSERT INTO app_users (email, password_hash) 
		VALUES ($1, $2) RETURNING id`,
		req.Email, string(hash)).Scan(&userID)

	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") {
			http.Error(w, "Email already registered", http.StatusConflict)
		} else {
			http.Error(w, fmt.Sprintf("Error creating user: %v", err), http.StatusInternalServerError)
		}
		return
	}

	// Ensure commodities is not nil
	if req.Commodities == nil {
		req.Commodities = []CommodityItem{}
	}
	comJson, _ := json.Marshal(req.Commodities)

	// Insert into profiles
	_, err = tx.Exec(`
		INSERT INTO profiles (
			id, business_name, fnb_category, reference_market, commodities,
			storage_method, daily_decay_rate, region_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		userID, req.BusinessName, req.FnbCategory, req.ReferenceMarket, string(comJson),
		req.StorageMethod, decayRate, msmeRegion(req.RegionID))

	if err != nil {
		http.Error(w, fmt.Sprintf("Error creating profile: %v", err), http.StatusInternalServerError)
		return
	}

	if err = tx.Commit(); err != nil {
		http.Error(w, "Error committing transaction", http.StatusInternalServerError)
		return
	}

	// Generate JWT
	tokenString, err := generateJWT(userID, req.Email, RoleMSME)
	if err != nil {
		http.Error(w, "Error generating token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{Token: tokenString, Message: "Registrasi berhasil", Role: RoleMSME})
}

func handleLoginAuth(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(req.Email)

	var userID, hash, role string
	err := store.DB.QueryRow(`SELECT id, password_hash, role FROM app_users WHERE email = $1`, req.Email).Scan(&userID, &hash, &role)
	if err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	tokenString, err := generateJWT(userID, req.Email, role)
	if err != nil {
		http.Error(w, "Error generating token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{Token: tokenString, Message: "Login berhasil", Role: role})
}

func handleGetProfile(w http.ResponseWriter, r *http.Request) {
	claims, err := extractClaims(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if claims.Role == RoleGovernment {
		gp, err := loadGovernmentProfile(claims.UserID)
		if err != nil {
			http.Error(w, "Profile not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, gp)
		return
	}

	var id, bName, fnb, refMarket, storage string
	var region sql.NullString
	var decay float64
	var comBytes []byte

	err = store.DB.QueryRow(`
		SELECT id, business_name, fnb_category, reference_market, commodities, storage_method, daily_decay_rate, region_id
		FROM profiles WHERE id = $1`, claims.UserID).Scan(
		&id, &bName, &fnb, &refMarket, &comBytes, &storage, &decay, &region,
	)

	if err != nil {
		http.Error(w, "Profile not found", http.StatusNotFound)
		return
	}

	var commodities []CommodityItem
	json.Unmarshal(comBytes, &commodities)

	prof := map[string]interface{}{
		"role":             RoleMSME,
		"id":               id,
		"business_name":    bName,
		"fnb_category":     fnb,
		"reference_market": refMarket,
		"region_id":        msmeRegion(region.String),
		"region_name":      regionName(msmeRegion(region.String)),
		"commodities":      commodities,
		"storage_method":   storage,
		"daily_decay_rate": decay,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prof)
}

func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, err := extractClaims(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req RegisterRequest // Reuse struct for fields
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	decayRate := 0.03
	if req.StorageMethod == "chiller" {
		decayRate = 0.015
	} else if req.StorageMethod == "airtight" {
		decayRate = 0.005
	}

	if req.Commodities == nil {
		req.Commodities = []CommodityItem{}
	}
	comJson, _ := json.Marshal(req.Commodities)

	_, err = store.DB.Exec(`
		UPDATE profiles SET 
			business_name = $1, fnb_category = $2, reference_market = $3, 
			commodities = $4,
			storage_method = $5, daily_decay_rate = $6, region_id = $7
		WHERE id = $8`,
		req.BusinessName, req.FnbCategory, req.ReferenceMarket, string(comJson),
		req.StorageMethod, decayRate, msmeRegion(req.RegionID), claims.UserID)

	if err != nil {
		http.Error(w, "Error updating profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated"})
}

// Helpers

// msmeRegion returns a valid regency/city or province ID for a business,
// falling back to defaultMSMERegion.
func msmeRegion(id string) string {
	if _, ok := regional.FindRegion(id); ok {
		return id
	}
	return defaultMSMERegion
}

func regionName(id string) string {
	r, _ := regional.FindRegion(id)
	return r.Name
}

func generateJWT(userID, email, role string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey())
}

func extractClaims(r *http.Request) (*Claims, error) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return nil, fmt.Errorf("missing or invalid token")
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey(), nil
	})

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}
