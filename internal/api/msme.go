package api

import (
	"encoding/json"
	"net/http"
	"pantara/internal/decision"
	"pantara/internal/regional"
	"pantara/internal/substitution"
	"strings"
)

// defaultMSMERegion is used for profiles created before businesses chose a
// regency/city (the seed markets are all in South/East Jakarta).
const defaultMSMERegion = "kota-jakarta-selatan"

type RecommendRequest struct {
	// Commodity is the name stored in the business profile; CommodityID, when
	// given, takes precedence.
	Commodity      string  `json:"commodity"`
	CommodityID    string  `json:"commodity_id"`
	RegionID       string  `json:"region_id"`
	WeeklyUsageKg  float64 `json:"weekly_usage_kg"`
	DailyDecayRate float64 `json:"daily_decay_rate"` // e.g. 0.02 (2% / day)
	ShelfLifeDays  int     `json:"shelf_life_days"`  // e.g. 14 days
	AsOf           string  `json:"as_of"`            // time machine: YYYY-MM-DD; default the last day
}

type RecommendResponse struct {
	Commodity   string `json:"commodity"`
	CommodityID string `json:"commodity_id"`
	RegionID    string `json:"region_id"`
	RegionName  string `json:"region_name"`
	// Province is kept for older clients; it now holds the region name.
	Province      string    `json:"province"`
	Source        string    `json:"source"`
	SourceLabel   string    `json:"source_label"`
	Model         string    `json:"model"`
	DateRange     DateRange `json:"date_range"`
	AsOf          string    `json:"as_of"`
	CurrentPrice  float64   `json:"current_price"`
	Reference     float64   `json:"reference"`
	ReferenceType string    `json:"reference_type"`
	BreachProb14  float64   `json:"breach_prob_14"`
	P7_10         float64   `json:"p7_10"`
	P7_50         float64   `json:"p7_50"`
	P7_90         float64   `json:"p7_90"`
	P14_10        float64   `json:"p14_10"`
	P14_50        float64   `json:"p14_50"`
	P14_90        float64   `json:"p14_90"`

	Decision     decision.DecisionResult          `json:"decision"`
	Substitution *substitution.SubstitutionResult `json:"substitution,omitempty"`
	// Every substitution candidate checked, including inactive ones, so the UI
	// can explain why the signal is quiet.
	SubstitutionCandidates []SubstitutionCandidate `json:"substitution_candidates"`
	History                []PriceAt               `json:"history"`
}

// SubstitutionCandidate summarises the check of one variant pair.
type SubstitutionCandidate struct {
	Commodity string                           `json:"commodity"`
	Active    bool                             `json:"active"`
	Detail    *substitution.SubstitutionResult `json:"detail,omitempty"`
}

// PriceAt is one day of market price for the history chart.
type PriceAt struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

const msmeHistoryDays = 90

// commodityFor resolves a commodity by ID, or by its profile name; names like
// "Cabai Merah Besar" match "Cabai Merah Besar (TW)".
func commodityFor(id, name string) (regional.Commodity, bool) {
	if c, ok := regional.FindCommodity(id); ok {
		return c, true
	}
	want := strings.ToLower(strings.TrimSpace(name))
	for _, c := range regional.Commodities {
		full := strings.ToLower(c.Name)
		short, _, _ := strings.Cut(full, " (")
		if want == full || want == short {
			return c, true
		}
	}
	return regional.Commodity{}, false
}

// equivalentVariants maps a commodity to variants with the same kitchen function.
//
// Ethics guard: only variants of equal quality are paired. The system never
// suggests downgrading the grade of the same staple.
func equivalentVariants(commodityID string) []string {
	switch commodityID {
	case "cabai-rawit-merah":
		return []string{"cabai-rawit-hijau", "cabai-merah-keriting"}
	case "cabai-rawit-hijau":
		return []string{"cabai-rawit-merah"}
	case "cabai-merah-keriting":
		return []string{"cabai-merah-besar", "cabai-rawit-merah"}
	case "cabai-merah-besar":
		return []string{"cabai-merah-keriting"}
	}
	return nil
}

