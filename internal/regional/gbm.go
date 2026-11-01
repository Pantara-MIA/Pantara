package regional

import (
	"encoding/json"
	"io/fs"
	"log"
	"math"
)

// ─────────────────────────────────────────────────────────────────────────────
// v2 forecaster: LightGBM quantile models trained by model/train_forecast.py and
// evaluated here. Per level (province = PIHPS, regency = SP2KP) there are three
// models predicting the 10/50/90% quantiles of the standardised return
//   z = ln(p[t+h] / p[t]) / (max(σ30_t, sigmaFloor) · √h)
// from the features in features.go. They are used only for the commodities
// where they beat FHS out of sample (data/models/selection.json).
// ─────────────────────────────────────────────────────────────────────────────

const (
	ModelFHS = "fhs"
	ModelV2  = "v2"

	modelLevelProvince = "province"
	modelLevelRegency  = "regency"
)

type gbmTree struct {
	Feature   []int     `json:"f"`
	Threshold []float64 `json:"t"`
	Left      []int     `json:"l"`
	Right     []int     `json:"r"`
	NaNLeft   []bool    `json:"d"`
	Leaves    []float64 `json:"v"`
	Root      int       `json:"root"`
}

// gbm is one boosted ensemble: the prediction is the sum of its trees' leaves.
type gbm struct {
	Features []string  `json:"features"`
	Trees    []gbmTree `json:"trees"`
}

func (m *gbm) predict(x []float64) float64 {
	sum := 0.0
	for i := range m.Trees {
		t := &m.Trees[i]
		node := t.Root
		for node >= 0 {
			v := x[t.Feature[node]]
			switch {
			case math.IsNaN(v):
				if t.NaNLeft[node] {
					node = t.Left[node]
				} else {
					node = t.Right[node]
				}
			case v <= t.Threshold[node]:
				node = t.Left[node]
			default:
				node = t.Right[node]
			}
		}
		sum += t.Leaves[^node]
	}
	return sum
}

// quantileModels holds the P10/P50/P90 models of one level and the
// commodities they are selected for.
type quantileModels struct {
	q        [3]*gbm
	selected map[string]bool
}

// predict returns the sorted z quantiles for one feature row.
func (m *quantileModels) predict(x []float64) [3]float64 {
	out := [3]float64{m.q[0].predict(x), m.q[1].predict(x), m.q[2].predict(x)}
	// Quantile crossing is rare but possible with separate models.
	if out[0] > out[1] {
		out[0], out[1] = out[1], out[0]
	}
	if out[1] > out[2] {
		out[1], out[2] = out[2], out[1]
	}
	if out[0] > out[1] {
		out[0], out[1] = out[1], out[0]
	}
	return out
}

var v2Models = map[string]*quantileModels{}

// V2Report is the out-of-sample evaluation written by model/train_forecast.py
// (data/models/metrics.json) and the per-commodity selection, served as is.
var V2Report struct {
	Selection map[string]map[string]string `json:"selection"`
	Metrics   json.RawMessage              `json:"metrics"`
}

func initModels(fsys fs.FS) {
	var selection map[string]map[string]string
	if raw, err := fs.ReadFile(fsys, "data/models/selection.json"); err == nil {
		_ = json.Unmarshal(raw, &selection)
	}
	V2Report.Selection = selection
	V2Report.Metrics = json.RawMessage("{}")
	if raw, err := fs.ReadFile(fsys, "data/models/metrics.json"); err == nil && json.Valid(raw) {
		V2Report.Metrics = raw
	}
	for _, level := range []string{modelLevelProvince, modelLevelRegency} {
		m := &quantileModels{selected: map[string]bool{}}
		ok := true
		for i, q := range []string{"10", "50", "90"} {
			raw, err := fs.ReadFile(fsys, "data/models/forecast_"+level+"_q"+q+".json")
			if err != nil {
				ok = false
				break
			}
			var g gbm
			if err := json.Unmarshal(raw, &g); err != nil || len(g.Features) != len(featureNames) {
				log.Printf("Warning: model %s q%s unreadable or has %d features (want %d)", level, q, len(g.Features), len(featureNames))
				ok = false
				break
			}
			m.q[i] = &g
		}
		if !ok {
			continue
		}
		for c, which := range selection[level] {
			if which == ModelV2 {
				m.selected[c] = true
			}
		}
		v2Models[level] = m
		log.Printf("Forecast v2 (%s): %d trees per quantile, used for %d commodities", level, len(m.q[1].Trees), len(m.selected))
	}
}

// modelFor returns the v2 models for a series when they are selected for it:
// PIHPS series use the province models, SP2KP series the regency models.
func modelFor(source, commodityID string) *quantileModels {
	level := ""
	switch source {
	case SourcePIHPS:
		level = modelLevelProvince
	case SourceSP2KP:
		level = modelLevelRegency
	}
	m := v2Models[level]
	if m == nil || !m.selected[commodityID] {
		return nil
	}
	return m
}
