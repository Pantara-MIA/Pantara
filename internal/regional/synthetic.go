package regional

import (
	"hash/fnv"
	"math"
	"math/rand/v2"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// DUMMY DATA. This file generates synthetic per-regency price series until
// regency-level data is available. When real data arrives, load it into the
// scope's prices (see pihps.go); the rest of the package stays the same.
// ─────────────────────────────────────────────────────────────────────────────

// syntheticEnd ends the calendar when no PIHPS file is present.
const syntheticEnd = "2026-08-28"

// commodityParams shapes the price behaviour of one commodity.
type commodityParams struct {
	base       float64   // normal price level (Rp)
	cv         float64   // 30-day coefficient of variation (%), from the knowledge base
	swing      float64   // yearly low→high swing (%)
	peaks      []float64 // seasonal peak months (1–12, fractional allowed)
	eid        float64   // extra log-price around Eid al-Fitr
	trend      float64   // log-price drift per year
	volatility int       // 1 = stable, 2 = watch, 3 = volatile
}

// Base prices of HET/HAP commodities sit slightly below their reference so that
// breaches come from seasonality, spikes, and regional differences.
var syntheticCommodities = map[string]commodityParams{
	"cabai-rawit-merah":    {base: 50500, cv: 21.6, swing: 210, peaks: []float64{1, 3.5}, eid: 0.10, volatility: 3},
	"cabai-rawit-hijau":    {base: 40000, cv: 16.2, swing: 165, peaks: []float64{1.5}, eid: 0.06, volatility: 2},
	"cabai-merah-keriting": {base: 46000, cv: 18.9, swing: 185, peaks: []float64{12.5, 3.5}, eid: 0.08, volatility: 3},
	"cabai-merah-besar":    {base: 38000, cv: 14.7, swing: 140, peaks: []float64{12.5}, eid: 0.05, volatility: 2},
	"cabai-hijau-besar":    {base: 29000, cv: 11.4, swing: 95, peaks: []float64{12.5}, eid: 0.03, volatility: 1},
	"beras-premium":        {base: 14450, cv: 2.4, swing: 18, peaks: []float64{1.5}, eid: 0.01, trend: 0.02, volatility: 2},
	"beras-medium":         {base: 13050, cv: 2.8, swing: 22, peaks: []float64{1}, eid: 0.01, trend: 0.02, volatility: 2},
	"beras-sphp":           {base: 12300, cv: 1.2, swing: 6, peaks: []float64{1}, trend: 0.01, volatility: 1},
	"beras-ketan-putih":    {base: 21000, cv: 4.6, swing: 38, peaks: []float64{3.5, 7}, eid: 0.04, volatility: 2},
	"minyak-goreng":        {base: 15250, cv: 3.1, swing: 24, peaks: []float64{11}, eid: 0.01, trend: 0.02, volatility: 1},
	"gula-pasir":           {base: 16900, cv: 2.2, swing: 19, peaks: []float64{3}, eid: 0.015, volatility: 1},
	"bawang-merah":         {base: 34500, cv: 17.3, swing: 175, peaks: []float64{1, 3.5}, eid: 0.08, volatility: 3},
	"bawang-putih":         {base: 35500, cv: 9.8, swing: 62, peaks: []float64{5}, eid: 0.03, volatility: 2},
	"bawang-bombay":        {base: 26500, cv: 7.2, swing: 48, peaks: []float64{5}, volatility: 1},
	"daging-ayam-ras":      {base: 35500, cv: 8.4, swing: 45, peaks: []float64{3.5, 12.5}, eid: 0.07, volatility: 2},
	"telur-ayam-ras":       {base: 27800, cv: 6.1, swing: 34, peaks: []float64{3.5, 7}, eid: 0.05, volatility: 2},
	"daging-sapi":          {base: 132000, cv: 4.3, swing: 28, peaks: []float64{3.5, 6}, eid: 0.05, trend: 0.02, volatility: 1},
	"tomat":                {base: 11500, cv: 19.7, swing: 240, peaks: []float64{1}, volatility: 3},
	"kentang":              {base: 15500, cv: 6.8, swing: 55, peaks: []float64{2}, volatility: 1},
	"wortel":               {base: 13800, cv: 8.9, swing: 68, peaks: []float64{1}, volatility: 1},
	"sawi-hijau":           {base: 9800, cv: 22.4, swing: 130, peaks: []float64{1}, volatility: 3},
}

// regionParams shapes the market behaviour of one region.
type regionParams struct {
	offset      float64  // log-price offset from the provincial average
	fragility   float64  // multiplier on local shock frequency and size
	persistence float64  // AR(1) coefficient of local shocks; higher = slower recovery
	producerOf  []string // commodity categories produced locally (cheaper)
}

// paramsFor returns the market behaviour of a region: curated for West Java,
// otherwise drawn deterministically from the region ID (cities: pricier but
// quicker to recover; regencies: more varied shocks and recovery).
func paramsFor(reg Region) regionParams {
	if rp, ok := syntheticRegions[reg.ID]; ok {
		return rp
	}
	r := rand.New(rand.NewPCG(seed(reg.ID), 7))
	switch reg.Type {
	case "city":
		return regionParams{offset: 0.02 + 0.03*r.Float64(), fragility: 0.7 + 0.3*r.Float64(), persistence: 0.88 + 0.03*r.Float64()}
	case "regency":
		return regionParams{offset: 0.02 * r.NormFloat64(), fragility: 0.9 + 0.6*r.Float64(), persistence: 0.92 + 0.05*r.Float64()}
	}
	return regionParams{offset: 0, fragility: 1, persistence: 0.93}
}

var syntheticRegions = map[string]regionParams{
	// Large cities: higher prices, but supply recovers quickly.
	"kota-depok":   {offset: 0.05, fragility: 0.8, persistence: 0.90},
	"kota-bekasi":  {offset: 0.05, fragility: 0.8, persistence: 0.90},
	"kota-bogor":   {offset: 0.04, fragility: 0.9, persistence: 0.90},
	"kota-bandung": {offset: 0.04, fragility: 0.7, persistence: 0.88},
	"kota-cimahi":  {offset: 0.03, fragility: 0.8, persistence: 0.90},
	"kota-cirebon": {offset: 0.02, fragility: 0.9, persistence: 0.91},
	// Production centres: cheaper for their main commodities.
	"kab-garut":      {offset: -0.01, fragility: 1.0, persistence: 0.93, producerOf: []string{"chili", "vegetable"}},
	"kab-bandung":    {offset: 0.00, fragility: 0.9, persistence: 0.92, producerOf: []string{"vegetable"}},
	"kab-cianjur":    {offset: -0.01, fragility: 1.0, persistence: 0.93, producerOf: []string{"vegetable", "rice"}},
	"kab-indramayu":  {offset: -0.02, fragility: 1.0, persistence: 0.93, producerOf: []string{"rice"}},
	"kab-karawang":   {offset: 0.00, fragility: 0.9, persistence: 0.92, producerOf: []string{"rice"}},
	"kab-subang":     {offset: -0.01, fragility: 1.0, persistence: 0.93, producerOf: []string{"rice"}},
	"kab-majalengka": {offset: -0.01, fragility: 1.0, persistence: 0.93, producerOf: []string{"spice"}},
	// Southern and far-eastern regions: long supply chains, slow recovery.
	"kab-pangandaran": {offset: 0.03, fragility: 1.6, persistence: 0.97},
	"kab-sukabumi":    {offset: 0.01, fragility: 1.4, persistence: 0.96},
	"kab-tasikmalaya": {offset: 0.00, fragility: 1.3, persistence: 0.96},
	"kota-banjar":     {offset: 0.02, fragility: 1.3, persistence: 0.95},
	"kab-kuningan":    {offset: 0.00, fragility: 1.2, persistence: 0.95},
	"kab-ciamis":      {offset: 0.00, fragility: 1.1, persistence: 0.95},
}

func seed(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	return h.Sum64()
}

func dateRange(start, end string) []string {
	t, _ := time.Parse("2006-01-02", start)
	last, _ := time.Parse("2006-01-02", end)
	var out []string
	for ; !t.After(last); t = t.AddDate(0, 0, 1) {
		out = append(out, t.Format("2006-01-02"))
	}
	return out
}

// seasonality is 0..1: closeness of the date to the nearest peak month.
func seasonality(t time.Time, peaks []float64) float64 {
	month := float64(t.Month()) + float64(t.Day()-1)/30.0
	best := 0.0
	for _, p := range peaks {
		d := math.Abs(month - p)
		d = math.Min(d, 12-d)
		best = math.Max(best, math.Exp(-d*d/2))
	}
	return best
}

// eidEffect peaks about 5 days before Eid al-Fitr (dates from calendar.go).
func eidEffect(t time.Time) float64 {
	best := 0.0
	for _, eid := range eidAlFitr {
		d := t.Sub(eid).Hours()/24 + 5
		best = math.Max(best, math.Exp(-d*d/(2*7*7)))
	}
	return best
}

// jump returns a fat-tailed positive shock with probability p.
func jump(r *rand.Rand, p, size float64) float64 {
	if r.Float64() >= p {
		return 0
	}
	return r.ExpFloat64() * size
}

// generatePrices returns prices[commodity][region][day] for a scope. shift is
// added to the log level of commodities without an anchor.
//
// log price = provincial level + regional offset + local component (AR(1) per
// region, blended 30% toward the neighbour mean so spikes spill over to
// neighbours). The provincial level is the real province series when anchor[ci]
// is set, otherwise log base + trend + season + Eid + a shared AR(1) component.
func generatePrices(s *Scope, anchor [][]float64, shift float64) [][][]float64 {
	nDays := len(dates)
	times := make([]time.Time, nDays)
	for i, d := range dates {
		times[i], _ = time.Parse("2006-01-02", d)
	}
	regions := s.Regions

	out := make([][][]float64, len(Commodities))
	for ci, c := range Commodities {
		p := syntheticCommodities[c.ID]
		sigma := p.cv / 100 * 0.12
		amplitude := p.swing / 100 * 0.12
		jumpProb := []float64{0, 0.0008, 0.002, 0.004}[p.volatility]
		jumpSize := math.Max(sigma*6, 0.012)
		// Regional gaps are narrower for commodities whose prices are regulated.
		offsetScale := 0.4 + 0.6*math.Min(p.cv/10, 1)
		var real []float64
		if anchor != nil {
			real = anchor[ci]
		}

		level := make([]float64, nDays)
		rShared := rand.New(rand.NewPCG(seed(c.ID), 1))
		x := 0.0
		for t := range nDays {
			if real != nil {
				level[t] = math.Log(real[t])
				continue
			}
			x = 0.96*x + rShared.NormFloat64()*sigma*0.7 + jump(rShared, jumpProb, jumpSize)
			years := float64(t) / 365
			level[t] = math.Log(p.base) + shift + p.trend*years +
				amplitude*(seasonality(times[t], p.peaks)-0.35) +
				p.eid*eidEffect(times[t]) + x
		}

		local := make([][]float64, len(regions))
		offset := make([]float64, len(regions))
		for ri, reg := range regions {
			rp := paramsFor(reg)
			r := rand.New(rand.NewPCG(seed(c.ID), seed(reg.ID)))
			offset[ri] = rp.offset*offsetScale + r.NormFloat64()*0.01
			for _, cat := range rp.producerOf {
				if cat == c.Category {
					offset[ri] -= 0.06
				}
			}
			series := make([]float64, nDays)
			y := 0.0
			for t := range nDays {
				y = rp.persistence*y +
					r.NormFloat64()*sigma*0.6*math.Sqrt(rp.fragility) +
					jump(r, jumpProb*0.8*rp.fragility+0.0005*rp.fragility, jumpSize*rp.fragility)
				series[t] = y
			}
			local[ri] = series
		}

		out[ci] = make([][]float64, len(regions))
		for ri, reg := range regions {
			series := make([]float64, nDays)
			for t := range nDays {
				neighbors := 0.0
				for _, id := range reg.Neighbors {
					neighbors += local[s.index[id]][t]
				}
				smooth := local[ri][t]
				if n := len(reg.Neighbors); n > 0 {
					smooth = 0.7*smooth + 0.3*neighbors/float64(n)
				}
				series[t] = math.Round(math.Exp(level[t]+offset[ri]+smooth)/50) * 50
			}
			out[ci][ri] = series
		}
	}
	return out
}