// handleProcurementCard runs the MSME buying decision on the regional price
// series of the business's regency/city: today's price, the 7/14-day forecast
// (v2 or FHS), the buy-weekly-vs-bulk decision and the variant switch signal.
func handleProcurementCard(w http.ResponseWriter, r *http.Request) {
	var req RecommendRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Permintaan tidak valid.")
		return
	}
	com, ok := commodityFor(req.CommodityID, req.Commodity)
	if !ok {
		writeError(w, http.StatusBadRequest, "Komoditas tidak dikenal.")
		return
	}
	if req.RegionID == "" {
		req.RegionID = defaultMSMERegion
	}
	reg, ok := regional.FindRegion(req.RegionID)
	if !ok {
		writeError(w, http.StatusBadRequest, "Daerah tidak dikenal.")
		return
	}
	scope, _ := regional.ScopeOf(reg.ID)
	prices := scope.Prices(reg.ID, com.ID)
	if prices == nil {
		writeError(w, http.StatusNotFound, "Belum ada data harga "+com.Name+" untuk "+reg.Name+".")
		return
	}

	dates := regional.Dates()
	now := len(dates) - 1
	if req.AsOf != "" {
		if now = regional.DateIndex(req.AsOf); now < 0 {
			now = 0
		}
	}
	f, _ := regional.ComputeForecast(reg.ID, com.ID, now)
	p7, p14 := f.Points[6], f.Points[13]
	current := prices[now]

	dec := decision.CalculateDecision(current, p7.P10, p7.P50, p7.P90, req.WeeklyUsageKg, req.DailyDecayRate, req.ShelfLifeDays)

	// Variant switch: check every functionally equivalent variant, not just one pair.
	var sub *substitution.SubstitutionResult
	candidates := []SubstitutionCandidate{}
	for _, altID := range equivalentVariants(com.ID) {
		alt, _ := regional.FindCommodity(altID)
		altPrices := scope.Prices(reg.ID, altID)
		if altPrices == nil {
			continue
		}
		result := substitution.CheckSubstitution(alt.Name, dates[:now+1], prices[:now+1], altPrices[:now+1], dec.KgToBuy)
		if result == nil {
			continue
		}
		candidates = append(candidates, SubstitutionCandidate{Commodity: alt.Name, Active: result.Active, Detail: result})
		// Keep the active signal with the largest savings.
		if result.Active && (sub == nil || result.Savings > sub.Savings) {
			sub = result
		}
	}

	history := []PriceAt{}
	for t := max(0, now-msmeHistoryDays+1); t <= now; t++ {
		history = append(history, PriceAt{Date: dates[t], Price: prices[t]})
	}

	source, refType := scope.SeriesInfo(reg.ID, com.ID)
	start, end := regional.DateBounds()
	writeJSON(w, http.StatusOK, RecommendResponse{
		Commodity:              com.Name,
		CommodityID:            com.ID,
		RegionID:               reg.ID,
		RegionName:             reg.Name,
		Province:               reg.Name,
		Source:                 source,
		SourceLabel:            regional.SourceLabel(source),
		Model:                  f.Model,
		DateRange:              DateRange{Start: start, End: end},
		AsOf:                   dates[now],
		CurrentPrice:           current,
		Reference:              f.Reference,
		ReferenceType:          refType,
		BreachProb14:           p14.BreachProb,
		P7_10:                  p7.P10,
		P7_50:                  p7.P50,
		P7_90:                  p7.P90,
		P14_10:                 p14.P10,
		P14_50:                 p14.P50,
		P14_90:                 p14.P90,
		Decision:               dec,
		Substitution:           sub,
		SubstitutionCandidates: candidates,
		History:                history,
	})
}
