package regional

import "testing"

func TestEvaluateIntervention(t *testing.T) {
	last := len(dates) - 1

	// Baseline on the last day: nothing observed yet.
	f, _ := ComputeForecast("kab-bandung", "beras-medium", last)
	if ev := EvaluateIntervention("kab-bandung", "beras-medium", dates[last], f); ev.Status != EvaluationPending || ev.ObservedDays != 0 {
		t.Errorf("baseline at data end: want pending, got %s (%d days)", ev.Status, ev.ObservedDays)
	}

	// Baseline a month earlier: the whole 14-day window is observed.
	b := last - 30
	f, _ = ComputeForecast("kab-bandung", "beras-medium", b)
	ev := EvaluateIntervention("kab-bandung", "beras-medium", dates[b], f)
	if ev.Status != EvaluationComplete || ev.ObservedDays != MaxHorizon || len(ev.Series) != MaxHorizon {
		t.Fatalf("want complete 14-day window, got %+v", ev)
	}
	p := Prices("kab-bandung", "beras-medium")
	wantChange := round((p[b+MaxHorizon]/p[b]-1)*100, 1)
	if ev.RegionChangePct != wantChange || ev.PriceAtBaseline != p[b] {
		t.Errorf("region change: want %.1f from %v, got %.1f from %v", wantChange, p[b], ev.RegionChangePct, ev.PriceAtBaseline)
	}
	if ev.RelativeChangePct != round(ev.RegionChangePct-ev.NeighborChangePct, 1) {
		t.Errorf("relative change must be region − neighbours: %+v", ev)
	}

	// Two days before the end: a partial window.
	b = last - 2
	f, _ = ComputeForecast("kab-bandung", "beras-medium", b)
	if ev := EvaluateIntervention("kab-bandung", "beras-medium", dates[b], f); ev.Status != EvaluationPartial || ev.ObservedDays != 2 {
		t.Errorf("want partial with 2 observed days, got %s (%d)", ev.Status, ev.ObservedDays)
	}
}
