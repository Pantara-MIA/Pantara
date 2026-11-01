package regional

import (
	"compress/gzip"
	"encoding/csv"
	"io"
	"io/fs"
	"log"
	"math"
	"sort"
	"strconv"
	"sync"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Climate risk per province (regencies/cities use their province's climate).
//
//   Rain 30/90 d  rain over the last 30/90 days ÷ the normal for those days.
//                 Normal per day = 2018–2025 mean of that calendar month's total
//                 ÷ days in the month (Open-Meteo / ERA5, one point per province).
//   Rain class    BMKG: < 85% below normal, 85–115% normal, > 115% above normal.
//   ENSO          the latest RONI season published by the as-of date (a season
//                 centred on month m is out at the start of month m + 2).
//   Level         high  = 90-day rain below normal AND El Niño, or rain < 50%;
//                 watch = 90-day rain below normal OR El Niño; otherwise low.
//                 Only conditions followed by HIGHER prices in Indonesian data
//                 raise the level (see model/analyze_climate.py): above-normal
//                 rain and La Niña were followed by lower chili/shallot prices.
//   Effects       per commodity, the historical deseasonalised price change two
//                 months after each active condition (data/climate/effects.csv);
//                 only effects that are significant and ≥ 1% are listed.
// ─────────────────────────────────────────────────────────────────────────────

const (
	ClimateRainFile    = "data/climate/province_rain.csv.gz"
	ClimateRONIFile    = "data/climate/roni.csv"
	ClimateEffectsFile = "data/climate/effects.csv"

	climateNormalFrom = "2018"
	climateNormalTo   = "2025"
	minEffectPct      = 1.0
)

// Climate risk levels.
const (
	ClimateLow   = "low"
	ClimateWatch = "watch"
	ClimateHigh  = "high"
)

// Climate drivers, matching the driver column of ClimateEffectsFile.
const (
	DriverDry    = "dry"
	DriverWet    = "wet"
	DriverElNino = "el_nino"
	DriverLaNina = "la_nina"
)

type ENSO struct {
	Season string  `json:"season"` // e.g. "JAS"
	Year   int     `json:"year"`
	Anom   float64 `json:"anom"`
	Phase  string  `json:"phase"`    // el_nino | la_nina | neutral
	Level  string  `json:"strength"` // kuat | sedang | lemah | "" (neutral)
}

type ClimateEffect struct {
	CommodityID string  `json:"commodity_id"`
	Driver      string  `json:"driver"`
	LeadMonths  int     `json:"lead_months"`
	EffectPct   float64 `json:"effect_pct"`
	LoPct       float64 `json:"lo_pct"`
	HiPct       float64 `json:"hi_pct"`
	N           int     `json:"n"`
	Significant bool    `json:"significant"`
}

type ProvinceClimate struct {
	RegionID    string          `json:"region_id"`
	Rain30Pct   float64         `json:"rain30_pct"`
	Rain90Pct   float64         `json:"rain90_pct"`
	Rain30Class string          `json:"rain30_class"` // below | normal | above
	Rain90Class string          `json:"rain90_class"`
	Level       string          `json:"level"`
	Drivers     []string        `json:"drivers"`
	Effects     []ClimateEffect `json:"effects"`
}

type ClimateSnapshot struct {
	AsOf        string            `json:"as_of"`
	WeatherAsOf string            `json:"weather_as_of"`
	ENSO        ENSO              `json:"enso"`
	Provinces   []ProvinceClimate `json:"provinces"`
	Available   bool              `json:"available"`
	// Effects is the full historical evidence table (every commodity × driver).
	Effects []ClimateEffect `json:"effects"`
}

type MonthRain struct {
	Month    string  `json:"month"`
	RainMM   float64 `json:"rain_mm"`
	NormalMM float64 `json:"normal_mm"`
	Pct      float64 `json:"pct"`
}

var climate struct {
	start   time.Time            // first day of the rain series
	rain    map[string][]float64 // province code -> mm per day from start (NaN = missing)
	normal  map[string][13]float64
	roni    []roniSeason // ascending
	effects []ClimateEffect
	cache   map[string]ClimateSnapshot
	mu      sync.Mutex
}

func initClimate(fsys fs.FS) {
	climate.rain = map[string][]float64{}
	climate.normal = map[string][13]float64{}
	climate.cache = map[string]ClimateSnapshot{}
	loadRain(fsys)
	loadRONI(fsys)
	loadEffects(fsys)
	if len(climate.rain) > 0 {
		log.Printf("Climate: rain for %d provinces, %d RONI seasons, %d effects", len(climate.rain), len(climate.roni), len(climate.effects))
	}
}

func loadRain(fsys fs.FS) {
	f, err := fsys.Open(ClimateRainFile)
	if err != nil {
		log.Printf("Warning: %s not found, climate risk disabled", ClimateRainFile)
		return
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return
	}
	r := csv.NewReader(gz)
	_, _ = r.Read()
	type obs struct {
		day time.Time
		mm  float64
	}
	byProv := map[string][]obs{}
	first := time.Time{}
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) < 3 {
			continue
		}
		day, err1 := time.Parse("2006-01-02", rec[0])
		mm, err2 := strconv.ParseFloat(rec[2], 64)
		if err1 != nil || err2 != nil {
			continue
		}
		if first.IsZero() || day.Before(first) {
			first = day
		}
		byProv[rec[1]] = append(byProv[rec[1]], obs{day, mm})
	}
	climate.start = first
	for code, list := range byProv {
		last := first
		for _, o := range list {
			if o.day.After(last) {
				last = o.day
			}
		}
		series := make([]float64, int(last.Sub(first).Hours()/24)+1)
		for i := range series {
			series[i] = math.NaN()
		}
		monthly := map[string]float64{}
		for _, o := range list {
			series[int(o.day.Sub(first).Hours()/24)] = o.mm
			monthly[o.day.Format("2006-01")] += o.mm
		}
		var sum, n [13]float64
		for m, total := range monthly {
			if m[:4] >= climateNormalFrom && m[:4] <= climateNormalTo {
				mo, _ := strconv.Atoi(m[5:])
				sum[mo] += total
				n[mo]++
			}
		}
		var normal [13]float64
		for mo := 1; mo <= 12; mo++ {
			if n[mo] > 0 {
				normal[mo] = sum[mo] / n[mo]
			}
		}
		climate.rain[code] = series
		climate.normal[code] = normal
	}
}

