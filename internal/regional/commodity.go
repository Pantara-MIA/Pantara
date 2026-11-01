package regional

import (
	"encoding/csv"
	"io"
	"io/fs"
	"log"
	"strconv"
)

// Commodity is one monitored food item. IDs follow the frontend knowledge base
// (web/src/data/commodities.*.ts).
type Commodity struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Unit      string  `json:"unit"`
	Category  string  `json:"category"`
	CPIWeight float64 `json:"cpi_weight"` // % of the national CPI basket
	// WeeklyPerCapita is indicative household consumption (unit per person per
	// week, Susenas-like magnitudes); it sizes demand in market-operation planning.
	WeeklyPerCapita float64   `json:"weekly_per_capita"`
	Reference       Reference `json:"reference"`
	// SourceReferences overrides Reference for series from one source, e.g. the
	// MinyaKita HET for SP2KP, which reports MinyaKita (PIHPS reports branded oil).
	SourceReferences map[string]Reference `json:"source_references,omitempty"`
}

// ReferenceFor returns the reference for a series from the given source.
func (c Commodity) ReferenceFor(source string) Reference {
	if r, ok := c.SourceReferences[source]; ok {
		return r
	}
	return c.Reference
}

// Reference is the price ceiling used to detect spikes.
//   - "HET"/"HAP": fixed regulatory ceiling, optionally differing per price
//     zone (see priceZone).
//   - "baseline": no regulatory ceiling; the 90-day median price times
//     (1 + BaselineTolerance), moving daily. The median is the scope median
//     within a province and the region's own price across provinces.
type Reference struct {
	Type  string  `json:"type"`
	Value float64 `json:"value,omitempty"`
	// Zones overrides Value per price zone (1–3), when the ceiling is zoned.
	Zones  map[int]float64 `json:"zones,omitempty"`
	Basis  string          `json:"basis"`  // shown to users, so written in Indonesian
	Status string          `json:"status"` // "verified" | "indicative"
}

// ValueIn returns the regulatory ceiling in a price zone.
func (r Reference) ValueIn(zone int) float64 {
	if v, ok := r.Zones[zone]; ok {
		return v
	}
	return r.Value
}

// BaselineTolerance is the band above the 90-day median for statistical references.
const BaselineTolerance = 0.10

// BaselineWindow is the median window for statistical references (days).
const BaselineWindow = 90

var Commodities = []Commodity{
	{ID: "cabai-rawit-merah", Name: "Cabai Rawit Merah", Unit: "kg", Category: "chili", CPIWeight: 0.36, WeeklyPerCapita: 0.025},
	{ID: "cabai-rawit-hijau", Name: "Cabai Rawit Hijau", Unit: "kg", Category: "chili", CPIWeight: 0.11, WeeklyPerCapita: 0.01},
	{ID: "cabai-merah-keriting", Name: "Cabai Merah Keriting", Unit: "kg", Category: "chili", CPIWeight: 0.28, WeeklyPerCapita: 0.03},
	{ID: "cabai-merah-besar", Name: "Cabai Merah Besar (TW)", Unit: "kg", Category: "chili", CPIWeight: 0.19, WeeklyPerCapita: 0.02},
	{ID: "cabai-hijau-besar", Name: "Cabai Hijau Besar", Unit: "kg", Category: "chili", CPIWeight: 0.09, WeeklyPerCapita: 0.01},
	{ID: "beras-premium", Name: "Beras Premium", Unit: "kg", Category: "rice", CPIWeight: 3.7, WeeklyPerCapita: 0.4},
	{ID: "beras-medium", Name: "Beras Medium", Unit: "kg", Category: "rice", CPIWeight: 2.9, WeeklyPerCapita: 1.0},
	{ID: "beras-sphp", Name: "Beras Stabilisasi (SPHP)", Unit: "kg", Category: "rice", CPIWeight: 0.8, WeeklyPerCapita: 0.2},
	{ID: "beras-ketan-putih", Name: "Beras Ketan Putih", Unit: "kg", Category: "rice", CPIWeight: 0.12, WeeklyPerCapita: 0.02},
	{ID: "minyak-goreng", Name: "Minyak Goreng Kemasan Sederhana", Unit: "liter", Category: "pantry", CPIWeight: 1.1, WeeklyPerCapita: 0.2},
	{ID: "gula-pasir", Name: "Gula Pasir Lokal", Unit: "kg", Category: "pantry", CPIWeight: 0.6, WeeklyPerCapita: 0.13},
	{ID: "bawang-merah", Name: "Bawang Merah", Unit: "kg", Category: "spice", CPIWeight: 0.48, WeeklyPerCapita: 0.05},
	{ID: "bawang-putih", Name: "Bawang Putih", Unit: "kg", Category: "spice", CPIWeight: 0.21, WeeklyPerCapita: 0.035},
	{ID: "bawang-bombay", Name: "Bawang Bombay", Unit: "kg", Category: "spice", CPIWeight: 0.08, WeeklyPerCapita: 0.01},
	{ID: "daging-ayam-ras", Name: "Daging Ayam Ras", Unit: "kg", Category: "protein", CPIWeight: 1.4, WeeklyPerCapita: 0.15},
	{ID: "telur-ayam-ras", Name: "Telur Ayam Ras", Unit: "kg", Category: "protein", CPIWeight: 0.9, WeeklyPerCapita: 0.25},
	{ID: "daging-sapi", Name: "Daging Sapi Paha Belakang", Unit: "kg", Category: "protein", CPIWeight: 0.7, WeeklyPerCapita: 0.01},
	{ID: "tomat", Name: "Tomat Merah", Unit: "kg", Category: "vegetable", CPIWeight: 0.25, WeeklyPerCapita: 0.05},
	{ID: "kentang", Name: "Kentang", Unit: "kg", Category: "vegetable", CPIWeight: 0.14, WeeklyPerCapita: 0.04},
	{ID: "wortel", Name: "Wortel", Unit: "kg", Category: "vegetable", CPIWeight: 0.11, WeeklyPerCapita: 0.03},
	{ID: "sawi-hijau", Name: "Sawi Hijau", Unit: "kg", Category: "vegetable", CPIWeight: 0.07, WeeklyPerCapita: 0.05},
}

