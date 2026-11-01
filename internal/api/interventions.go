package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"pantara/internal/regional"
	"pantara/internal/store"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"
)

var interventionTypes = map[string]bool{
	"market_operation":    true, // operasi pasar / SPHP
	"cheap_food_market":   true, // Gerakan Pangan Murah
	"supply_distribution": true, // distribusi / mobilisasi pasokan
	"market_inspection":   true, // sidak pasar
	"stock_release":       true, // pelepasan cadangan pangan
	"other":               true,
}

const (
	statusDraft     = "draft"
	statusPublished = "published"
	maxTitleLen     = 140
	maxDescLen      = 4000
)

// InterventionTrigger is the forecast and alert frozen at the baseline date.
type InterventionTrigger struct {
	Forecast regional.Forecast `json:"forecast"`
	Alert    regional.Alert    `json:"alert"`
}

type Intervention struct {
	ID            string               `json:"id"`
	RegionID      string               `json:"region_id"`
	RegionName    string               `json:"region_name"`
	CommodityID   string               `json:"commodity_id"`
	CommodityName string               `json:"commodity_name"`
	Type          string               `json:"type"`
	Title         string               `json:"title"`
	Description   string               `json:"description"`
	StartDate     string               `json:"start_date"`
	EndDate       string               `json:"end_date"`
	Volume        *float64             `json:"volume"`
	VolumeUnit    string               `json:"volume_unit"`
	BudgetIDR     *float64             `json:"budget_idr"`
	Status        string               `json:"status"`
	BaselineDate  string               `json:"baseline_date"`
	Trigger       InterventionTrigger  `json:"trigger"`
	AgencyName    string               `json:"agency_name"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
	PublishedAt   *time.Time           `json:"published_at"`
	Evaluation    *regional.Evaluation `json:"evaluation,omitempty"`
}

type InterventionInput struct {
	RegionID     string   `json:"region_id"`
	CommodityID  string   `json:"commodity_id"`
	Type         string   `json:"type"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Volume       *float64 `json:"volume"`
	VolumeUnit   string   `json:"volume_unit"`
	BudgetIDR    *float64 `json:"budget_idr"`
	BaselineDate string   `json:"baseline_date"` // default: last day of data
}

const interventionColumns = `
	i.id, i.region_id, i.commodity_id, i.type, i.title, i.description,
	i.start_date, i.end_date, i.volume, i.volume_unit, i.budget_idr, i.status,
	i.baseline_date, i.trigger, g.agency_name, i.created_at, i.updated_at, i.published_at`

const interventionFrom = `
	FROM interventions i LEFT JOIN government_profiles g ON g.id = i.created_by`

type rowScanner interface{ Scan(dest ...any) error }

func scanIntervention(s rowScanner) (Intervention, error) {
	var it Intervention
	var start, end, baseline time.Time
	var volume, budget sql.NullFloat64
	var unit, agency sql.NullString
	var trigger []byte
	var published sql.NullTime
	err := s.Scan(&it.ID, &it.RegionID, &it.CommodityID, &it.Type, &it.Title, &it.Description,
		&start, &end, &volume, &unit, &budget, &it.Status, &baseline, &trigger, &agency,
		&it.CreatedAt, &it.UpdatedAt, &published)
	if err != nil {
		return it, err
	}
	it.StartDate, it.EndDate, it.BaselineDate = start.Format(dateLayout), end.Format(dateLayout), baseline.Format(dateLayout)
	if volume.Valid {
		it.Volume = &volume.Float64
	}
	if budget.Valid {
		it.BudgetIDR = &budget.Float64
	}
	it.VolumeUnit, it.AgencyName = unit.String, agency.String
	if published.Valid {
		it.PublishedAt = &published.Time
	}
	_ = json.Unmarshal(trigger, &it.Trigger)
	if r, ok := regional.FindRegion(it.RegionID); ok {
		it.RegionName = r.Name
	}
	if c, ok := regional.FindCommodity(it.CommodityID); ok {
		it.CommodityName = c.Name
	}
	ev := regional.EvaluateIntervention(it.RegionID, it.CommodityID, it.BaselineDate, it.Trigger.Forecast)
	it.Evaluation = &ev
	return it, nil
}

