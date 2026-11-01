package substitution

import (
	"math"
	"sort"
)

type SubstitutionResult struct {
	// Active marks that the signal is really on. The result is still returned
	// when inactive so the UI can show that monitoring is running.
	Active         bool    `json:"active"`
	Recommendation string  `json:"recommendation"`
	Savings        float64 `json:"savings"`
	Reason         string  `json:"reason"`

	// Evidence so the UI can explain where the numbers come from.
	Z           float64 `json:"z"`
	Threshold   float64 `json:"threshold"`
	SourcePrice float64 `json:"source_price"`
	AltPrice    float64 `json:"alt_price"`
	DiffPerKg   float64 `json:"diff_per_kg"`
	Ratio       float64 `json:"ratio"`
	RatioMedian float64 `json:"ratio_median"`
	RatioSD     float64 `json:"ratio_sd"`
	KgUsed      float64 `json:"kg_used"`
	Date        string  `json:"date"`
}

const (
	zThreshold = 2.4
	window     = 90
)

// CheckSubstitution monitors the price ratio of two functionally equivalent
// variants, A (in use) and B (named nameB). dates, a and b are aligned daily
// series up to the as-of day (last element).
//
// The signal is only active when both conditions hold:
//  1. The A/B price ratio deviates at least 2.4 standard deviations ABOVE its
//     90-day median — A is unusually expensive relative to B.
//  2. B is actually cheaper than A today.
//
// The second condition matters: a large deviation the other way (negative z)
// means A is cheap, so suggesting a switch to B would add cost, not save it.
func CheckSubstitution(nameB string, dates []string, a, b []float64, kgToBuy float64) *SubstitutionResult {
	n := min(len(dates), len(a), len(b))
	if n < window {
		return nil
	}
	ratios := make([]float64, window)
	for i := range window {
		pb := b[n-window+i]
		if pb <= 0 {
			return nil
		}
		ratios[i] = a[n-window+i] / pb
	}

	sorted := append([]float64(nil), ratios...)
	sort.Float64s(sorted)
	median90 := (sorted[window/2-1] + sorted[window/2]) / 2.0

	var sum float64
	for _, r := range ratios {
		sum += r
	}
	mean := sum / window
	var variance float64
	for _, r := range ratios {
		variance += math.Pow(r-mean, 2)
	}
	sd90 := math.Sqrt(variance / (window - 1))
	if sd90 == 0 {
		return nil
	}

	pa, pb := a[n-1], b[n-1]
	currentRatio := ratios[window-1]
	z := (currentRatio - median90) / sd90

	// One-directional signal only: A unusually expensive AND B actually cheaper.
	active := z >= zThreshold && pb < pa
	diff := pa - pb

	reason := "Rasio harga menyimpang jauh di atas kebiasaan 90 hari terakhir"
	savings := diff * kgToBuy
	if !active {
		savings = 0
		switch {
		case pb >= pa:
			reason = "Varian ini sedang tidak lebih murah, sehingga beralih justru menambah biaya"
		default:
			reason = "Rasio harga masih dalam kebiasaan 90 hari terakhir"
		}
	}

	return &SubstitutionResult{
		Active:         active,
		Recommendation: nameB,
		Savings:        savings,
		Reason:         reason,
		Z:              z,
		Threshold:      zThreshold,
		SourcePrice:    pa,
		AltPrice:       pb,
		DiffPerKg:      diff,
		Ratio:          currentRatio,
		RatioMedian:    median90,
		RatioSD:        sd90,
		KgUsed:         kgToBuy,
		Date:           dates[n-1],
	}
}