var commodityIndex = map[string]int{}

func initCommodities(fsys fs.FS) {
	for i, c := range Commodities {
		commodityIndex[c.ID] = i
		Commodities[i].Reference = Reference{
			Type:   "baseline",
			Basis:  "Median harga 90 hari sebelumnya + 10% (acuan statistik)",
			Status: "verified",
		}
	}
	loadReferences(fsys)
}

// loadReferences reads data/reference_prices.csv:
// commodity_id,type,value,zone,basis,status,source
// An empty zone sets the default value; a zone row (1–3) overrides it there.
// A row with a source applies only to series from that source.
func loadReferences(fsys fs.FS) {
	f, err := fsys.Open("data/reference_prices.csv")
	if err != nil {
		log.Printf("Warning: data/reference_prices.csv not found, all commodities use the baseline: %v", err)
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
		if err != nil {
			log.Printf("Warning: malformed row in reference_prices.csv: %v", err)
			continue
		}
		i, ok := commodityIndex[rec[0]]
		if !ok || rec[1] == "baseline" {
			continue
		}
		value, err := strconv.ParseFloat(rec[2], 64)
		if err != nil || value <= 0 {
			log.Printf("Warning: invalid reference value for %s: %q", rec[0], rec[2])
			continue
		}
		if len(rec) > 6 && rec[6] != "" {
			c := &Commodities[i]
			if c.SourceReferences == nil {
				c.SourceReferences = map[string]Reference{}
			}
			c.SourceReferences[rec[6]] = Reference{Type: rec[1], Value: value, Basis: rec[4], Status: rec[5]}
			continue
		}
		ref := &Commodities[i].Reference
		if rec[3] != "" {
			zone, err := strconv.Atoi(rec[3])
			if err != nil || zone < 1 || zone > 3 {
				log.Printf("Warning: invalid price zone for %s: %q", rec[0], rec[3])
				continue
			}
			if ref.Zones == nil {
				ref.Zones = map[int]float64{}
			}
			ref.Zones[zone] = value
			continue
		}
		*ref = Reference{Type: rec[1], Value: value, Zones: ref.Zones, Basis: rec[4], Status: rec[5]}
	}
}

// FindCommodity returns a commodity by ID.
func FindCommodity(id string) (Commodity, bool) {
	i, ok := commodityIndex[id]
	if !ok {
		return Commodity{}, false
	}
	return Commodities[i], true
}
