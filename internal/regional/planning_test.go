package regional

import (
	"math"
	"testing"
)

// bruteForce enumerates every package combination (tiny instances only).
func bruteForce(cands []Candidate, p PlanParams) float64 {
	best := 0.0
	var walk func(i int, spent, value float64)
	walk = func(i int, spent, value float64) {
		if i == len(cands) {
			best = math.Max(best, value)
			return
		}
		for n := 0; n <= cands[i].MaxPackages; n++ {
			c := spent + float64(n)*cands[i].PackageCost
			if c > p.BudgetIDR {
				break
			}
			walk(i+1, c, value+avoidedBy(cands[i], n, p))
		}
	}
	walk(0, 0, 0)
	return best
}

func TestAllocateMatchesBruteForce(t *testing.T) {
	p := DefaultPlanParams()
	p.BudgetIDR = 500_000_000
	// Costs are whole millions so the DP grid (1 juta cells) is exact.
	cands := []Candidate{
		{RegionID: "a", Overpayment: 900_000_000, PackageCost: 120_000_000, MaxPackages: 6},
		{RegionID: "b", Overpayment: 400_000_000, PackageCost: 40_000_000, MaxPackages: 6},
		{RegionID: "c", Overpayment: 250_000_000, PackageCost: 75_000_000, MaxPackages: 6},
		{RegionID: "d", Overpayment: 60_000_000, PackageCost: 10_000_000, MaxPackages: 6},
	}
	plan := allocate(cands, p, "2026-08-28")
	want := bruteForce(cands, p)
	if math.Abs(plan.Avoided-want) > 4 { // per-allocation rounding to whole rupiah
		t.Fatalf("DP avoided %.0f, brute force %.0f", plan.Avoided, want)
	}
	if plan.Spent > p.BudgetIDR {
		t.Fatalf("spent %.0f over budget %.0f", plan.Spent, p.BudgetIDR)
	}
}

func TestBuildPlanInvariants(t *testing.T) {
	var all []string
	jabar, _ := FindScope(ScopeJabar)
	for _, r := range jabar.Regions {
		all = append(all, r.ID)
	}
	p := DefaultPlanParams()
	plan := BuildPlan(all, DateIndex("2026-03-15"), p)
	if plan.CandidateCount == 0 || len(plan.Allocations) == 0 {
		t.Fatalf("expected candidates and allocations, got %+v", plan)
	}
	if plan.Spent > p.BudgetIDR {
		t.Errorf("spent %.0f over budget %.0f", plan.Spent, p.BudgetIDR)
	}
	if plan.Avoided > plan.Overpayment {
		t.Errorf("avoided %.0f exceeds overpayment %.0f", plan.Avoided, plan.Overpayment)
	}
	for i := 1; i < len(plan.Frontier); i++ {
		if plan.Frontier[i].Avoided < plan.Frontier[i-1].Avoided {
			t.Errorf("frontier not monotone at %d", i)
		}
	}
	for _, a := range plan.Allocations {
		if a.Packages > a.MaxPackages || a.Window.StartDate <= plan.AsOf {
			t.Errorf("bad allocation %+v", a)
		}
	}
	t.Logf("candidates %d, allocations %d, spent Rp %.0f of %.0f, avoided Rp %.0f of %.0f (%.0f%%)",
		plan.CandidateCount, len(plan.Allocations), plan.Spent, p.BudgetIDR, plan.Avoided, plan.Overpayment, plan.Avoided/plan.Overpayment*100)
	for _, a := range plan.Allocations[:min(6, len(plan.Allocations))] {
		t.Logf("  %-18s %-22s %s n=%d vol=%.0f cost=%.0f avoided=%.0f (%.0f%%) start %s peak %s",
			a.RegionID, a.CommodityID, a.Status, a.Packages, a.VolumeUnits, a.Cost, a.Avoided, a.AvoidedShare*100, a.Window.StartDate, a.Window.PeakDate)
	}

	zero := p
	zero.BudgetIDR = 0
	if z := BuildPlan(all, DateIndex("2026-03-15"), zero); len(z.Allocations) != 0 || z.Spent != 0 {
		t.Errorf("zero budget must allocate nothing")
	}
}
