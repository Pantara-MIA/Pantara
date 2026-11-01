package regional

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	"sort"
)

// RegenciesFile lists the regencies/cities of every province except West Java
// (built by model/build_regency_maps.py from BPS boundaries).
const RegenciesFile = "data/regions/regencies.json"

// dataStart is the first day of every scope's price series.
const dataStart = "2024-09-01"

// dates is the daily calendar shared by every scope.
var dates []string

// Init loads master data, builds the scopes and prepares their price series.
func Init(fsys fs.FS) {
	dataFS = fsys
	initCommodities(fsys)
	initCalendar(fsys)
	initClimate(fsys)
	initModels(fsys)

	observed, last := loadPIHPS(fsys)
	if last == "" {
		last = syntheticEnd
	}
	dates = dateRange(dataStart, last)

	national := &Scope{
		ID: ScopeNational, Name: "Indonesia", Level: "province",
		Regions: append([]Region(nil), Provinces...), ownBaseline: true,
	}
	for i := range national.Regions {
		national.Regions[i].Type = "province"
	}
	linkNeighbors(national.Regions, provinceBorders)
	register(national)
	var nationalPrices [][][]float64
	nationalSource := SourcePIHPS
	if len(observed) > 0 {
		national.Source = "PIHPS Bank Indonesia, pasar tradisional"
		national.RealShare = 1
		nationalPrices = pihpsSeries(national.Regions, observed)
	} else {
		log.Printf("Warning: data/pihps/province_prices.csv not found, provinces use synthetic data")
		national.Source = "sintetis, dibangkitkan Pantara"
		national.Synthetic = true
		nationalSource = SourceSynthetic
		nationalPrices = generatePrices(national, nil, 0)
	}
	nd, commodities := national.derive(nationalPrices, uniformSource(nationalPrices, nationalSource))
	national.data.Store(nd)
	national.Commodities = commodities
	for ri := range national.Regions {
		for ci := range Commodities {
			if nationalPrices[ci][ri] != nil && nationalSource != SourceSynthetic {
				national.Regions[ri].RealCommodities++
			}
		}
	}
	coverage := sp2kpCoverage(fsys)

	jabar := &Scope{
		ID: ScopeJabar, Name: "Jawa Barat", Level: "regency",
		Parent: ScopeNational, Region: "jawa-barat",
		Regions: append([]Region(nil), jabarRegions...), Synthetic: true,
	}
	linkNeighbors(jabar.Regions, jabarBorders)
	register(jabar)
	jabar.describeRegencySource(coverage)
	national.Regions[national.index["jawa-barat"]].ChildScope = ScopeJabar
	// West Java's synthetic levels are calibrated as is (no level shift).
	jabarPrices := generatePrices(jabar, national.anchorFor("jawa-barat"), 0)
	jd, commodities := jabar.derive(jabarPrices, jabar.overlaySP2KP(jabarPrices))
	jabar.data.Store(jd)
	jabar.Commodities = commodities

	lazy := loadProvinceScopes(fsys, national, coverage)
	for _, s := range Scopes {
		if s.build == nil {
			log.Printf("Scope %s: %d regions × %d commodities × %d days (%s)",
				s.ID, len(s.Regions), len(s.Commodities), len(dates), s.Source)
		}
	}
	log.Printf("Scopes: %d provinces with regency data built on demand", lazy)
}

// uniformSource marks every series with data as coming from one source.
func uniformSource(prices [][][]float64, source string) [][]string {
	out := make([][]string, len(prices))
	for ci := range prices {
		out[ci] = make([]string, len(prices[ci]))
		for ri, p := range prices[ci] {
			if p != nil {
				out[ci][ri] = source
			}
		}
	}
	return out
}

// describeRegencySource fills RealCommodities per region and the scope's
// RealShare and Source from the SP2KP coverage (commodities per region with
// enough reports to replace the synthetic series).
func (s *Scope) describeRegencySource(coverage map[string]int) {
	real := 0
	for i := range s.Regions {
		s.Regions[i].RealCommodities = coverage[s.Regions[i].ID]
		real += coverage[s.Regions[i].ID]
	}
	s.RealShare = round(float64(real)/float64(len(s.Regions)*len(Commodities)), 3)
	switch {
	case s.RealShare == 0:
		s.Source = "sintetis, mengikuti pola harga PIHPS " + s.Name
	case s.RealShare >= 1:
		s.Source = "SP2KP Kemendag"
		s.Synthetic = false
	default:
		s.Source = fmt.Sprintf("SP2KP Kemendag untuk %.0f%% seri harga; sisanya sintetis mengikuti pola PIHPS %s", s.RealShare*100, s.Name)
	}
}

// anchorFor returns the real price series of a province per commodity (nil
// where PIHPS has none), used as the level of its synthetic regencies.
func (s *Scope) anchorFor(provinceID string) [][]float64 {
	anchor := make([][]float64, len(Commodities))
	if s.Synthetic {
		return anchor
	}
	for ci, c := range Commodities {
		anchor[ci] = s.Prices(provinceID, c.ID)
	}
	return anchor
}

// levelShift is the province's typical log price gap to the national median
// over commodities with real data; it shifts the synthetic level of the other
// commodities (eastern provinces are pricier across the board).
func (s *Scope) levelShift(provinceID string) float64 {
	var gaps []float64
	for _, id := range s.Commodities {
		p := s.Prices(provinceID, id)
		med := s.Median(id)
		if p == nil {
			continue
		}
		var sum float64
		for t := range p {
			sum += math.Log(p[t] / med[t])
		}
		gaps = append(gaps, sum/float64(len(p)))
	}
	return median(gaps)
}