// roniSeason is one RONI value with the centre month of its 3-month season.
type roniSeason struct {
	year, month int
	ENSO
}

func loadRONI(fsys fs.FS) {
	f, err := fsys.Open(ClimateRONIFile)
	if err != nil {
		return
	}
	defer f.Close()
	r := csv.NewReader(f)
	_, _ = r.Read()
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) < 5 {
			continue
		}
		year, _ := strconv.Atoi(rec[1])
		month, _ := strconv.Atoi(rec[2])
		anom, _ := strconv.ParseFloat(rec[3], 64)
		climate.roni = append(climate.roni, roniSeason{year, month, ENSO{Season: rec[0], Year: year, Anom: anom, Phase: rec[4]}})
	}
	sort.Slice(climate.roni, func(i, j int) bool {
		a, b := climate.roni[i], climate.roni[j]
		return a.year*12+a.month < b.year*12+b.month
	})
}

// roniAvailable returns the latest season published by asOf (see the header).
func roniAvailable(asOf time.Time) (ENSO, bool) {
	limit := asOf.Year()*12 + int(asOf.Month())
	var best ENSO
	ok := false
	for _, e := range climate.roni {
		if e.year*12+e.month+2 <= limit {
			best, ok = e.ENSO, true
		}
	}
	if !ok {
		return ENSO{}, false
	}
	switch a := math.Abs(best.Anom); {
	case best.Phase == "neutral":
		best.Level = ""
	case a >= 1.5:
		best.Level = "kuat"
	case a >= 1.0:
		best.Level = "sedang"
	default:
		best.Level = "lemah"
	}
	return best, true
}

func loadEffects(fsys fs.FS) {
	f, err := fsys.Open(ClimateEffectsFile)
	if err != nil {
		return
	}
	defer f.Close()
	r := csv.NewReader(f)
	_, _ = r.Read()
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) < 8 {
			continue
		}
		e := ClimateEffect{CommodityID: rec[0], Driver: rec[1], Significant: rec[7] == "1"}
		e.LeadMonths, _ = strconv.Atoi(rec[2])
		e.EffectPct, _ = strconv.ParseFloat(rec[3], 64)
		e.LoPct, _ = strconv.ParseFloat(rec[4], 64)
		e.HiPct, _ = strconv.ParseFloat(rec[5], 64)
		e.N, _ = strconv.Atoi(rec[6])
		climate.effects = append(climate.effects, e)
	}
}

