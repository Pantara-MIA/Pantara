package regional

import (
	"encoding/csv"
	"io"
	"io/fs"
	"log"
	"sort"
	"strconv"
	"time"
)

// PIHPSFile holds daily province prices fetched by model/fetch_pihps.py.
const PIHPSFile = "data/pihps/province_prices.csv"

// minCoverage is the share of weekdays a series must report to be used.
const minCoverage = 0.5

// observations[provinceCode][commodityID][date] = price
type observations map[string]map[string]map[string]float64

// loadPIHPS reads PIHPSFile (date,province_id,commodity_id,price) and returns
// the observations and the last reported date ("" when the file is missing).
func loadPIHPS(fsys fs.FS) (observations, string) {
	f, err := fsys.Open(PIHPSFile)
	if err != nil {
		return nil, ""
	}
	defer f.Close()

	obs := observations{}
	last := ""
	r := csv.NewReader(f)
	_, _ = r.Read()
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) < 4 {
			continue
		}
		price, err := strconv.ParseFloat(rec[3], 64)
		if err != nil || price <= 0 || rec[0] < dataStart {
			continue
		}
		if _, ok := commodityIndex[rec[2]]; !ok {
			continue
		}
		byCom := obs[rec[1]]
		if byCom == nil {
			byCom = map[string]map[string]float64{}
			obs[rec[1]] = byCom
		}
		if byCom[rec[2]] == nil {
			byCom[rec[2]] = map[string]float64{}
		}
		byCom[rec[2]][rec[0]] = price
		last = max(last, rec[0])
	}
	return obs, last
}

// pihpsSeries turns observations into daily series on the shared calendar
// (see fillSeries). PIHPS reports more than 3× away from the series median are
// treated as entry errors.
func pihpsSeries(regions []Region, obs observations) [][][]float64 {
	out := make([][][]float64, len(Commodities))
	for ci, c := range Commodities {
		out[ci] = make([][]float64, len(regions))
		for ri, reg := range regions {
			raw := obs[reg.Code][c.ID]
			out[ci][ri] = fillSeries(raw, 3)
			if out[ci][ri] == nil && len(raw) > 0 {
				log.Printf("PIHPS: %s/%s skipped, only %d reports", reg.ID, c.ID, len(raw))
			}
		}
	}
	return out
}

// calendarWeekdays counts the weekdays in the shared calendar.
func calendarWeekdays() int {
	n := 0
	for _, d := range dates {
		if wd := weekday(d); wd != time.Saturday && wd != time.Sunday {
			n++
		}
	}
	return n
}

// enoughReports reports whether a series reports on at least minCoverage of
// the calendar's weekdays.
func enoughReports(reports int) bool {
	return float64(reports) >= minCoverage*float64(calendarWeekdays())
}

// fillSeries turns sparse reports (date -> price) into a daily series on the
// shared calendar. Days without a report (weekends, holidays) carry the last
// reported price; days before the first report take the first one. When
// outlier > 0, reports more than that factor away from the series median are
// skipped. It returns nil when the series has too few reports in the calendar.
func fillSeries(raw map[string]float64, outlier float64) []float64 {
	inCalendar := 0
	for d := range raw {
		if len(dates) > 0 && d >= dates[0] && d <= dates[len(dates)-1] {
			inCalendar++
		}
	}
	if !enoughReports(inCalendar) {
		return nil
	}
	mid := 0.0
	if outlier > 0 {
		vals := make([]float64, 0, len(raw))
		for _, v := range raw {
			vals = append(vals, v)
		}
		sort.Float64s(vals)
		mid = median(vals)
	}
	series := make([]float64, len(dates))
	prev, first := 0.0, -1
	for t, d := range dates {
		if v, ok := raw[d]; ok && (outlier <= 0 || (v < mid*outlier && v > mid/outlier)) {
			prev = v
			if first < 0 {
				first = t
			}
		}
		series[t] = prev
	}
	if first < 0 {
		return nil
	}
	for t := 0; t < first; t++ {
		series[t] = series[first]
	}
	return series
}

func weekday(d string) time.Weekday {
	t, _ := time.Parse("2006-01-02", d)
	return t.Weekday()
}
