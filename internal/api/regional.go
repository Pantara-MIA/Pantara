package api

import (
	"encoding/json"
	"net/http"
	"pantara/internal/regional"
	"strconv"
	"sync"

	"github.com/go-chi/chi/v5"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// latestMonth is the default scorecard month: the last month in the data.
func latestMonth() string {
	m := regional.Months()
	if len(m) == 0 {
		return ""
	}
	return m[len(m)-1]
}

// asOfIndex resolves the as_of query parameter to a day index (default: last day).
func asOfIndex(r *http.Request) int {
	d := regional.Dates()
	if s := r.URL.Query().Get("as_of"); s != "" {
		return regional.DateIndex(s)
	}
	return len(d) - 1
}

type DateRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// ScopeRef is one step of the drill-down path.
type ScopeRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Region is the region (in the parent scope) this scope breaks down.
	Region string `json:"region,omitempty"`
}

// breadcrumb returns the path from the national scope down to s.
func breadcrumb(s *regional.Scope) []ScopeRef {
	var out []ScopeRef
	for ok := true; ok; s, ok = regional.FindScope(s.Parent) {
		out = append([]ScopeRef{{ID: s.ID, Name: s.Name, Region: s.Region}}, out...)
	}
	return out
}

// scopeParam resolves the scope query parameter (default: national).
func scopeParam(w http.ResponseWriter, r *http.Request) (*regional.Scope, bool) {
	id := r.URL.Query().Get("scope")
	if id == "" {
		id = regional.ScopeNational
	}
	s, ok := regional.FindScope(id)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown scope")
	}
	return s, ok
}

type RegionsResponse struct {
	Scope       *regional.Scope      `json:"scope"`
	Breadcrumb  []ScopeRef           `json:"breadcrumb"`
	Scopes      []*regional.Scope    `json:"scopes"`
	Regions     []regional.Region    `json:"regions"`
	Commodities []regional.Commodity `json:"commodities"`
	DateRange   DateRange            `json:"date_range"`
	Months      []string             `json:"months"`
	Synthetic   bool                 `json:"synthetic"`
}

// handleRegions returns the regions of one scope plus shared master data.
// Commodities lists every commodity; scope.commodities says which have data.
// With region=<id> instead of scope, the scope that region is ranked in is used.
func handleRegions(w http.ResponseWriter, r *http.Request) {
	var s *regional.Scope
	ok := false
	if id := r.URL.Query().Get("region"); id != "" {
		if s, ok = regional.ScopeOf(id); !ok {
			writeError(w, http.StatusNotFound, "unknown region")
			return
		}
	} else if s, ok = scopeParam(w, r); !ok {
		return
	}
	start, end := regional.DateBounds()
	writeJSON(w, http.StatusOK, RegionsResponse{
		Scope:       s,
		Breadcrumb:  breadcrumb(s),
		Scopes:      regional.Scopes,
		Regions:     s.Regions,
		Commodities: regional.Commodities,
		DateRange:   DateRange{Start: start, End: end},
		Months:      regional.Months(),
		Synthetic:   s.Synthetic,
	})
}

// ScorecardRow is one ranking row; per-commodity detail lives in the region endpoint.
type ScorecardRow struct {
	RegionID              string   `json:"region_id"`
	Score                 float64  `json:"score"`
	Grade                 string   `json:"grade"`
	Rank                  int      `json:"rank"`
	DaysAboveNormalTotal  int      `json:"days_above_normal_total"`
	CommoditiesAffected   int      `json:"commodities_affected"`
	EpisodesTotal         int      `json:"episodes_total"`
	Compliance            *float64 `json:"compliance"`
	DaysAboveCeilingTotal int      `json:"days_above_ceiling_total"`
	CeilingBreached       int      `json:"ceiling_breached"`
	// Filled only when a single commodity is selected.
	MeanDuration   *float64 `json:"mean_duration,omitempty"`
	MeanRecovery   *float64 `json:"mean_recovery,omitempty"`
	NeighborGapPct *float64 `json:"neighbor_gap_pct,omitempty"`
}

type ScorecardResponse struct {
	Scope       string         `json:"scope"`
	Month       string         `json:"month"`
	CommodityID string         `json:"commodity_id"`
	Rows        []ScorecardRow `json:"rows"`
}

func toRow(s regional.RegionScore) ScorecardRow {
	row := ScorecardRow{
		RegionID:              s.RegionID,
		Score:                 s.Score,
		Grade:                 s.Grade,
		Rank:                  s.Rank,
		DaysAboveNormalTotal:  s.DaysAboveNormalTotal,
		CommoditiesAffected:   s.CommoditiesAffected,
		EpisodesTotal:         s.EpisodesTotal,
		Compliance:            s.Compliance,
		DaysAboveCeilingTotal: s.DaysAboveCeilingTotal,
		CeilingBreached:       s.CeilingBreached,
	}
	if len(s.Commodities) == 1 {
		m := s.Commodities[0]
		row.MeanDuration = &m.MeanDuration
		row.MeanRecovery = &m.MeanRecovery
		row.NeighborGapPct = &m.NeighborGapPct
	}
	return row
}

