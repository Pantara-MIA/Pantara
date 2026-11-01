package regional

import "math"

// ─────────────────────────────────────────────────────────────────────────────
// Indicative impact evaluation of a market intervention.
//
// The forecast frozen at the baseline date is the counterfactual ("what prices
// were expected to do"). Over the forecast window after the baseline we compare
//   • actual price vs the frozen P50 (gap vs forecast), and
//   • the region's price change vs its neighbours' median change over the same
//     window (a difference-in-differences style control for province-wide moves).
// Both are indicative only: they do not prove causality.
// ─────────────────────────────────────────────────────────────────────────────

const (
	EvaluationPending  = "pending"  // no observed day after the baseline yet
	EvaluationPartial  = "partial"  // some, not all, forecast days observed
	EvaluationComplete = "complete" // the whole forecast window observed
)

type EvaluationPoint struct {
	Date      string  `json:"date"`
	Actual    float64 `json:"actual,omitempty"`
	P10       float64 `json:"p10"`
	P50       float64 `json:"p50"`
	P90       float64 `json:"p90"`
	Reference float64 `json:"reference"`
}

type Evaluation struct {
	Status          string  `json:"status"`
	ObservedDays    int     `json:"observed_days"`
	WindowDays      int     `json:"window_days"`
	PriceAtBaseline float64 `json:"price_at_baseline"`
	PriceAtLatest   float64 `json:"price_at_latest,omitempty"`
	// Mean of (actual / frozen P50 − 1) over observed days, in %. Negative means
	// prices came in below what was forecast.
	GapVsForecastPct float64 `json:"gap_vs_forecast_pct"`
	// Share of observed days where the actual price stayed inside P10–P90.
	WithinBandShare   float64 `json:"within_band_share"`
	RegionChangePct   float64 `json:"region_change_pct"`
	NeighborChangePct float64 `json:"neighbor_change_pct"`
	// RegionChangePct − NeighborChangePct, in percentage points.
	RelativeChangePct float64           `json:"relative_change_pct"`
	DaysAboveBefore   int               `json:"days_above_before"`
	DaysAboveAfter    int               `json:"days_above_after"`
	Series            []EvaluationPoint `json:"series"`
}

// EvaluateIntervention scores what happened after baseline against the frozen forecast.
func EvaluateIntervention(regionID, commodityID, baseline string, frozen Forecast) Evaluation {
	ev := Evaluation{Status: EvaluationPending, WindowDays: len(frozen.Points), Series: []EvaluationPoint{}}
	s, ok := regionHome[regionID]
	if !ok {
		return ev
	}
	p := s.Prices(regionID, commodityID)
	ref := s.Reference(regionID, commodityID)
	b := DateIndex(baseline)
	if p == nil || b < 0 || dates[b] != baseline {
		return ev
	}
	ev.PriceAtBaseline = p[b]

	// Days above reference in the window before the baseline, for context.
	for t := max(0, b-ev.WindowDays+1); t <= b; t++ {
		if p[t] > ref[t] {
			ev.DaysAboveBefore++
		}
	}

	last := b
	var gapSum float64
	var within int
	for _, fp := range frozen.Points {
		pt := EvaluationPoint{Date: fp.Date, P10: fp.P10, P50: fp.P50, P90: fp.P90, Reference: frozen.Reference}
		t := b + fp.Horizon
		if t < len(p) && dates[t] == fp.Date {
			pt.Actual = p[t]
			pt.Reference = ref[t]
			ev.ObservedDays++
			gapSum += p[t]/fp.P50 - 1
			if p[t] >= fp.P10 && p[t] <= fp.P90 {
				within++
			}
			if p[t] > ref[t] {
				ev.DaysAboveAfter++
			}
			last = t
		}
		ev.Series = append(ev.Series, pt)
	}
	if ev.ObservedDays == 0 {
		return ev
	}
	ev.Status = EvaluationPartial
	if ev.ObservedDays == ev.WindowDays {
		ev.Status = EvaluationComplete
	}
	n := float64(ev.ObservedDays)
	ev.PriceAtLatest = p[last]
	ev.GapVsForecastPct = round(gapSum/n*100, 1)
	ev.WithinBandShare = round(float64(within)/n, 2)
	ev.RegionChangePct = round((p[last]/p[b]-1)*100, 1)
	if nb, nl := s.NeighborMedian(regionID, commodityID, b), s.NeighborMedian(regionID, commodityID, last); nb > 0 && nl > 0 {
		ev.NeighborChangePct = round((nl/nb-1)*100, 1)
	} else {
		// No neighbours with data: fall back to the scope median.
		med := s.Median(commodityID)
		ev.NeighborChangePct = round((med[last]/med[b]-1)*100, 1)
	}
	ev.RelativeChangePct = round(ev.RegionChangePct-ev.NeighborChangePct, 1)
	if math.IsNaN(ev.GapVsForecastPct) {
		ev.GapVsForecastPct = 0
	}
	return ev
}
