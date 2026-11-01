package regional

import (
	"fmt"
	"math"
	"sort"
)

// ─────────────────────────────────────────────────────────────────────────────
// Market-operation planning: when, where, and how to split a budget.
//
// Benefit measure — consumer overpayment. For region r and commodity c over the
// 14-day forecast window:
//   overpayment = Σ_h E[max(P_h − ref, 0)] × daily demand
//   daily demand = population × weekly per-capita consumption / 7
// i.e. the rupiah residents are expected to pay above HET/HAP (or the
// statistical reference) if nothing is done.
//
// Package — PackageShare of the region's 14-day demand, released at the
// reference price whenever the market price is above it. Per unit it costs the
// expected gap WHEN breaching, E[P − ref | P > ref] = Σ_h excess_h / Σ_h
// breach_h, plus distribution (DistributionRate × reference); plus a fixed
// OperationalCost per package.
//
// Effect (assumption, adjustable) — n packages avoid a fraction
//   1 − exp(−Effectiveness × PackageShare × n)
// of the overpayment: diminishing returns, capped at MaxCoverage of demand.
//
// Allocation — multiple-choice knapsack: pick n_i ≥ 0 packages per candidate to
// maximise Σ avoided overpayment subject to Σ cost ≤ budget, solved exactly by
// dynamic programming on a budget grid (costs rounded UP, so the plan never
// exceeds the budget).
//
// Timing — start = (first day breach probability ≥ 50%) − LeadTimeDays, or as
// soon as possible when the price is already above the reference.
// ─────────────────────────────────────────────────────────────────────────────

type PlanParams struct {
	BudgetIDR        float64 `json:"budget_idr"`
	LeadTimeDays     int     `json:"lead_time_days"`
	PackageShare     float64 `json:"package_share"`     // of 14-day local demand, e.g. 0.10
	Effectiveness    float64 `json:"effectiveness"`     // γ in 1 − exp(−γ·share·n)
	DistributionRate float64 `json:"distribution_rate"` // per-unit distribution cost as a share of the reference
	OperationalCost  float64 `json:"operational_cost"`  // fixed Rp per package
	MaxCoverage      float64 `json:"max_coverage"`      // cap on Σ packages as a share of demand
}

func DefaultPlanParams() PlanParams {
	return PlanParams{
		BudgetIDR:        2_000_000_000,
		LeadTimeDays:     3,
		PackageShare:     0.10,
		Effectiveness:    3,
		DistributionRate: 0.03,
		OperationalCost:  15_000_000,
		MaxCoverage:      0.6,
	}
}

// Validate returns a user-facing (Indonesian) error for out-of-range parameters.
func (p PlanParams) Validate() error {
	switch {
	case p.BudgetIDR < 0 || p.BudgetIDR > 1e13:
		return fmt.Errorf("Anggaran harus antara Rp 0 dan Rp 10 triliun.")
	case p.LeadTimeDays < 0 || p.LeadTimeDays > 10:
		return fmt.Errorf("Waktu persiapan harus 0–10 hari.")
	case p.PackageShare < 0.01 || p.PackageShare > 0.5:
		return fmt.Errorf("Ukuran paket harus 1–50%% kebutuhan 14 hari.")
	case p.Effectiveness <= 0 || p.Effectiveness > 10:
		return fmt.Errorf("Efektivitas harus antara 0 dan 10.")
	case p.DistributionRate < 0 || p.DistributionRate > 0.5:
		return fmt.Errorf("Biaya distribusi harus 0–50%% harga acuan.")
	case p.OperationalCost < 0 || p.OperationalCost > 1e10:
		return fmt.Errorf("Biaya operasional per paket tidak wajar.")
	case p.MaxCoverage < p.PackageShare || p.MaxCoverage > 1:
		return fmt.Errorf("Batas cakupan harus ≥ ukuran paket dan ≤ 100%%.")
	}
	return nil
}

type Window struct {
	Urgent       bool   `json:"urgent"`         // already above the reference
	DaysToBreach int    `json:"days_to_breach"` // 0 when no horizon reaches 50%
	StartDate    string `json:"start_date"`
	PeakDate     string `json:"peak_date"` // horizon with the largest expected excess
}