func queryInterventions(where string, args ...any) ([]Intervention, error) {
	rows, err := store.DB.Query(`SELECT `+interventionColumns+interventionFrom+` `+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Intervention{}
	for rows.Next() {
		it, err := scanIntervention(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func getIntervention(id string) (Intervention, error) {
	return scanIntervention(store.DB.QueryRow(`SELECT `+interventionColumns+interventionFrom+` WHERE i.id = $1`, id))
}

const dateLayout = "2006-01-02"

// validate normalises the input and returns a user-facing (Indonesian) error.
func (in *InterventionInput) validate(g GovernmentProfile) error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.VolumeUnit = strings.TrimSpace(in.VolumeUnit)
	if _, ok := regional.FindRegion(in.RegionID); !ok {
		return errors.New("Daerah tidak dikenal.")
	}
	if !g.Covers(in.RegionID) {
		return errors.New("Daerah ini di luar wilayah kewenangan akun Anda.")
	}
	if _, ok := regional.FindCommodity(in.CommodityID); !ok {
		return errors.New("Komoditas tidak dikenal.")
	}
	if regional.Prices(in.RegionID, in.CommodityID) == nil {
		return errors.New("Belum ada data harga komoditas ini untuk daerah tersebut.")
	}
	if !interventionTypes[in.Type] {
		return errors.New("Jenis intervensi tidak dikenal.")
	}
	if in.Title == "" || len([]rune(in.Title)) > maxTitleLen {
		return fmt.Errorf("Judul wajib diisi, maksimal %d karakter.", maxTitleLen)
	}
	if len([]rune(in.Description)) > maxDescLen {
		return fmt.Errorf("Keterangan maksimal %d karakter.", maxDescLen)
	}
	start, err1 := time.Parse(dateLayout, in.StartDate)
	end, err2 := time.Parse(dateLayout, in.EndDate)
	if err1 != nil || err2 != nil {
		return errors.New("Tanggal mulai dan selesai wajib diisi (YYYY-MM-DD).")
	}
	if end.Before(start) {
		return errors.New("Tanggal selesai tidak boleh sebelum tanggal mulai.")
	}
	if (in.Volume != nil && *in.Volume < 0) || (in.BudgetIDR != nil && *in.BudgetIDR < 0) {
		return errors.New("Volume dan anggaran tidak boleh negatif.")
	}
	first, last := regional.DateBounds()
	if in.BaselineDate == "" {
		in.BaselineDate = last
	}
	if in.BaselineDate < first || in.BaselineDate > last || regional.Dates()[regional.DateIndex(in.BaselineDate)] != in.BaselineDate {
		return fmt.Errorf("Tanggal acuan prakiraan harus di antara %s dan %s.", first, last)
	}
	return nil
}

func (in InterventionInput) trigger() ([]byte, error) {
	f, ok := regional.ComputeForecast(in.RegionID, in.CommodityID, regional.DateIndex(in.BaselineDate))
	if !ok {
		return nil, errors.New("prakiraan tidak tersedia")
	}
	return json.Marshal(InterventionTrigger{Forecast: f, Alert: regional.ComputeAlert(f)})
}

func nullableUnit(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func decodeInput(w http.ResponseWriter, r *http.Request, g GovernmentProfile) (InterventionInput, []byte, bool) {
	var in InterventionInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "Data formulir tidak valid.")
		return in, nil, false
	}
	if err := in.validate(g); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return in, nil, false
	}
	trig, err := in.trigger()
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Prakiraan untuk tanggal acuan ini tidak tersedia.")
		return in, nil, false
	}
	return in, trig, true
}

// ─── Government endpoints ────────────────────────────────────────────────────

