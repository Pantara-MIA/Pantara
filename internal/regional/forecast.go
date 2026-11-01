package regional

import (
	"math"
	"sort"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Filtered Historical Simulation (FHS) forecast per region × commodity.
//
//   σ_t   = std. dev. of daily log returns over the 30 days up to day t.
//   z_t,h = ln(p_{t+h} / p_t) / (max(σ_t, floor) √h), clipped to ±zClip —
//           standardised h-day return, using only pairs that lie entirely on or
//           before the forecast day (no leakage). The floor and clip keep a jump
//           after a flat stretch (σ ≈ 0, common in market reports) from
//           producing an absurd z.
//   P_q   = p_now · exp(Q_q(z) · σ_now · √h)
//   Breach probability = share of historical z that lift p_now above the reference.
//   Expected excess    = mean over historical z of max(p_now·exp(z·σ√h) − ref, 0).
//
// v2 (where selected, see gbm.go): the historical z are mapped monotonically —
// piecewise linear around their median — so that their 10/50/90% quantiles
// equal the v2 prediction; P10/P50/P90, breach probability and expected excess
// then come from the mapped distribution on the v2 scale max(σ_now, floor)·√h.
// With too little history, a standard normal grid stands in for the
// historical z.
// ─────────────────────────────────────────────────────────────────────────────

// zClip bounds historical z (the v2 models train on the same range).
const zClip = 8

const (
	sigmaWindow   = 30
	MaxHorizon    = 14
	minFHSSamples = 60
)

type ForecastPoint struct {
	Horizon    int     `json:"horizon"`
	Date       string  `json:"date"`
	P10        float64 `json:"p10"`
	P50        float64 `json:"p50"`
	P90        float64 `json:"p90"`
	BreachProb float64 `json:"breach_prob"` // 0..1
	// ExpectedExcess is E[max(P_h − reference, 0)] in Rp per unit: how far above
	// the reference the price is expected to be, counting below-reference as 0.
	ExpectedExcess float64 `json:"expected_excess"`
}

type Forecast struct {
	AsOf         string          `json:"as_of"`
	CurrentPrice float64         `json:"current_price"`
	Reference    float64         `json:"reference"`
	Points       []ForecastPoint `json:"points"`
	// Model is the forecaster used: ModelFHS or ModelV2.
	Model string `json:"model"`
}

func sigmaAt(logP []float64, t int) float64 {
	if t < sigmaWindow {
		return 0
	}
	var sum, sumSq float64
	for i := t - sigmaWindow + 1; i <= t; i++ {
		r := logP[i] - logP[i-1]
		sum += r
		sumSq += r * r
	}
	n := float64(sigmaWindow)
	mean := sum / n
	v := (sumSq - n*mean*mean) / (n - 1)
	if v <= 0 {
		return 0
	}
	return math.Sqrt(v)
}

func quantile(sorted []float64, q float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	pos := q * float64(len(sorted)-1)
	i := int(pos)
	if i >= len(sorted)-1 {
		return sorted[len(sorted)-1]
	}
	f := pos - float64(i)
	return sorted[i]*(1-f) + sorted[i+1]*f
}

func addDays(s string, n int) string {
	t, _ := time.Parse("2006-01-02", s)
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

// allHorizons is 1..MaxHorizon.
var allHorizons = func() []int {
	h := make([]int, MaxHorizon)
	for i := range h {
		h[i] = i + 1
	}
	return h
}()

// ComputeForecast forecasts prices 1..MaxHorizon days after day index now.
// The future reference is assumed equal to today's reference.
// It reports false when the region has no data for the commodity.
func ComputeForecast(regionID, commodityID string, now int) (Forecast, bool) {
	s, ok := regionHome[regionID]
	if !ok || now < 0 || now >= len(dates) {
		return Forecast{}, false
	}
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return Forecast{}, false
	}
	return d.forecastWith(ci, ri, now, allHorizons, s.v2Hook(d, ci, ri, now)), true
}

// v2Quantiles returns the v2 z quantiles and their price scale for horizon h.
type v2Quantiles func(h int) (zq [3]float64, scale float64, ok bool)

// v2Hook returns the v2 predictor for a series, or nil where FHS is used.
func (s *Scope) v2Hook(d *scopeData, ci, ri, now int) v2Quantiles {
	m := modelFor(d.source[ci][ri], Commodities[ci].ID)
	if m == nil || now < minFeatureIndex {
		return nil
	}
	sigma := math.Max(d.sigmas[ci][ri][now], sigmaFloor)
	return func(h int) ([3]float64, float64, bool) {
		x, ok := s.featureRow(d, ci, ri, now, h)
		if !ok {
			return [3]float64{}, 0, false
		}
		return m.predict(x), sigma * math.Sqrt(float64(h)), true
	}
}

// standardNormalGrid stands in for the historical z when history is short.
var standardNormalGrid = func() []float64 {
	const n = 199
	out := make([]float64, n)
	for i := range out {
		out[i] = math.Sqrt2 * math.Erfinv(2*(float64(i)+0.5)/n-1)
	}
	return out
}()

// minZSpread is the smallest historical 10–50 / 50–90% z gap worth reshaping;
// near-flat histories (e.g. regulated staples) use standardNormalGrid instead,
// since stretching a tiny gap would blow the tails up.
const minZSpread = 0.05

// maxMappedZ caps the reshaped tails (the models train on |z| ≤ 8).
const maxMappedZ = 12

// reshape maps sorted z monotonically so its 10/50/90% quantiles become zq.
func reshape(z []float64, zq [3]float64) []float64 {
	e10, e50, e90 := quantile(z, 0.10), quantile(z, 0.50), quantile(z, 0.90)
	if e50-e10 < minZSpread || e90-e50 < minZSpread {
		z = standardNormalGrid
		e10, e50, e90 = quantile(z, 0.10), quantile(z, 0.50), quantile(z, 0.90)
	}
	lo := (zq[1] - zq[0]) / (e50 - e10)
	hi := (zq[2] - zq[1]) / (e90 - e50)
	out := make([]float64, len(z))
	for i, v := range z {
		if v <= e50 {
			out[i] = zq[1] + (v-e50)*lo
		} else {
			out[i] = zq[1] + (v-e50)*hi
		}
		out[i] = math.Max(-maxMappedZ, math.Min(maxMappedZ, out[i]))
	}
	return out
}

// forecastAt computes the FHS forecast for the given horizons only. It reads
// the precomputed log prices and σ_t, which use data up to t only (no leakage).
func (d *scopeData) forecastAt(ci, ri, now int, horizons []int) Forecast {
	return d.forecastWith(ci, ri, now, horizons, nil)
}

// forecastWith is forecastAt with an optional v2 predictor (nil = FHS).
func (d *scopeData) forecastWith(ci, ri, now int, horizons []int, v2 v2Quantiles) Forecast {
	p := d.prices[ci][ri]
	logP := d.logPrices[ci][ri]
	sigma := d.sigmas[ci][ri]
	ref := d.reference[ci][ri]
	sigmaNow := sigma[now]
	pNow := p[now]
	refNow := ref[now]

	out := Forecast{AsOf: dates[now], CurrentPrice: pNow, Reference: math.Round(refNow), Model: ModelFHS}
	z := make([]float64, 0, now)
	for _, h := range horizons {
		sqrtH := math.Sqrt(float64(h))
		z = z[:0]
		for t := sigmaWindow; t+h <= now; t++ {
			if sigma[t] > 0 {
				zi := (logP[t+h] - logP[t]) / (math.Max(sigma[t], sigmaFloor) * sqrtH)
				z = append(z, math.Max(-zClip, math.Min(zClip, zi)))
			}
		}
		pt := ForecastPoint{Horizon: h, Date: addDays(dates[now], h)}
		if v2 != nil {
			if zq, scale, ok := v2(h); ok {
				base := standardNormalGrid
				if len(z) >= minFHSSamples && sigmaNow > 0 {
					sort.Float64s(z)
					base = z
				}
				mapped := reshape(base, zq)
				pt.P10 = math.Round(pNow * math.Exp(zq[0]*scale))
				pt.P50 = math.Round(pNow * math.Exp(zq[1]*scale))
				pt.P90 = math.Round(pNow * math.Exp(zq[2]*scale))
				pt.BreachProb, pt.ExpectedExcess = breach(mapped, pNow, refNow, scale)
				out.Points = append(out.Points, pt)
				out.Model = ModelV2
				continue
			}
		}
		if len(z) < minFHSSamples || sigmaNow == 0 {
			// History too short: fall back to a flat forecast.
			pt.P10, pt.P50, pt.P90 = pNow, pNow, pNow
			if pNow > refNow {
				pt.BreachProb = 1
				pt.ExpectedExcess = math.Round(pNow - refNow)
			}
			out.Points = append(out.Points, pt)
			continue
		}
		sort.Float64s(z)
		scale := sigmaNow * sqrtH
		pt.P10 = math.Round(pNow * math.Exp(quantile(z, 0.10)*scale))
		pt.P50 = math.Round(pNow * math.Exp(quantile(z, 0.50)*scale))
		pt.P90 = math.Round(pNow * math.Exp(quantile(z, 0.90)*scale))
		pt.BreachProb, pt.ExpectedExcess = breach(z, pNow, refNow, scale)
		out.Points = append(out.Points, pt)
	}
	return out
}

// breach returns the share of sorted z that lift pNow·exp(z·scale) above the
// reference, and the mean excess over it (counting below-reference as 0).
func breach(z []float64, pNow, refNow, scale float64) (float64, float64) {
	threshold := math.Log(refNow/pNow) / scale
	above := len(z) - sort.SearchFloat64s(z, math.Nextafter(threshold, math.Inf(1)))
	var excess float64
	for _, zi := range z[len(z)-above:] {
		excess += pNow*math.Exp(zi*scale) - refNow
	}
	return round(float64(above)/float64(len(z)), 3), math.Round(excess / float64(len(z)))
}

// Early-warning status of one region × commodity.
const (
	StatusAbove  = "above_reference"
	StatusWatch  = "watch"
	StatusNormal = "normal"
)

// WatchThreshold: 14-day breach probability that triggers the watch status.
const WatchThreshold = 0.40

type Alert struct {
	Status string `json:"status"`
	// MaxBreachProb is the highest breach probability over the next 14 days.
	MaxBreachProb float64 `json:"max_breach_prob"`
	// DaysToBreach: first horizon with breach probability >= 50%, 0 if none.
	DaysToBreach int `json:"days_to_breach"`
}

func ComputeAlert(f Forecast) Alert {
	out := Alert{Status: StatusNormal}
	for _, pt := range f.Points {
		out.MaxBreachProb = math.Max(out.MaxBreachProb, pt.BreachProb)
		if out.DaysToBreach == 0 && pt.BreachProb >= 0.5 {
			out.DaysToBreach = pt.Horizon
		}
	}
	switch {
	case f.CurrentPrice > f.Reference:
		out.Status = StatusAbove
	case out.MaxBreachProb >= WatchThreshold:
		out.Status = StatusWatch
	}
	return out
}
