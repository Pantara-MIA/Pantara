package regional

import (
	"math"
	"time"
)

// Feature rows for the v2 forecaster; a mirror of model/forecast_features.py
// (the parity test in features_test.go checks both against the same samples).

const (
	sigmaFloor      = 0.003
	rainLagDays     = 7
	holidayCap      = 120
	offWindow       = 14
	minFeatureIndex = 91 // first day with full 90-day lookbacks
)

var baseFeatureNames = []string{
	"h", "sigma30", "sigma90", "r1", "r7", "r30", "r90", "dev_med90",
	"gap_ref", "regulated", "gap_neighbor", "gap_scope", "doy_sin", "doy_cos",
	"days_to_eid", "days_since_eid", "days_to_adha", "days_since_adha", "off_days_next14",
	"rain30", "rain90", "roni", "parent_r30",
}

// featureNames is baseFeatureNames plus one indicator per commodity.
var featureNames = func() []string {
	out := append([]string(nil), baseFeatureNames...)
	for _, c := range Commodities {
		out = append(out, "is_"+c.ID)
	}
	return out
}()

// rollingSigma is the sample std of the daily log returns over `window` days ending at t.
func rollingSigma(lp []float64, t, window int) float64 {
	var sum, sumSq float64
	for i := t - window + 1; i <= t; i++ {
		r := lp[i] - lp[i-1]
		sum += r
		sumSq += r * r
	}
	n := float64(window)
	mean := sum / n
	v := (sumSq - n*mean*mean) / (n - 1)
	if v <= 0 {
		return 0
	}
	return math.Sqrt(v)
}

// realMedian is the median price on day t over the given regions' real series.
func (d *scopeData) realMedian(ci, t int, regions []int) float64 {
	buf := make([]float64, 0, len(regions))
	for _, ri := range regions {
		if p := d.prices[ci][ri]; p != nil && d.source[ci][ri] != SourceSynthetic {
			buf = append(buf, p[t])
		}
	}
	return median(buf)
}

// holidayDistances returns the days to the next and since the last holiday in list, capped.
func holidayDistances(list []time.Time, day time.Time) (to, since float64) {
	to, since = holidayCap, holidayCap
	for _, e := range list {
		diff := e.Sub(day).Hours() / 24
		if diff >= 0 {
			to = math.Min(to, diff)
		} else {
			since = math.Min(since, -diff)
		}
	}
	return to, since
}

// featureRow builds the v2 feature vector for series (ci, ri) at origin t and
// horizon h; ok is false when there is not enough history.
func (s *Scope) featureRow(d *scopeData, ci, ri, t, h int) ([]float64, bool) {
	p, lp := d.prices[ci][ri], d.logPrices[ci][ri]
	if p == nil || t < minFeatureIndex || t >= len(p) {
		return nil, false
	}
	x := make([]float64, 0, len(featureNames))
	window := append([]float64(nil), p[t-90:t]...)

	gapRef, regulated := 0.0, 0.0
	if d.refType[ci][ri] != "baseline" {
		gapRef, regulated = lp[t]-math.Log(d.reference[ci][ri][t]), 1
	}
	gapNeighbor := 0.0
	var nb []int
	for _, id := range s.Regions[ri].Neighbors {
		nb = append(nb, s.index[id])
	}
	if m := d.realMedian(ci, t, nb); m > 0 {
		gapNeighbor = lp[t] - math.Log(m)
	}
	all := make([]int, len(s.Regions))
	for i := range all {
		all[i] = i
	}
	gapScope := lp[t] - math.Log(d.realMedian(ci, t, all))

	// Parent momentum: the national median for provinces, the province's own
	// PIHPS series for regencies/cities.
	parentR30 := 0.0
	if s.ID == ScopeNational {
		if a, b := d.realMedian(ci, t, all), d.realMedian(ci, t-30, all); a > 0 && b > 0 {
			parentR30 = math.Log(a / b)
		}
	} else if national, ok := FindScope(ScopeNational); ok {
		if pp := national.Prices(s.Region, Commodities[ci].ID); pp != nil {
			parentR30 = math.Log(pp[t] / pp[t-30])
		}
	}

	day, _ := time.Parse("2006-01-02", dates[t])
	yday := float64(day.YearDay())
	toEid, sinceEid := holidayDistances(eidAlFitr, day)
	toAdha, sinceAdha := holidayDistances(idulAdha, day)
	code := ""
	if prov, ok := ClimateProvince(s.Regions[ri].ID); ok {
		code = prov.Code
	}
	lagged := day.AddDate(0, 0, -rainLagDays)
	rain30, ok30 := rainRatio(code, lagged, 30)
	rain90, ok90 := rainRatio(code, lagged, 90)
	if !ok30 {
		rain30 = 1
	}
	if !ok90 {
		rain90 = 1
	}
	roni := 0.0
	if e, ok := roniAvailable(day); ok {
		roni = e.Anom
	}

	x = append(x,
		float64(h),
		d.sigmas[ci][ri][t],
		rollingSigma(lp, t, 90),
		lp[t]-lp[t-1],
		lp[t]-lp[t-7],
		lp[t]-lp[t-30],
		lp[t]-lp[t-90],
		lp[t]-math.Log(median(window)),
		gapRef, regulated, gapNeighbor, gapScope,
		math.Sin(2*math.Pi*yday/365.25), math.Cos(2*math.Pi*yday/365.25),
		toEid, sinceEid, toAdha, sinceAdha, offDaysAhead(day, offWindow),
		rain30, rain90, roni, parentR30,
	)
	for i := range Commodities {
		if i == ci {
			x = append(x, 1)
		} else {
			x = append(x, 0)
		}
	}
	return x, true
}
