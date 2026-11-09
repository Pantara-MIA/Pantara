package decision

import (
	"math"
)

type DecisionResult struct {
	KgToBuy          float64 `json:"kg_to_buy"`
	WeeksCovered     int     `json:"weeks_covered"`
	PotentialSavings float64 `json:"potential_savings"`
	LossProbability  float64 `json:"loss_probability"`
	MaxLoss          float64 `json:"max_loss"`

	// ── Open breakdown ───────────────────────────────────────────────────────
	// Every intermediate number is exposed so the UI can show where the
	// recommendation comes from, not just the final answer.

	WeeklyUsageKg  float64 `json:"weekly_usage_kg"`  // D — user input (kg/week)
	DailyDecayRate float64 `json:"daily_decay_rate"` // s — from the storage method
	ShelfLifeDays  int     `json:"shelf_life_days"`  // L — storage method limit

	KgWeek1  float64 `json:"kg_week1"`  // D / (1-s)^3.5
	KgWeek2  float64 `json:"kg_week2"`  // D / (1-s)^10.5
	KgBulk   float64 `json:"kg_bulk"`   // KgWeek1 + KgWeek2
	MarginKg float64 `json:"margin_kg"` // KgWeek1 - D, decay buffer weight

	CurrentPrice      float64 `json:"current_price"`
	ExpectedNextPrice float64 `json:"expected_next_price"` // mean of next week's P10/P50/P90

	WeeklyCost float64 `json:"weekly_cost"` // buy every week
	BulkCost   float64 `json:"bulk_cost"`   // buy 2 weeks up front

	BreakevenPrice   float64 `json:"breakeven_price"`    // next-week price that equalises both scenarios
	BreakevenRisePct float64 `json:"breakeven_rise_pct"` // % rise from current to breakeven price

	BulkLocked bool   `json:"bulk_locked"` // bulk buying rejected because of shelf life
	LockReason string `json:"lock_reason"`
}

// CalculateDecision runs the L3 inventory optimisation.
//
// It compares two procurement scenarios and picks the lower expected cost:
//
//	Weekly : buy 1 week now, buy another week next week at the forecast price
//	Bulk   : buy 2 weeks of need at once at today's price
//
// Bulk is only allowed when the kitchen storage method lasts 14 days.
func CalculateDecision(currentPrice, p10, p50, p90 float64, d float64, s float64, L int) DecisionResult {
	// Gross weight to buy so the net weight is still D after decay.
	// Exponents 3.5 and 10.5 are the average stock age in weeks 1 and 2.
	kg1 := d / math.Pow(1-s, 3.5)
	kg2 := d / math.Pow(1-s, 10.5)
	kgBulk := kg1 + kg2

	// Expected next-week price from the forecast quantiles.
	expFuture := (p10 + p50 + p90) / 3.0

	weeklyCost := kg1*currentPrice + kg1*expFuture
	bulkCost := kgBulk * currentPrice

	// Next-week price that makes both scenarios cost the same.
	// kg1*p_now + kg1*P* = kgBulk*p_now  →  P* = p_now * (kgBulk - kg1) / kg1
	breakeven := currentPrice * (kgBulk - kg1) / kg1
	breakevenRise := 0.0
	if currentPrice > 0 {
		breakevenRise = (breakeven/currentPrice - 1) * 100
	}

	bulkAllowed := L >= 14
	lockReason := ""
	if !bulkAllowed {
		lockReason = "Cara simpan Anda belum tahan 14 hari, sehingga borong 2 minggu tidak disarankan."
	}

	bestK := 1
	kgToBuy := kg1
	savings := bulkCost - weeklyCost

	if bulkAllowed && bulkCost < weeklyCost {
		bestK = 2
		kgToBuy = kgBulk
		savings = weeklyCost - bulkCost
	}

	// Decision risk comes from the forecast spread, not a fixed number.
	lossProb, maxLoss := computeRisk(bestK, kg1, kgBulk, currentPrice, p10, p50, p90, breakeven)

	return DecisionResult{
		KgToBuy:          math.Round(kgToBuy*10) / 10,
		WeeksCovered:     bestK,
		PotentialSavings: math.Round(math.Abs(savings)),
		LossProbability:  lossProb,
		MaxLoss:          math.Round(maxLoss),

		WeeklyUsageKg:  d,
		DailyDecayRate: s,
		ShelfLifeDays:  L,

		KgWeek1:  kg1,
		KgWeek2:  kg2,
		KgBulk:   kgBulk,
		MarginKg: kg1 - d,

		CurrentPrice:      currentPrice,
		ExpectedNextPrice: expFuture,

		WeeklyCost: math.Round(weeklyCost),
		BulkCost:   math.Round(bulkCost),

		BreakevenPrice:   breakeven,
		BreakevenRisePct: breakevenRise,

		BulkLocked: !bulkAllowed,
		LockReason: lockReason,
	}
}

// computeRisk estimates the probability that the decision misses and its worst
// loss, by fitting a lognormal distribution to the forecast quantiles.
func computeRisk(bestK int, kg1, kgBulk, currentPrice, p10, p50, p90, breakeven float64) (float64, float64) {
	if p10 <= 0 || p50 <= 0 || p90 <= 0 || breakeven <= 0 {
		return 0, 0
	}

	// P10 and P90 are 2 × 1.2816 standard deviations apart on the log scale.
	sigma := math.Log(p90/p10) / (2 * 1.2815515655446004)
	mu := math.Log(p50)
	if sigma <= 0 {
		return 0, 0
	}

	z := (math.Log(breakeven) - mu) / sigma
	// Probability that next week's price exceeds the breakeven price.
	probAboveBreakeven := 1 - phi(z)

	if bestK == 1 {
		// Weekly buying loses when next week's price rises past breakeven.
		maxLoss := kg1*p90 + kg1*currentPrice - kgBulk*currentPrice
		return clamp01(probAboveBreakeven), math.Max(0, maxLoss)
	}

	// Bulk buying loses when next week's price falls below breakeven.
	maxLoss := kgBulk*currentPrice - (kg1*currentPrice + kg1*p10)
	return clamp01(1 - probAboveBreakeven), math.Max(0, maxLoss)
}

// phi is the standard normal cumulative distribution function.
func phi(x float64) float64 {
	return 0.5 * (1 + math.Erf(x/math.Sqrt2))
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