func handleScorecard(w http.ResponseWriter, r *http.Request) {
	s, ok := scopeParam(w, r)
	if !ok {
		return
	}
	month := r.URL.Query().Get("month")
	if month == "" {
		month = latestMonth()
	}
	commodity := r.URL.Query().Get("commodity")
	all, err := regional.ComputeScorecard(s.ID, month, commodity)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	res := ScorecardResponse{Scope: s.ID, Month: month, CommodityID: commodity, Rows: make([]ScorecardRow, len(all))}
	for i, s := range all {
		res.Rows[i] = toRow(s)
	}
	writeJSON(w, http.StatusOK, res)
}

type MonthScore struct {
	Month string  `json:"month"`
	Score float64 `json:"score"`
	Grade string  `json:"grade"`
	Rank  int     `json:"rank"`
}

type CommodityAlert struct {
	CommodityID string `json:"commodity_id"`
	regional.Alert
}

type RegionScorecardResponse struct {
	Month      string               `json:"month"`
	Region     regional.Region      `json:"region"`
	Scope      *regional.Scope      `json:"scope"`
	Breadcrumb []ScopeRef           `json:"breadcrumb"`
	Scorecard  regional.RegionScore `json:"scorecard"`
	Neighbors  []ScorecardRow       `json:"neighbors"`
	History    []MonthScore         `json:"history"`
	Alerts     []CommodityAlert     `json:"alerts"`
}

const historyMonths = 12

func handleRegionScorecard(w http.ResponseWriter, r *http.Request) {
	reg, ok := regional.FindRegion(chi.URLParam(r, "regionID"))
	if !ok {
		writeError(w, http.StatusNotFound, "unknown region")
		return
	}
	month := r.URL.Query().Get("month")
	if month == "" {
		month = latestMonth()
	}
	commodity := r.URL.Query().Get("commodity")
	scope, _ := regional.ScopeOf(reg.ID)

	all, err := regional.ComputeScorecard(scope.ID, month, commodity)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	res := RegionScorecardResponse{Month: month, Region: reg, Scope: scope, Breadcrumb: breadcrumb(scope),
		Neighbors: []ScorecardRow{}, History: []MonthScore{}, Alerts: []CommodityAlert{}}
	found := false
	isNeighbor := map[string]bool{}
	for _, id := range reg.Neighbors {
		isNeighbor[id] = true
	}
	for _, s := range all {
		switch {
		case s.RegionID == reg.ID:
			res.Scorecard, found = s, true
		case isNeighbor[s.RegionID]:
			res.Neighbors = append(res.Neighbors, toRow(s))
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "Daerah ini belum memiliki data untuk pilihan tersebut.")
		return
	}

	months := regional.Months()
	end := len(months)
	for i, m := range months {
		if m == month {
			end = i + 1
		}
	}
	for _, m := range months[max(0, end-historyMonths):end] {
		s, err := regional.RegionScorecard(m, commodity, reg.ID)
		if err == nil {
			res.History = append(res.History, MonthScore{Month: m, Score: s.Score, Grade: s.Grade, Rank: s.Rank})
		}
	}

	// Alerts are evaluated on the last day of the selected month.
	_, last, _ := regional.MonthBounds(month)
	for _, id := range scope.Commodities {
		if commodity != "" && id != commodity {
			continue
		}
		if f, ok := regional.ComputeForecast(reg.ID, id, last); ok {
			res.Alerts = append(res.Alerts, CommodityAlert{CommodityID: id, Alert: regional.ComputeAlert(f)})
		}
	}
	writeJSON(w, http.StatusOK, res)
}

type PricePoint struct {
	Date           string  `json:"date"`
	Price          float64 `json:"price"`
	Reference      float64 `json:"reference"`
	Normal         float64 `json:"normal"` // statistical normal band (stability score)
	NeighborMedian float64 `json:"neighbor_median,omitempty"`
	ScopeMedian    float64 `json:"scope_median"`
}

type PricesResponse struct {
	RegionID    string `json:"region_id"`
	CommodityID string `json:"commodity_id"`
	// Source of the series (pihps | sp2kp | synthetic), its label and reference type.
	Source        string            `json:"source"`
	SourceLabel   string            `json:"source_label"`
	ReferenceType string            `json:"reference_type"`
	Series        []PricePoint      `json:"series"`
	Forecast      regional.Forecast `json:"forecast"`
	Alert         regional.Alert    `json:"alert"`
}

const maxSeriesDays = 730