type Candidate struct {
	RegionID       string  `json:"region_id"`
	CommodityID    string  `json:"commodity_id"`
	Status         string  `json:"status"`
	CurrentPrice   float64 `json:"current_price"`
	Reference      float64 `json:"reference"`
	Overpayment    float64 `json:"overpayment"`   // Rp over the 14-day window, no action
	DemandUnits    float64 `json:"demand_units"`  // 14-day local demand (kg or liter)
	PackageUnits   float64 `json:"package_units"` // volume of one package
	PackageCost    float64 `json:"package_cost"`  // Rp per package
	MaxPackages    int     `json:"max_packages"`
	SubsidyPerUnit float64 `json:"subsidy_per_unit"` // Rp per kg/liter, incl. distribution
	Window         Window  `json:"window"`
}

type Allocation struct {
	Candidate
	Packages      int     `json:"packages"`
	VolumeUnits   float64 `json:"volume_units"`
	Cost          float64 `json:"cost"`
	Avoided       float64 `json:"avoided"`        // Rp of overpayment avoided
	AvoidedShare  float64 `json:"avoided_share"`  // of this candidate's overpayment
	MarginalRatio float64 `json:"marginal_ratio"` // Rp avoided per Rp spent on the last package
}

type FrontierPoint struct {
	Budget  float64 `json:"budget"`
	Avoided float64 `json:"avoided"`
}

type Plan struct {
	AsOf        string          `json:"as_of"`
	Params      PlanParams      `json:"params"`
	Spent       float64         `json:"spent"`
	Overpayment float64         `json:"overpayment"` // Σ over all candidates, no action
	Avoided     float64         `json:"avoided"`
	Allocations []Allocation    `json:"allocations"`
	Unfunded    []Candidate     `json:"unfunded"`
	Frontier    []FrontierPoint `json:"frontier"`
	// Candidates considered (after the cap) and found in the jurisdiction.
	CandidateCount int `json:"candidate_count"`
}

const (
	planHorizonDays   = MaxHorizon
	maxPlanCandidates = 80   // keeps the DP small for province-wide plans
	maxBudgetCells    = 2000 // DP grid resolution
	minOverpayment    = 1_000_000
)

func windowOf(f Forecast, a Alert, lead int) Window {
	w := Window{Urgent: a.Status == StatusAbove, DaysToBreach: a.DaysToBreach}
	peak, best := 1, -1.0
	for _, pt := range f.Points {
		if pt.ExpectedExcess > best {
			best, peak = pt.ExpectedExcess, pt.Horizon
		}
	}
	w.PeakDate = addDays(f.AsOf, peak)
	start := 1
	switch {
	case w.Urgent:
		start = 1
	case a.DaysToBreach > 0:
		start = max(1, a.DaysToBreach-lead)
	default:
		start = max(1, peak-lead)
	}
	w.StartDate = addDays(f.AsOf, start)
	return w
}