type regencyFile []struct {
	Province string `json:"province"`
	Regions  []struct {
		ID         string   `json:"id"`
		Name       string   `json:"name"`
		Type       string   `json:"type"`
		Population int      `json:"population"`
		Neighbors  []string `json:"neighbors"`
	} `json:"regions"`
}

// loadProvinceScopes registers one lazily built regency scope per province in
// RegenciesFile and links it for drill-down. It returns how many were added.
func loadProvinceScopes(fsys fs.FS, national *Scope, coverage map[string]int) int {
	raw, err := fs.ReadFile(fsys, RegenciesFile)
	if err != nil {
		log.Printf("Warning: %s not found, only West Java has regency data: %v", RegenciesFile, err)
		return 0
	}
	var file regencyFile
	if err := json.Unmarshal(raw, &file); err != nil {
		log.Printf("Warning: malformed %s: %v", RegenciesFile, err)
		return 0
	}
	all := make([]string, len(Commodities))
	for i, c := range Commodities {
		all[i] = c.ID
	}
	added := 0
	for _, p := range file {
		prov, ok := FindRegion(p.Province)
		if !ok || p.Province == ScopeJabar {
			continue
		}
		s := &Scope{
			ID: p.Province, Name: prov.Name, Level: "regency",
			Parent: ScopeNational, Region: p.Province, Synthetic: true,
			Commodities: all,
		}
		for _, r := range p.Regions {
			s.Regions = append(s.Regions, Region{ID: r.ID, Name: r.Name, Type: r.Type, Population: r.Population, Neighbors: r.Neighbors})
		}
		register(s)
		s.describeRegencySource(coverage)
		national.Regions[national.index[p.Province]].ChildScope = s.ID
		provinceID := p.Province
		s.build = func() ([][][]float64, [][]string) {
			prices := generatePrices(s, national.anchorFor(provinceID), national.levelShift(provinceID))
			return prices, s.overlaySP2KP(prices)
		}
		added++
	}
	return added
}

// zoneOf returns the rice HET zone of a region (its province's zone).
func (s *Scope) zoneOf(ri int) int {
	id := s.Regions[ri].ID
	if s.Region != "" {
		id = s.Region
	}
	if z, ok := priceZone[id]; ok {
		return z
	}
	return 1
}

// derive builds a scope's data from its prices and their sources: medians,
// references and the forecaster's inputs. It also returns the commodities
// that have data.
func (s *Scope) derive(prices [][][]float64, source [][]string) (*scopeData, []string) {
	nc, nr := len(Commodities), len(s.Regions)
	d := &scopeData{
		prices:    prices,
		source:    source,
		refType:   make([][]string, nc),
		median:    make([][]float64, nc),
		reference: make([][][]float64, nc),
		normal:    make([][][]float64, nc),
		logPrices: make([][][]float64, nc),
		sigmas:    make([][][]float64, nc),
	}
	commodities := []string{}
	for ci, c := range Commodities {
		d.reference[ci] = make([][]float64, nr)
		d.refType[ci] = make([]string, nr)
		d.normal[ci] = make([][]float64, nr)
		d.logPrices[ci] = make([][]float64, nr)
		d.sigmas[ci] = make([][]float64, nr)
		var with [][]float64
		for _, p := range prices[ci] {
			if p != nil {
				with = append(with, p)
			}
		}
		if len(with) == 0 {
			continue
		}
		commodities = append(commodities, c.ID)
		d.median[ci] = medianAcross(with)
		for ri, p := range prices[ci] {
			if p == nil {
				continue
			}
			base := d.median[ci]
			if s.ownBaseline {
				base = p
			}
			d.normal[ci][ri] = computeDailyReference(Reference{Type: "baseline"}, 0, base)
			d.reference[ci][ri] = d.normal[ci][ri]
			ref := c.ReferenceFor(source[ci][ri])
			d.refType[ci][ri] = ref.Type
			if ref.Type != "baseline" {
				d.reference[ci][ri] = computeDailyReference(ref, s.zoneOf(ri), base)
			}
			lp := make([]float64, len(dates))
			for t, v := range p {
				lp[t] = math.Log(v)
			}
			sg := make([]float64, len(dates))
			for t := range sg {
				sg[t] = sigmaAt(lp, t)
			}
			d.logPrices[ci][ri], d.sigmas[ci][ri] = lp, sg
		}
	}
	return d, commodities
}

func median(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}

func medianAcross(series [][]float64) []float64 {
	out := make([]float64, len(dates))
	buf := make([]float64, len(series))
	for t := range dates {
		for i := range series {
			buf[i] = series[i][t]
		}
		out[t] = median(buf)
	}
	return out
}

// computeDailyReference: the zone's value for HET/HAP; for the baseline, the
// median of the BaselineWindow days of base BEFORE day t (excluding t) plus the
// tolerance. The window is shortened at the start of the series so it stays defined.
func computeDailyReference(ref Reference, zone int, base []float64) []float64 {
	out := make([]float64, len(base))
	for t := range base {
		if ref.Type != "baseline" {
			out[t] = ref.ValueIn(zone)
			continue
		}
		window := base[max(0, t-BaselineWindow):t]
		if len(window) == 0 {
			window = base[:1]
		}
		out[t] = median(window) * (1 + BaselineTolerance)
	}
	return out
}

// Dates returns every observation date (ascending).
func Dates() []string { return dates }

// DateBounds returns the first and last date in the data.
func DateBounds() (string, string) {
	if len(dates) == 0 {
		return "", ""
	}
	return dates[0], dates[len(dates)-1]
}

// DateIndex returns the index of the last day <= s, or -1.
func DateIndex(s string) int {
	i := sort.SearchStrings(dates, s)
	if i < len(dates) && dates[i] == s {
		return i
	}
	return i - 1
}
