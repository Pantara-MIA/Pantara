package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"pantara/internal/regional"
	"pantara/internal/store"
)

type GovernmentProfile struct {
	Role       string `json:"role"`
	ID         string `json:"id"`
	Email      string `json:"email"`
	AgencyName string `json:"agency_name"`
	// RegionID is the jurisdiction: a region ID (regency/city or province) or
	// a scope ID ("indonesia", "jawa-barat") covering every region inside it.
	RegionID   string `json:"region_id"`
	RegionName string `json:"region_name"`
	// Level is "national" | "province" | "regency".
	Level string `json:"level"`
	// Scope is the scope the dashboard opens in; Regions are the regions the
	// account plans and records interventions for.
	Scope   string   `json:"scope"`
	Regions []string `json:"regions"`
}

// Covers reports whether this account may act on regionID.
func (g GovernmentProfile) Covers(regionID string) bool {
	return regional.Covers(g.RegionID, regionID)
}

// describeJurisdiction fills the derived fields of a profile from RegionID.
// A scope account works on the regions of that scope (a province account on
// its regencies/cities); a regency/city account on itself.
func (g *GovernmentProfile) describeJurisdiction() {
	g.Regions = []string{}
	if s, ok := regional.FindScope(g.RegionID); ok {
		g.Scope = s.ID
		g.Level = "province"
		g.RegionName = "Provinsi " + s.Name
		if s.ID == regional.ScopeNational {
			g.Level, g.RegionName = "national", "Seluruh Indonesia"
		}
		for _, r := range s.Regions {
			g.Regions = append(g.Regions, r.ID)
		}
		return
	}
	r, ok := regional.FindRegion(g.RegionID)
	if !ok {
		g.RegionName = g.RegionID
		return
	}
	g.Scope, g.RegionName, g.Level = r.Scope, r.Name, "regency"
	if r.Type == "province" {
		g.Level, g.RegionName = "province", "Provinsi "+r.Name
	}
	g.Regions = []string{r.ID}
}

func loadGovernmentProfile(userID string) (GovernmentProfile, error) {
	g := GovernmentProfile{Role: RoleGovernment}
	err := store.DB.QueryRow(`
		SELECT u.id, u.email, g.agency_name, g.region_id
		FROM app_users u JOIN government_profiles g ON g.id = u.id
		WHERE u.id = $1 AND u.role = $2`, userID, RoleGovernment).Scan(&g.ID, &g.Email, &g.AgencyName, &g.RegionID)
	if err != nil {
		return g, err
	}
	g.describeJurisdiction()
	return g, nil
}

type govCtxKey struct{}

// requireGovernment admits only government accounts and stores their profile
// in the request context. The role is re-read from the database, so a revoked
// account loses access even while its token is still valid.
func requireGovernment(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, err := extractClaims(r)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Sesi tidak valid, silakan masuk kembali.")
			return
		}
		g, err := loadGovernmentProfile(claims.UserID)
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusForbidden, "Fitur ini hanya untuk akun pemerintah daerah.")
			return
		}
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "Basis data tidak dapat dihubungi.")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), govCtxKey{}, g)))
	})
}

func governmentFrom(r *http.Request) GovernmentProfile {
	g, _ := r.Context().Value(govCtxKey{}).(GovernmentProfile)
	return g
}