func handlePrices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	regionID, commodityID := q.Get("region"), q.Get("commodity")
	scope, ok := regional.ScopeOf(regionID)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown region")
		return
	}
	p := scope.Prices(regionID, commodityID)
	if p == nil {
		writeError(w, http.StatusNotFound, "Belum ada data harga untuk daerah dan komoditas ini.")
		return
	}
	days := 180
	if s := q.Get("days"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			days = min(n, maxSeriesDays)
		}
	}
	now := asOfIndex(r)
	if now < 0 {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}

	dates := regional.Dates()
	ref := scope.Reference(regionID, commodityID)
	band := scope.Normal(regionID, commodityID)
	med := scope.Median(commodityID)
	source, refType := scope.SeriesInfo(regionID, commodityID)
	res := PricesResponse{RegionID: regionID, CommodityID: commodityID, Source: source,
		SourceLabel: regional.SourceLabel(source), ReferenceType: refType}
	for t := max(0, now-days+1); t <= now; t++ {
		res.Series = append(res.Series, PricePoint{
			Date:           dates[t],
			Price:          p[t],
			Reference:      ref[t],
			Normal:         band[t],
			NeighborMedian: scope.NeighborMedian(regionID, commodityID, t),
			ScopeMedian:    med[t],
		})
	}
	res.Forecast, _ = regional.ComputeForecast(regionID, commodityID, now)
	res.Alert = regional.ComputeAlert(res.Forecast)
	writeJSON(w, http.StatusOK, res)
}

type RegionAlert struct {
	RegionID string `json:"region_id"`
	// Single-commodity view: price vs reference.
	CurrentPrice float64 `json:"current_price,omitempty"`
	Reference    float64 `json:"reference,omitempty"`
	// All-commodities view: how many commodities are in each non-normal state.
	AboveCount int `json:"above_count"`
	WatchCount int `json:"watch_count"`
	regional.Alert
}

type AlertsResponse struct {
	Scope       string        `json:"scope"`
	AsOf        string        `json:"as_of"`
	CommodityID string        `json:"commodity_id"`
	Regions     []RegionAlert `json:"regions"`
}

var (
	alertsCache   = map[string]AlertsResponse{}
	alertsCacheMu sync.Mutex
)

// statusNoData marks a region without data for the selected commodity.
const statusNoData = "no_data"

var statusRank = map[string]int{statusNoData: -1, regional.StatusNormal: 0, regional.StatusWatch: 1, regional.StatusAbove: 2}

// regionAlert evaluates one region for one commodity, or for every commodity
// with data when commodityID is empty (worst status wins, with per-state counts).
func regionAlert(regionID, commodityID string, now int) RegionAlert {
	out := RegionAlert{RegionID: regionID, Alert: regional.Alert{Status: statusNoData}}
	scope, _ := regional.ScopeOf(regionID)
	for _, id := range scope.Commodities {
		if commodityID != "" && id != commodityID {
			continue
		}
		f, ok := regional.ComputeForecast(regionID, id, now)
		if !ok {
			continue
		}
		if out.Status == statusNoData {
			out.Status = regional.StatusNormal
		}
		a := regional.ComputeAlert(f)
		switch a.Status {
		case regional.StatusAbove:
			out.AboveCount++
		case regional.StatusWatch:
			out.WatchCount++
		}
		if commodityID != "" {
			out.CurrentPrice, out.Reference, out.Alert = f.CurrentPrice, f.Reference, a
			continue
		}
		if statusRank[a.Status] > statusRank[out.Status] {
			out.Status = a.Status
		}
		out.MaxBreachProb = max(out.MaxBreachProb, a.MaxBreachProb)
	}
	return out
}

// handleAlerts returns the early-warning status of every region for one
// commodity, or a worst-status summary across all commodities when omitted.
func handleAlerts(w http.ResponseWriter, r *http.Request) {
	scope, ok := scopeParam(w, r)
	if !ok {
		return
	}
	commodityID := r.URL.Query().Get("commodity")
	if _, ok := regional.FindCommodity(commodityID); commodityID != "" && !ok {
		writeError(w, http.StatusBadRequest, "unknown commodity")
		return
	}
	now := asOfIndex(r)
	if now < 0 {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}
	key := scope.ID + "|" + strconv.Itoa(now) + "|" + commodityID
	alertsCacheMu.Lock()
	res, ok := alertsCache[key]
	alertsCacheMu.Unlock()
	if !ok {
		res = AlertsResponse{Scope: scope.ID, AsOf: regional.Dates()[now], CommodityID: commodityID}
		for _, reg := range scope.Regions {
			res.Regions = append(res.Regions, regionAlert(reg.ID, commodityID, now))
		}
		alertsCacheMu.Lock()
		alertsCache[key] = res
		alertsCacheMu.Unlock()
	}
	writeJSON(w, http.StatusOK, res)
}

// handleModelMetricsV2 serves the out-of-sample comparison of the v2 forecaster with FHS.
func handleModelMetricsV2(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, regional.V2Report)
}

// handleModelMetrics serves the walk-forward backtest of the FHS forecaster, one report per scope.
func handleModelMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, regional.Backtest())
}
