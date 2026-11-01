package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"pantara/internal/regional"
	"sort"
	"strconv"
	"sync"
)

// ─── Watchlist ───────────────────────────────────────────────────────────────

type WatchItem struct {
	RegionID      string  `json:"region_id"`
	RegionName    string  `json:"region_name"`
	CommodityID   string  `json:"commodity_id"`
	CommodityName string  `json:"commodity_name"`
	CurrentPrice  float64 `json:"current_price"`
	Reference     float64 `json:"reference"`
	regional.Alert
}

type WatchlistResponse struct {
	AsOf  string      `json:"as_of"`
	Items []WatchItem `json:"items"`
}

var (
	watchCache   = map[string]WatchlistResponse{}
	watchCacheMu sync.Mutex
)

// handleWatchlist lists every region × commodity that is above its reference
// or on watch, most urgent first. region is a region ID, or a scope ID for
// every region of that scope (default: national).
func handleWatchlist(w http.ResponseWriter, r *http.Request) {
	regionID := r.URL.Query().Get("region")
	if regionID == "" {
		regionID = regional.ScopeNational
	}
	var regions []regional.Region
	if s, ok := regional.FindScope(regionID); ok {
		regions = s.Regions
	} else if reg, ok := regional.FindRegion(regionID); ok {
		regions = []regional.Region{reg}
	} else {
		writeError(w, http.StatusBadRequest, "unknown region")
		return
	}
	now := asOfIndex(r)
	if now < 0 {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}
	key := strconv.Itoa(now) + "|" + regionID
	watchCacheMu.Lock()
	res, ok := watchCache[key]
	watchCacheMu.Unlock()
	if !ok {
		res = WatchlistResponse{AsOf: regional.Dates()[now], Items: []WatchItem{}}
		for _, reg := range regions {
			for _, c := range regional.Commodities {
				a := regionAlert(reg.ID, c.ID, now)
				if a.Status == regional.StatusNormal || a.Status == statusNoData {
					continue
				}
				res.Items = append(res.Items, WatchItem{
					RegionID: reg.ID, RegionName: reg.Name, CommodityID: c.ID, CommodityName: c.Name,
					CurrentPrice: a.CurrentPrice, Reference: a.Reference, Alert: a.Alert,
				})
			}
		}
		sort.SliceStable(res.Items, func(i, j int) bool {
			a, b := res.Items[i], res.Items[j]
			if statusRank[a.Status] != statusRank[b.Status] {
				return statusRank[a.Status] > statusRank[b.Status]
			}
			return a.MaxBreachProb > b.MaxBreachProb
		})
		watchCacheMu.Lock()
		watchCache[key] = res
		watchCacheMu.Unlock()
	}
	writeJSON(w, http.StatusOK, res)
}

// ─── CSV exports (open data) ─────────────────────────────────────────────────

// utf8BOM makes Excel open the CSV as UTF-8.
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// csvWriter starts a UTF-8 CSV download with a byte-order mark.
func csvWriter(w http.ResponseWriter, filename string) *csv.Writer {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Write(utf8BOM)
	return csv.NewWriter(w)
}

func num(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// handleExportPrices: daily history plus the 14-day forecast for one region × commodity.
func handleExportPrices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	reg, ok1 := regional.FindRegion(q.Get("region"))
	com, ok2 := regional.FindCommodity(q.Get("commodity"))
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "unknown region or commodity")
		return
	}
	scope, _ := regional.ScopeOf(reg.ID)
	p := scope.Prices(reg.ID, com.ID)
	if p == nil {
		writeError(w, http.StatusNotFound, "Belum ada data harga untuk daerah dan komoditas ini.")
		return
	}
	days := 365
	if n, err := strconv.Atoi(q.Get("days")); err == nil && n > 0 {
		days = min(n, maxSeriesDays)
	}
	now := asOfIndex(r)
	if now < 0 {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}
	dates := regional.Dates()
	ref := scope.Reference(reg.ID, com.ID)
	med := scope.Median(com.ID)

	source, refType := scope.SeriesInfo(reg.ID, com.ID)
	sourceLabel := regional.SourceLabel(source)
	cw := csvWriter(w, fmt.Sprintf("pantara_harga_%s_%s_%s.csv", reg.ID, com.ID, dates[now]))
	cw.Write([]string{"tanggal", "jenis", "kode_daerah", "daerah", "kode_komoditas", "komoditas", "satuan",
		"harga", "acuan", "jenis_acuan", "median_tetangga", "median_cakupan", "p10", "p50", "p90", "peluang_lampaui_acuan", "sumber_data"})
	base := []string{reg.ID, reg.Name, com.ID, com.Name, com.Unit}
	for t := max(0, now-days+1); t <= now; t++ {
		row := append([]string{dates[t], "observasi"}, base...)
		row = append(row, num(p[t]), num(ref[t]), refType,
			num(scope.NeighborMedian(reg.ID, com.ID, t)), num(med[t]), "", "", "", "", sourceLabel)
		cw.Write(row)
	}
	if f, ok := regional.ComputeForecast(reg.ID, com.ID, now); ok {
		for _, pt := range f.Points {
			row := append([]string{pt.Date, "prakiraan"}, base...)
			row = append(row, "", num(f.Reference), refType, "", "", num(pt.P10), num(pt.P50), num(pt.P90), num(pt.BreachProb), "model Pantara")
			cw.Write(row)
		}
	}
	cw.Flush()
}

