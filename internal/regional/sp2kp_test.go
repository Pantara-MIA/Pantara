package regional

import (
	"bytes"
	"compress/gzip"
	"testing"
	"testing/fstest"
)

func TestSP2KPOverlay(t *testing.T) {
	saved := dates
	defer func() { dates = saved }()
	dates = dateRange("2026-01-01", "2026-01-10") // Thu..Sat, 7 weekdays

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	gz.Write([]byte(`date,region_id,beras-medium,tomat
2026-01-02,kab-a,13000,
2026-01-05,kab-a,13100,9000
2026-01-06,kab-a,13200,
2026-01-07,kab-a,13300,
2026-01-08,kab-a,13400,
2026-01-05,kab-b,14000,
`))
	gz.Close()
	fsys := fstest.MapFS{SP2KPFile: {Data: buf.Bytes()}}

	if c := sp2kpCoverage(fsys); c["kab-a"] != 1 || c["kab-b"] != 0 {
		t.Fatalf("coverage %v: kab-a has one complete commodity, kab-b none", c)
	}

	savedFS := dataFS
	defer func() { dataFS = savedFS }()
	dataFS = fsys
	s := &Scope{Regions: []Region{{ID: "kab-a"}, {ID: "kab-b"}}}
	prices := make([][][]float64, len(Commodities))
	for ci := range prices {
		prices[ci] = [][]float64{make([]float64, len(dates)), make([]float64, len(dates))}
	}
	source := s.overlaySP2KP(prices)
	ci := commodityIndex["beras-medium"]
	if source[ci][0] != SourceSP2KP || source[ci][1] != SourceSynthetic {
		t.Fatalf("sources %v", source[ci])
	}
	if got := prices[ci][0]; got[0] != 13000 || got[4] != 13100 || got[9] != 13400 {
		t.Errorf("filled series %v", got)
	}
	if source[commodityIndex["tomat"]][0] != SourceSynthetic {
		t.Error("one tomato report must not replace the synthetic series")
	}
	if c, _ := FindCommodity("minyak-goreng"); c.ReferenceFor(SourceSP2KP).Type != "HET" || c.ReferenceFor(SourcePIHPS).Type != "baseline" {
		t.Error("MinyaKita HET applies to SP2KP series only")
	}
}