// rainRatio is the rain over the `days` days ending at `end` ÷ the normal.
func rainRatio(code string, end time.Time, days int) (float64, bool) {
	series, ok := climate.rain[code]
	if !ok {
		return 0, false
	}
	normal := climate.normal[code]
	var got, want float64
	for i := 0; i < days; i++ {
		d := end.AddDate(0, 0, -i)
		idx := int(d.Sub(climate.start).Hours() / 24)
		if idx < 0 || idx >= len(series) || math.IsNaN(series[idx]) {
			return 0, false
		}
		got += series[idx]
		dim := time.Date(d.Year(), d.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
		want += normal[int(d.Month())] / float64(dim)
	}
	if want <= 0 {
		return 0, false
	}
	return got / want, true
}

func rainClass(ratio float64) string {
	switch {
	case ratio < 0.85:
		return "below"
	case ratio > 1.15:
		return "above"
	}
	return "normal"
}

// weatherEnd is the last day with rain data for every province.
func weatherEnd() time.Time {
	end := time.Time{}
	for _, s := range climate.rain {
		last := climate.start.AddDate(0, 0, len(s)-1)
		if end.IsZero() || last.Before(end) {
			end = last
		}
	}
	return end
}

// ClimateAt returns the climate risk of every province on asOf (YYYY-MM-DD).
func ClimateAt(asOf string) ClimateSnapshot {
	climate.mu.Lock()
	if s, ok := climate.cache[asOf]; ok {
		climate.mu.Unlock()
		return s
	}
	climate.mu.Unlock()

	out := ClimateSnapshot{AsOf: asOf, Provinces: []ProvinceClimate{}, Effects: climate.effects}
	day, err := time.Parse("2006-01-02", asOf)
	if err != nil || len(climate.rain) == 0 {
		return out
	}
	end := day
	if we := weatherEnd(); we.Before(end) {
		end = we
	}
	out.WeatherAsOf = end.Format("2006-01-02")
	enso, ensoOK := roniAvailable(day)
	if ensoOK {
		out.ENSO = enso
	}
	elNino := ensoOK && enso.Anom >= 0.5
	laNina := ensoOK && enso.Anom <= -0.5

	for _, p := range Provinces {
		r30, ok30 := rainRatio(p.Code, end, 30)
		r90, ok90 := rainRatio(p.Code, end, 90)
		if !ok30 || !ok90 {
			continue
		}
		pc := ProvinceClimate{
			RegionID: p.ID, Rain30Pct: round(r30*100, 0), Rain90Pct: round(r90*100, 0),
			Rain30Class: rainClass(r30), Rain90Class: rainClass(r90), Drivers: []string{}, Effects: []ClimateEffect{},
		}
		dry := r90 < 0.85
		if dry {
			pc.Drivers = append(pc.Drivers, DriverDry)
		}
		if r90 > 1.15 {
			pc.Drivers = append(pc.Drivers, DriverWet)
		}
		if elNino {
			pc.Drivers = append(pc.Drivers, DriverElNino)
		}
		if laNina {
			pc.Drivers = append(pc.Drivers, DriverLaNina)
		}
		switch {
		case (dry && elNino) || r90 < 0.5:
			pc.Level = ClimateHigh
		case dry || elNino:
			pc.Level = ClimateWatch
		default:
			pc.Level = ClimateLow
		}
		for _, e := range climate.effects {
			for _, d := range pc.Drivers {
				if e.Driver == d && e.Significant && e.EffectPct >= minEffectPct {
					pc.Effects = append(pc.Effects, e)
				}
			}
		}
		sort.SliceStable(pc.Effects, func(i, j int) bool { return pc.Effects[i].EffectPct > pc.Effects[j].EffectPct })
		out.Provinces = append(out.Provinces, pc)
	}
	out.Available = len(out.Provinces) > 0

	climate.mu.Lock()
	climate.cache[asOf] = out
	climate.mu.Unlock()
	return out
}

// ClimateProvince returns the province whose climate applies to a region.
func ClimateProvince(regionID string) (Region, bool) {
	reg, ok := FindRegion(regionID)
	if !ok {
		return Region{}, false
	}
	if reg.Type == "province" {
		return reg, true
	}
	s, _ := ScopeOf(regionID)
	return FindRegion(s.Region)
}

// RainHistory returns monthly rain vs normal for a province, the last `months`
// complete or partial months up to asOf (capped at the weather data).
func RainHistory(provinceID, asOf string, months int) []MonthRain {
	prov, ok := FindRegion(provinceID)
	out := []MonthRain{}
	series, ok2 := climate.rain[prov.Code]
	day, err := time.Parse("2006-01-02", asOf)
	if !ok || !ok2 || err != nil {
		return out
	}
	if we := weatherEnd(); we.Before(day) {
		day = we
	}
	normal := climate.normal[prov.Code]
	first := time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -(months - 1), 0)
	for m := first; !m.After(day); m = m.AddDate(0, 1, 0) {
		var got float64
		days := 0
		for d := m; d.Month() == m.Month() && !d.After(day); d = d.AddDate(0, 0, 1) {
			idx := int(d.Sub(climate.start).Hours() / 24)
			if idx >= 0 && idx < len(series) && !math.IsNaN(series[idx]) {
				got += series[idx]
				days++
			}
		}
		dim := time.Date(m.Year(), m.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
		want := normal[int(m.Month())] * float64(days) / float64(dim)
		mr := MonthRain{Month: m.Format("2006-01"), RainMM: round(got, 0), NormalMM: round(want, 0)}
		if want > 0 {
			mr.Pct = round(got/want*100, 0)
		}
		out = append(out, mr)
	}
	return out
}