func handleGovListInterventions(w http.ResponseWriter, r *http.Request) {
	g := governmentFrom(r)
	var covered []string
	for _, s := range regional.Scopes {
		for _, reg := range s.Regions {
			if g.Covers(reg.ID) {
				covered = append(covered, reg.ID)
			}
		}
	}
	list, err := queryInterventions(`WHERE i.region_id = ANY($1) ORDER BY i.created_at DESC`, pq.Array(covered))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal memuat intervensi.")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func handleGovCreateIntervention(w http.ResponseWriter, r *http.Request) {
	g := governmentFrom(r)
	in, trig, ok := decodeInput(w, r, g)
	if !ok {
		return
	}
	var id string
	err := store.DB.QueryRow(`
		INSERT INTO interventions (region_id, commodity_id, type, title, description, start_date, end_date,
			volume, volume_unit, budget_idr, baseline_date, trigger, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
		in.RegionID, in.CommodityID, in.Type, in.Title, in.Description, in.StartDate, in.EndDate,
		in.Volume, nullableUnit(in.VolumeUnit), in.BudgetIDR, in.BaselineDate, trig, g.ID).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal menyimpan intervensi.")
		return
	}
	it, err := getIntervention(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Intervensi tersimpan tetapi gagal dimuat ulang.")
		return
	}
	writeJSON(w, http.StatusCreated, it)
}

// loadEditable fetches an intervention the caller may act on; drafts only unless allowPublished.
func loadEditable(w http.ResponseWriter, r *http.Request, allowPublished bool) (Intervention, bool) {
	g := governmentFrom(r)
	it, err := getIntervention(chi.URLParam(r, "id"))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !g.Covers(it.RegionID)) {
		writeError(w, http.StatusNotFound, "Intervensi tidak ditemukan.")
		return it, false
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "Intervensi tidak ditemukan.")
		return it, false
	}
	if it.Status == statusPublished && !allowPublished {
		writeError(w, http.StatusConflict, "Intervensi yang sudah dipublikasikan tidak dapat diubah atau dihapus.")
		return it, false
	}
	return it, true
}

func handleGovUpdateIntervention(w http.ResponseWriter, r *http.Request) {
	it, ok := loadEditable(w, r, false)
	if !ok {
		return
	}
	in, trig, ok := decodeInput(w, r, governmentFrom(r))
	if !ok {
		return
	}
	_, err := store.DB.Exec(`
		UPDATE interventions SET region_id = $1, commodity_id = $2, type = $3, title = $4, description = $5,
			start_date = $6, end_date = $7, volume = $8, volume_unit = $9, budget_idr = $10,
			baseline_date = $11, trigger = $12, updated_at = now()
		WHERE id = $13 AND status = 'draft'`,
		in.RegionID, in.CommodityID, in.Type, in.Title, in.Description, in.StartDate, in.EndDate,
		in.Volume, nullableUnit(in.VolumeUnit), in.BudgetIDR, in.BaselineDate, trig, it.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal memperbarui intervensi.")
		return
	}
	updated, _ := getIntervention(it.ID)
	writeJSON(w, http.StatusOK, updated)
}

func handleGovPublishIntervention(w http.ResponseWriter, r *http.Request) {
	it, ok := loadEditable(w, r, false)
	if !ok {
		return
	}
	if _, err := store.DB.Exec(`UPDATE interventions SET status = 'published', published_at = now(), updated_at = now() WHERE id = $1 AND status = 'draft'`, it.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal mempublikasikan intervensi.")
		return
	}
	published, _ := getIntervention(it.ID)
	writeJSON(w, http.StatusOK, published)
}

func handleGovDeleteIntervention(w http.ResponseWriter, r *http.Request) {
	it, ok := loadEditable(w, r, false)
	if !ok {
		return
	}
	if _, err := store.DB.Exec(`DELETE FROM interventions WHERE id = $1 AND status = 'draft'`, it.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "Gagal menghapus intervensi.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Public endpoints ────────────────────────────────────────────────────────

func handlePublicInterventions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 50
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 200 {
		limit = n
	}
	list, err := queryInterventions(`
		WHERE i.status = 'published'
		  AND ($1 = '' OR i.region_id = $1)
		  AND ($2 = '' OR i.commodity_id = $2)
		ORDER BY i.published_at DESC LIMIT $3`, q.Get("region"), q.Get("commodity"), limit)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Data intervensi belum dapat dimuat.")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func handlePublicIntervention(w http.ResponseWriter, r *http.Request) {
	it, err := getIntervention(chi.URLParam(r, "id"))
	if err != nil || it.Status != statusPublished {
		writeError(w, http.StatusNotFound, "Intervensi tidak ditemukan.")
		return
	}
	writeJSON(w, http.StatusOK, it)
}
