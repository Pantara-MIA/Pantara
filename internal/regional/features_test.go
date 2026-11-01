package regional

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

type parityRow struct {
	Scope     string    `json:"scope"`
	Region    string    `json:"region"`
	Commodity string    `json:"commodity"`
	Date      string    `json:"date"`
	H         int       `json:"h"`
	Features  []float64 `json:"features"`
	Pred      []float64 `json:"pred"`
	// DataFeatures are rebuilt from the current data (train_forecast.py
	// --parity-only); Features stay frozen at training time to go with Pred.
	DataFeatures []float64 `json:"data_features"`
}

// TestV2Parity checks the Go side of the v2 forecaster against rows written by
// model/train_forecast.py: the tree evaluator must reproduce LightGBM's
// predictions, and featureRow must rebuild the same features from the data.
func TestV2Parity(t *testing.T) {
	raw, err := os.ReadFile("../../data/models/parity.json")
	if err != nil {
		t.Skip("no parity file; run model/train_forecast.py")
	}
	var parity map[string][]parityRow
	if err := json.Unmarshal(raw, &parity); err != nil {
		t.Fatal(err)
	}
	for level, rows := range parity {
		m := v2Models[level]
		if m == nil {
			t.Errorf("%s: models not loaded", level)
			continue
		}
		checked, mismatched := 0, 0
		for _, row := range rows {
			for i, q := range m.q {
				if got := q.predict(row.Features); math.Abs(got-row.Pred[i]) > 1e-9 {
					t.Errorf("%s %s/%s h=%d q%d: Go %.10f, LightGBM %.10f", level, row.Region, row.Commodity, row.H, i, got, row.Pred[i])
				}
			}
			s, ok := FindScope(row.Scope)
			if !ok {
				continue
			}
			d, ci, ri, ok := s.indices(row.Region, row.Commodity)
			ti := DateIndex(row.Date)
			if !ok || ti < 0 || dates[ti] != row.Date || d.source[ci][ri] == SourceSynthetic {
				continue
			}
			x, ok := s.featureRow(d, ci, ri, ti, row.H)
			if !ok {
				continue
			}
			expect := row.Features
			if row.DataFeatures != nil {
				expect = row.DataFeatures
			}
			checked++
			bad := false
			for i, want := range expect {
				if math.Abs(x[i]-want) > 1e-6*math.Max(1, math.Abs(want)) {
					bad = true
					t.Logf("%s %s/%s %s h=%d: %s Go %.8f, Python %.8f", level, row.Region, row.Commodity, row.Date, row.H, featureNames[i], x[i], want)
				}
			}
			if bad {
				mismatched++
			}
		}
		t.Logf("%s: %d feature rows checked, %d with differences", level, checked, mismatched)
		if checked == 0 {
			t.Errorf("%s: no parity rows could be checked", level)
		}
		if mismatched > 0 {
			t.Errorf("%s: %d of %d feature rows differ from Python", level, mismatched, checked)
		}
	}
}

func TestReshapeMatchesTargetQuantiles(t *testing.T) {
	z := append([]float64(nil), standardNormalGrid...)
	want := [3]float64{-0.4, 0.3, 2.1}
	got := reshape(z, want)
	for i, q := range []float64{0.1, 0.5, 0.9} {
		if v := quantile(got, q); math.Abs(v-want[i]) > 1e-9 {
			t.Errorf("q%.1f: %.6f, want %.6f", q, v, want[i])
		}
	}
	for i := 1; i < len(got); i++ {
		if got[i] < got[i-1] {
			t.Fatal("reshape must keep the order")
		}
	}
}
