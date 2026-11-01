package regional

import (
	"os"
	"testing"
)

func init() {
	Init(os.DirFS("../.."))
}

func TestDetectEpisodes(t *testing.T) {
	saved := dates
	defer func() { dates = saved }()
	dates = dateRange("2026-01-01", "2026-01-12")

	ref := []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100}
	//               0    1    2    3    4    5    6    7    8    9   10   11
	p := []float64{90, 110, 130, 120, 95, 105, 106, 90, 101, 102, 103, 104}
	// Days 1–3: a 3-day episode peaking on day 2, recovered on day 4 → 2 days.
	// Days 5–6: only 2 days, not an episode.
	// Days 8–11: still ongoing at the period end.
	eps := detectEpisodes(p, ref, 0, 11)
	if len(eps) != 2 {
		t.Fatalf("want 2 episodes, got %d: %+v", len(eps), eps)
	}
	if e := eps[0]; e.DurationDays != 3 || e.RecoveryDays != 2 || e.Peak != "2026-01-03" || e.Ongoing {
		t.Errorf("first episode wrong: %+v", e)
	}
	if e := eps[1]; e.DurationDays != 4 || !e.Ongoing || e.RecoveryDays != 0 {
		// The peak (104) is on the last day, so recovery-so-far is 0.
		t.Errorf("second episode wrong: %+v", e)
	}

	// Period covering days 6–11 only: the first episode (ends day 3) does not overlap.
	if eps := detectEpisodes(p, ref, 6, 11); len(eps) != 1 {
		t.Errorf("want 1 overlapping episode, got %d", len(eps))
	}
}

func TestForecastOrdered(t *testing.T) {
	for _, c := range []string{"cabai-rawit-merah", "beras-medium"} {
		f, ok := ComputeForecast("kota-bandung", c, len(dates)-1)
		if !ok || len(f.Points) != MaxHorizon {
			t.Fatalf("%s: incomplete forecast", c)
		}
		for _, pt := range f.Points {
			if !(pt.P10 <= pt.P50 && pt.P50 <= pt.P90) {
				t.Errorf("%s h=%d: quantiles out of order %+v", c, pt.Horizon, pt)
			}
			if pt.BreachProb < 0 || pt.BreachProb > 1 {
				t.Errorf("%s h=%d: probability outside 0..1", c, pt.Horizon)
			}
		}
	}
}

func TestScorecardCalibration(t *testing.T) {
	for _, id := range []string{ScopeNational, ScopeJabar, "jawa-tengah"} {
		s, ok := FindScope(id)
		if !ok {
			t.Fatalf("missing scope %s", id)
		}
		t.Run(s.ID, func(t *testing.T) { checkCalibration(t, s) })
	}
}

func checkCalibration(t *testing.T, s *Scope) {
	spread := map[string]int{}
	for _, month := range Months()[3:] {
		sc, err := ComputeScorecard(s.ID, month, "")
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range sc {
			spread[r.Grade]++
		}
	}
	t.Logf("grade spread across all months: %v", spread)

	sc, _ := ComputeScorecard(s.ID, "2026-08", "")
	for _, r := range sc {
		comp := -1.0
		if r.Compliance != nil {
			comp = *r.Compliance
		}
		t.Logf("%2d %-26s score %5.1f %s  days>normal %3d  episodes %2d  affected %2d  compliance %5.1f%%",
			r.Rank, r.RegionID, r.Score, r.Grade, r.DaysAboveNormalTotal, r.EpisodesTotal, r.CommoditiesAffected, comp)
	}
	for _, id := range s.Commodities {
		c, _ := FindCommodity(id)
		sc, _ := ComputeScorecard(s.ID, "2026-01", c.ID)
		above, ceiling := 0, 0
		for _, r := range sc {
			above += r.DaysAboveNormalTotal
			ceiling += r.DaysAboveCeilingTotal
		}
		days := float64(len(sc) * 31)
		t.Logf("2026-01 %-22s %-8s days>normal %4.1f%%  days>ceiling %5.1f%% (%d regions)", c.ID, c.Reference.Type, float64(above)/days*100, float64(ceiling)/days*100, len(sc))
	}
	if len(spread) < 3 {
		t.Errorf("grades too uniform: %v", spread)
	}
}

func TestBacktestReport(t *testing.T) {
	for i, rep := range Backtest() {
		s := Scopes[i]
		if len(rep.Rows) != len(s.Commodities)*len(BacktestHorizons) {
			t.Fatalf("%s: want %d rows, got %d", s.ID, len(s.Commodities)*len(BacktestHorizons), len(rep.Rows))
		}
		logBacktest(t, rep)
	}
}

func TestHierarchy(t *testing.T) {
	if !Covers(ScopeNational, "kota-bandung") || !Covers(ScopeJabar, "kota-bandung") || !Covers("kota-bandung", "kota-bandung") {
		t.Error("national and provincial jurisdictions must cover their regencies")
	}
	if Covers(ScopeJabar, "jawa-timur") || Covers("kota-bandung", "kab-bandung") {
		t.Error("jurisdictions must not leak sideways")
	}
	if r, _ := FindRegion("jawa-barat"); r.ChildScope != ScopeJabar || r.Scope != ScopeNational {
		t.Errorf("jawa-barat must drill into the Jabar scope: %+v", r)
	}
	regencies := 0
	for _, p := range Provinces {
		r, _ := FindRegion(p.ID)
		child, ok := FindScope(r.ChildScope)
		if !ok {
			t.Errorf("%s has no regency scope", p.ID)
			continue
		}
		regencies += len(child.Regions)
	}
	if regencies != 514 {
		t.Errorf("want 514 regencies/cities, got %d", regencies)
	}
	if !Covers("jawa-tengah", "kota-semarang") || Covers("jawa-tengah", "kota-surabaya") {
		t.Error("province jurisdictions must cover exactly their regencies")
	}
	for _, s := range Scopes {
		for _, r := range s.Regions {
			for _, n := range r.Neighbors {
				nb, ok := FindRegion(n)
				if !ok || nb.Scope != s.ID {
					t.Errorf("%s: neighbour %s outside scope", r.ID, n)
				}
			}
		}
	}
}

func logBacktest(t *testing.T, rep BacktestReport) {
	var cov, mase float64
	for _, r := range rep.Rows {
		if r.Coverage < 0 || r.Coverage > 1 || r.MASE <= 0 {
			t.Errorf("implausible row %+v", r)
		}
		cov += r.Coverage
		mase += r.MASE
	}
	n := float64(len(rep.Rows))
	t.Logf("backtest %s %s..%s: mean coverage %.3f, mean MASE %.3f over %d rows", rep.Scope, rep.From, rep.To, cov/n, mase/n, len(rep.Rows))
	for _, r := range rep.Rows[:min(6, len(rep.Rows))] {
		t.Logf("  %-22s h=%-2d n=%d MASE %.3f coverage %.3f width %.3f", r.CommodityID, r.Horizon, r.Samples, r.MASE, r.Coverage, r.BandWidth)
	}
}
