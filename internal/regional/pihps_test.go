package regional

import (
	"testing"
	"testing/fstest"
)

func TestPIHPSSeries(t *testing.T) {
	saved := dates
	defer func() { dates = saved }()
	dates = dateRange("2026-01-01", "2026-01-10") // Thu..Sat

	fsys := fstest.MapFS{PIHPSFile: {Data: []byte(`date,province_id,commodity_id,price
2026-01-02,32,beras-medium,13000
2026-01-05,32,beras-medium,13200
2026-01-06,32,beras-medium,99000
2026-01-07,32,beras-medium,13300
2026-01-08,32,beras-medium,13400
2026-01-09,32,beras-medium,13500
2026-01-05,31,beras-medium,14000
2026-01-05,32,unknown-commodity,1
`)}}
	obs, last := loadPIHPS(fsys)
	if last != "2026-01-09" {
		t.Fatalf("last date %q", last)
	}
	regions := []Region{{ID: "jawa-barat", Code: "32"}, {ID: "dki-jakarta", Code: "31"}}
	out := pihpsSeries(regions, obs)
	got := out[commodityIndex["beras-medium"]][0]
	// Back-filled before the first report, carried over the weekend, and the
	// 99000 entry error skipped (carrying 13200).
	want := []float64{13000, 13000, 13000, 13000, 13200, 13200, 13300, 13400, 13500, 13500}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("day %d: got %v, want %v (series %v)", i, got[i], want[i], got)
		}
	}
	if out[commodityIndex["beras-medium"]][1] != nil {
		t.Error("a province reporting on 1 of 7 weekdays must be left out")
	}
}