// PlanCandidates lists every region × commodity in regionIDs with a material
// expected overpayment, largest first.
func PlanCandidates(regionIDs []string, now int, p PlanParams) []Candidate {
	var out []Candidate
	for _, rid := range regionIDs {
		reg, ok := FindRegion(rid)
		if !ok {
			continue
		}
		for _, c := range Commodities {
			f, ok := ComputeForecast(rid, c.ID, now)
			if !ok {
				continue
			}
			daily := float64(reg.Population) * c.WeeklyPerCapita / 7
			var excess, breach float64
			for _, pt := range f.Points {
				excess += pt.ExpectedExcess
				breach += pt.BreachProb
			}
			overpay := excess * daily
			if overpay < minOverpayment {
				continue
			}
			subsidy := p.DistributionRate * f.Reference
			if breach > 0 {
				subsidy += excess / breach // conditional mean gap when above the reference
			}
			demand := daily * planHorizonDays
			units := p.PackageShare * demand
			a := ComputeAlert(f)
			out = append(out, Candidate{
				RegionID:       rid,
				CommodityID:    c.ID,
				Status:         a.Status,
				CurrentPrice:   f.CurrentPrice,
				Reference:      f.Reference,
				Overpayment:    math.Round(overpay),
				DemandUnits:    math.Round(demand),
				PackageUnits:   math.Round(units),
				PackageCost:    math.Round(units*subsidy + p.OperationalCost),
				MaxPackages:    int(math.Floor(p.MaxCoverage/p.PackageShare + 1e-9)),
				SubsidyPerUnit: math.Round(subsidy),
				Window:         windowOf(f, a, p.LeadTimeDays),
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Overpayment > out[j].Overpayment })
	return out
}

// avoidedBy is the overpayment avoided by n packages of candidate c.
func avoidedBy(c Candidate, n int, p PlanParams) float64 {
	return c.Overpayment * (1 - math.Exp(-p.Effectiveness*p.PackageShare*float64(n)))
}

// BuildPlan allocates the budget over the candidates of regionIDs at day index now.
func BuildPlan(regionIDs []string, now int, p PlanParams) Plan {
	cands := PlanCandidates(regionIDs, now, p)
	if len(cands) > maxPlanCandidates {
		cands = cands[:maxPlanCandidates]
	}
	return allocate(cands, p, dates[now])
}

// allocate solves the multiple-choice knapsack over cands.
func allocate(cands []Candidate, p PlanParams, asOf string) Plan {
	plan := Plan{AsOf: asOf, Params: p, Allocations: []Allocation{}, Unfunded: []Candidate{}, Frontier: []FrontierPoint{}}
	plan.CandidateCount = len(cands)
	for _, c := range cands {
		plan.Overpayment += c.Overpayment
	}
	if len(cands) == 0 || p.BudgetIDR <= 0 {
		plan.Unfunded = cands
		return plan
	}

	// Budget grid: costs are rounded UP to whole cells.
	cell := math.Max(1_000_000, math.Ceil(p.BudgetIDR/maxBudgetCells))
	cells := int(math.Floor(p.BudgetIDR / cell))
	cost := make([]int, len(cands))
	for i, c := range cands {
		cost[i] = int(math.Ceil(c.PackageCost / cell))
		if cost[i] == 0 {
			cost[i] = 1
		}
	}

	// dp[j] = best avoided overpayment using at most j cells; choice[i][j] = packages of item i.
	dp := make([]float64, cells+1)
	choice := make([][]uint8, len(cands))
	for i, c := range cands {
		next := make([]float64, cells+1)
		choice[i] = make([]uint8, cells+1)
		for j := 0; j <= cells; j++ {
			best, bestN := dp[j], 0
			for n := 1; n <= c.MaxPackages && n*cost[i] <= j; n++ {
				if v := dp[j-n*cost[i]] + avoidedBy(c, n, p); v > best+1e-6 {
					best, bestN = v, n
				}
			}
			next[j], choice[i][j] = best, uint8(bestN)
		}
		dp = next
	}

	// Reconstruct from the full budget.
	j := cells
	picked := make([]int, len(cands))
	for i := len(cands) - 1; i >= 0; i-- {
		picked[i] = int(choice[i][j])
		j -= picked[i] * cost[i]
	}
	for i, c := range cands {
		n := picked[i]
		if n == 0 {
			plan.Unfunded = append(plan.Unfunded, c)
			continue
		}
		avoided := avoidedBy(c, n, p)
		lastGain := avoided - avoidedBy(c, n-1, p)
		a := Allocation{
			Candidate:     c,
			Packages:      n,
			VolumeUnits:   c.PackageUnits * float64(n),
			Cost:          c.PackageCost * float64(n),
			Avoided:       math.Round(avoided),
			AvoidedShare:  round(avoided/c.Overpayment, 3),
			MarginalRatio: round(lastGain/c.PackageCost, 2),
		}
		plan.Spent += a.Cost
		plan.Avoided += a.Avoided
		plan.Allocations = append(plan.Allocations, a)
	}
	sort.SliceStable(plan.Allocations, func(a, b int) bool { return plan.Allocations[a].Avoided > plan.Allocations[b].Avoided })

	// Efficient frontier: best achievable avoidance for budgets up to the chosen one.
	const points = 24
	for k := 0; k <= points; k++ {
		jk := cells * k / points
		plan.Frontier = append(plan.Frontier, FrontierPoint{Budget: float64(jk) * cell, Avoided: math.Round(dp[jk])})
	}
	return plan
}
