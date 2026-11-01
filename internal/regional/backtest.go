package regional

import (
	"math"
	"sync"
)

// ─────────────────────────────────────────────────────────────────────────────
// Walk-forward backtest of the FHS forecast.
//
// Per scope and commodity, at origins spaced BacktestStep days apart over the
// last BacktestDays of data (and in every region with data), the forecast is built from data up
// to the origin only, then compared with what actually happened h days later:
//   coverage = share of actual prices inside P10–P90 (a calibrated 80% band
//              should land near 0.80);
//   MASE     = mean |actual − P50| / mean |actual − price at origin|, i.e. the
//              error relative to the naive "no change" forecast (< 1 beats it).
// ─────────────────────────────────────────────────────────────────────────────

const (
	BacktestDays = 365
	BacktestStep = 7
)

var BacktestHorizons = []int{7, 14}

type BacktestRow struct {
	CommodityID string  `json:"commodity_id"`
	Horizon     int     `json:"horizon"`
	Samples     int     `json:"samples"`
	MASE        float64 `json:"mase"`
	Coverage    float64 `json:"coverage"`
	// Mean P10–P90 width as a share of the origin price.
	BandWidth float64 `json:"band_width"`
}

type BacktestReport struct {
	Scope     string        `json:"scope"`
	Source    string        `json:"source"`
	From      string        `json:"from"`
	To        string        `json:"to"`
	Step      int           `json:"step_days"`
	Regions   int           `json:"regions"`
	Rows      []BacktestRow `json:"rows"`
	Synthetic bool          `json:"synthetic"`
}

var (
	backtestOnce   sync.Once
	backtestResult []BacktestReport
)

// Backtest runs once per process (a few seconds) and is cached; one report per
// eagerly loaded scope (the national scope and West Java — the other
// provinces' regencies use the same synthetic generator as West Java).
func Backtest() []BacktestReport {
	backtestOnce.Do(func() {
		for _, s := range Scopes {
			if s.build == nil {
				backtestResult = append(backtestResult, s.runBacktest())
			}
		}
	})
	return backtestResult
}

func (s *Scope) runBacktest() BacktestReport {
	maxH := BacktestHorizons[len(BacktestHorizons)-1]
	last := len(dates) - 1 - maxH
	first := max(sigmaWindow+minFHSSamples+maxH, last-BacktestDays+1)
	rep := BacktestReport{Scope: s.ID, Source: s.Source, From: dates[first], To: dates[last], Step: BacktestStep,
		Regions: len(s.Regions), Synthetic: s.Synthetic, Rows: []BacktestRow{}}

	d := s.d()
	type acc struct {
		absErr, absNaive, width float64
		inside, n               int
	}
	for _, id := range s.Commodities {
		ci, c := commodityIndex[id], Commodities[commodityIndex[id]]
		sums := make([]acc, len(BacktestHorizons))
		for ri := range s.Regions {
			p := d.prices[ci][ri]
			if p == nil {
				continue
			}
			for t := first; t <= last; t += BacktestStep {
				f := d.forecastAt(ci, ri, t, BacktestHorizons)
				for k, h := range BacktestHorizons {
					pt := f.Points[k]
					actual := p[t+h]
					s := &sums[k]
					s.absErr += math.Abs(actual - pt.P50)
					s.absNaive += math.Abs(actual - p[t])
					s.width += (pt.P90 - pt.P10) / p[t]
					if actual >= pt.P10 && actual <= pt.P90 {
						s.inside++
					}
					s.n++
				}
			}
		}
		for k, h := range BacktestHorizons {
			s := sums[k]
			if s.n == 0 {
				continue
			}
			row := BacktestRow{CommodityID: c.ID, Horizon: h, Samples: s.n,
				Coverage: round(float64(s.inside)/float64(s.n), 3), BandWidth: round(s.width/float64(s.n), 3)}
			if s.absNaive > 0 {
				row.MASE = round(s.absErr/s.absNaive, 3)
			}
			rep.Rows = append(rep.Rows, row)
		}
	}
	return rep
}