// handleExportScorecard: the full scorecard of every region of a scope for one month.
func handleExportScorecard(w http.ResponseWriter, r *http.Request) {
	scope, ok := scopeParam(w, r)
	if !ok {
		return
	}
	month := r.URL.Query().Get("month")
	if month == "" {
		month = latestMonth()
	}
	all, err := regional.ComputeScorecard(scope.ID, month, r.URL.Query().Get("commodity"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cw := csvWriter(w, fmt.Sprintf("pantara_rapor_%s_%s.csv", scope.ID, month))
	cw.Write([]string{"bulan", "peringkat", "kode_daerah", "daerah", "skor_daerah", "predikat_daerah", "kode_komoditas", "komoditas",
		"skor_komoditas", "predikat_komoditas", "hari_observasi", "hari_di_atas_batas_wajar", "jumlah_episode", "durasi_rata_hari",
		"pemulihan_rata_hari", "selisih_tetangga_persen", "selisih_cakupan_persen", "harga_rata", "batas_wajar_rata",
		"jenis_acuan", "het_hap_rata", "hari_di_atas_het_hap", "selisih_het_hap_persen", "kepatuhan_daerah_persen", "sumber_data"})
	for _, s := range all {
		reg, _ := regional.FindRegion(s.RegionID)
		compliance := ""
		if s.Compliance != nil {
			compliance = num(*s.Compliance)
		}
		for _, m := range s.Commodities {
			com, _ := regional.FindCommodity(m.CommodityID)
			ceiling, ceilingDays, ceilingGap := "", "", ""
			if m.Regulated {
				ceiling, ceilingDays, ceilingGap = num(m.MeanCeiling), strconv.Itoa(m.DaysAboveCeiling), num(m.CeilingGapPct)
			}
			cw.Write([]string{month, strconv.Itoa(s.Rank), reg.ID, reg.Name, num(s.Score), s.Grade, com.ID, com.Name,
				num(m.Score), m.Grade, strconv.Itoa(m.ObservedDays), strconv.Itoa(m.DaysAboveNormal), strconv.Itoa(len(m.Episodes)),
				num(m.MeanDuration), num(m.MeanRecovery), num(m.NeighborGapPct), num(m.ScopeGapPct), num(m.MeanPrice), num(m.MeanNormal),
				m.ReferenceType, ceiling, ceilingDays, ceilingGap, compliance, regional.SourceLabel(m.Source)})
		}
	}
	cw.Flush()
}

// handleExportInterventions: every published intervention with its evaluation.
func handleExportInterventions(w http.ResponseWriter, r *http.Request) {
	list, err := queryInterventions(`WHERE i.status = 'published' ORDER BY i.published_at DESC`)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Data intervensi belum dapat dimuat.")
		return
	}
	cw := csvWriter(w, "pantara_intervensi.csv")
	cw.Write([]string{"id", "dipublikasikan", "instansi", "kode_daerah", "daerah", "kode_komoditas", "komoditas", "jenis", "judul",
		"keterangan", "mulai", "selesai", "volume", "satuan_volume", "anggaran_rp", "tanggal_acuan_prakiraan", "harga_saat_dicatat",
		"acuan", "status_peringatan_saat_dicatat", "status_evaluasi", "hari_teramati", "selisih_vs_prakiraan_persen",
		"perubahan_daerah_persen", "perubahan_tetangga_persen", "selisih_relatif_poin"})
	opt := func(v *float64) string {
		if v == nil {
			return ""
		}
		return num(*v)
	}
	for _, it := range list {
		published := ""
		if it.PublishedAt != nil {
			published = it.PublishedAt.Format("2006-01-02 15:04")
		}
		ev := it.Evaluation
		cw.Write([]string{it.ID, published, it.AgencyName, it.RegionID, it.RegionName, it.CommodityID, it.CommodityName, it.Type,
			it.Title, it.Description, it.StartDate, it.EndDate, opt(it.Volume), it.VolumeUnit, opt(it.BudgetIDR), it.BaselineDate,
			num(it.Trigger.Forecast.CurrentPrice), num(it.Trigger.Forecast.Reference), it.Trigger.Alert.Status, ev.Status,
			strconv.Itoa(ev.ObservedDays), num(ev.GapVsForecastPct), num(ev.RegionChangePct), num(ev.NeighborChangePct), num(ev.RelativeChangePct)})
	}
	cw.Flush()
}
