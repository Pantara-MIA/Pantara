package regional

import (
	"compress/gzip"
	"encoding/csv"
	"io"
	"io/fs"
	"log"
	"strconv"
)

// SP2KPFile holds daily regency/city prices from SP2KP (Kemendag), keyed by
// Pantara region ID (built by model/build_app_data.py): date,region_id,<commodities>.
const SP2KPFile = "data/sp2kp/regency_prices.csv.gz"

// dataFS is the file system Init was given; lazily built scopes read from it.
var dataFS fs.FS

// readSP2KP streams SP2KPFile and returns the reports of the wanted regions:
// obs[regionID][commodityID][date] = price. With want == nil every region is kept.
func readSP2KP(fsys fs.FS, want map[string]bool) map[string]map[string]map[string]float64 {
	out := map[string]map[string]map[string]float64{}
	if fsys == nil {
		return out
	}
	f, err := fsys.Open(SP2KPFile)
	if err != nil {
		return out
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		log.Printf("Warning: %s is not gzip: %v", SP2KPFile, err)
		return out
	}
	r := csv.NewReader(gz)
	header, err := r.Read()
	if err != nil || len(header) < 3 {
		return out
	}
	cols := header[2:]
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) != len(header) || (want != nil && !want[rec[1]]) {
			continue
		}
		byCom := out[rec[1]]
		if byCom == nil {
			byCom = map[string]map[string]float64{}
			out[rec[1]] = byCom
		}
		for i, c := range cols {
			if rec[i+2] == "" {
				continue
			}
			v, err := strconv.ParseFloat(rec[i+2], 64)
			if err != nil || v <= 0 {
				continue
			}
			if byCom[c] == nil {
				byCom[c] = map[string]float64{}
			}
			byCom[c][rec[0]] = v
		}
	}
	return out
}

// sp2kpCoverage counts, per region, the commodities whose SP2KP series has
// enough reports to replace the synthetic one.
func sp2kpCoverage(fsys fs.FS) map[string]int {
	out := map[string]int{}
	for rid, byCom := range readSP2KP(fsys, nil) {
		for c, raw := range byCom {
			if _, known := commodityIndex[c]; known && fillSeries(raw, 0) != nil {
				out[rid]++
			}
		}
	}
	return out
}

// overlaySP2KP replaces a scope's synthetic series with SP2KP reports wherever
// they are complete enough, and returns the source of every series.
func (s *Scope) overlaySP2KP(prices [][][]float64) [][]string {
	want := map[string]bool{}
	for _, r := range s.Regions {
		want[r.ID] = true
	}
	obs := readSP2KP(dataFS, want)
	source := make([][]string, len(Commodities))
	for ci, c := range Commodities {
		source[ci] = make([]string, len(s.Regions))
		for ri, r := range s.Regions {
			if prices[ci][ri] != nil {
				source[ci][ri] = SourceSynthetic
			}
			if series := fillSeries(obs[r.ID][c.ID], 0); series != nil {
				prices[ci][ri] = series
				source[ci][ri] = SourceSP2KP
			}
		}
	}
	return source
}
