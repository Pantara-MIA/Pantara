package regional

import (
	"testing"
	"time"
)

func TestRONIPublicationLag(t *testing.T) {
	// JAS (centre Aug) is out by October; ASO (centre Sep) not until November.
	e, ok := roniAvailable(time.Date(2026, 10, 28, 0, 0, 0, 0, time.UTC))
	if !ok || e.Season != "JAS" || e.Year != 2026 {
		t.Fatalf("latest season on 2026-10-28: %+v", e)
	}
	if e.Phase != "el_nino" || e.Level == "" {
		t.Errorf("JAS 2026 should be an El Niño with a strength: %+v", e)
	}
}

func TestClimateSnapshot(t *testing.T) {
	last := dates[len(dates)-1]
	snap := ClimateAt(last)
	if !snap.Available || len(snap.Provinces) != len(Provinces) {
		t.Fatalf("want all %d provinces, got %d (available %v)", len(Provinces), len(snap.Provinces), snap.Available)
	}
	if snap.WeatherAsOf > last {
		t.Errorf("weather as-of %s after %s", snap.WeatherAsOf, last)
	}
	levels := map[string]int{}
	for _, p := range snap.Provinces {
		levels[p.Level]++
		dry := p.Rain90Pct < 85
		el := snap.ENSO.Anom >= 0.5
		want := ClimateLow
		switch {
		case (dry && el) || p.Rain90Pct < 50:
			want = ClimateHigh
		case dry || el:
			want = ClimateWatch
		}
		if p.Level != want {
			t.Errorf("%s: level %s, want %s (rain90 %.0f%%, RONI %+.2f)", p.RegionID, p.Level, want, p.Rain90Pct, snap.ENSO.Anom)
		}
		for _, e := range p.Effects {
			if !e.Significant || e.EffectPct < minEffectPct {
				t.Errorf("%s: listed a weak effect %+v", p.RegionID, e)
			}
		}
	}
	t.Logf("%s: RONI %s %d %+.2f (%s), levels %v", last, snap.ENSO.Season, snap.ENSO.Year, snap.ENSO.Anom, snap.ENSO.Level, levels)

	if prov, ok := ClimateProvince("kota-bandung"); !ok || prov.ID != "jawa-barat" {
		t.Errorf("regencies use their province's climate, got %+v", prov)
	}
	hist := RainHistory("jawa-barat", last, 12)
	if len(hist) != 12 || hist[0].NormalMM <= 0 {
		t.Errorf("rain history %+v", hist)
	}
}
