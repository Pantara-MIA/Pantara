package regional

// Region is one province or regency/city assessed by the regional scorecard.
type Region struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"` // "province" | "regency" | "city"
	// Code is the BPS area code (provinces only for now).
	Code      string   `json:"code,omitempty"`
	Neighbors []string `json:"neighbors"`
	// Population is an indicative headcount (rounded, in line with BPS
	// projections); it sizes local demand in market-operation planning.
	Population int `json:"population"`
	// RealCommodities counts the commodities with real (not synthetic) prices.
	RealCommodities int `json:"real_commodities"`
	// Scope is the scope this region is ranked in; ChildScope, when set, is the
	// scope that breaks the region down further (drill-down).
	Scope      string `json:"scope"`
	ChildScope string `json:"child_scope,omitempty"`
}

// jabarRegions lists the 27 regencies/cities of West Java, roughly west→east and
// north→south. Adjacency follows land borders inside the province; borders
// with other provinces are ignored.
var jabarRegions = []Region{
	{ID: "kota-depok", Name: "Kota Depok", Type: "city", Population: 2_150_000},
	{ID: "kota-bekasi", Name: "Kota Bekasi", Type: "city", Population: 2_590_000},
	{ID: "kab-bekasi", Name: "Kab. Bekasi", Type: "regency", Population: 3_240_000},
	{ID: "kab-karawang", Name: "Kab. Karawang", Type: "regency", Population: 2_520_000},
	{ID: "kab-subang", Name: "Kab. Subang", Type: "regency", Population: 1_640_000},
	{ID: "kab-indramayu", Name: "Kab. Indramayu", Type: "regency", Population: 1_890_000},
	{ID: "kota-cirebon", Name: "Kota Cirebon", Type: "city", Population: 340_000},

	{ID: "kota-bogor", Name: "Kota Bogor", Type: "city", Population: 1_070_000},
	{ID: "kab-bogor", Name: "Kab. Bogor", Type: "regency", Population: 5_630_000},
	{ID: "kab-purwakarta", Name: "Kab. Purwakarta", Type: "regency", Population: 1_010_000},
	{ID: "kab-bandung-barat", Name: "Kab. Bandung Barat", Type: "regency", Population: 1_850_000},
	{ID: "kab-sumedang", Name: "Kab. Sumedang", Type: "regency", Population: 1_170_000},
	{ID: "kab-majalengka", Name: "Kab. Majalengka", Type: "regency", Population: 1_330_000},
	{ID: "kab-cirebon", Name: "Kab. Cirebon", Type: "regency", Population: 2_300_000},

	{ID: "kota-sukabumi", Name: "Kota Sukabumi", Type: "city", Population: 360_000},
	{ID: "kab-cianjur", Name: "Kab. Cianjur", Type: "regency", Population: 2_560_000},
	{ID: "kota-cimahi", Name: "Kota Cimahi", Type: "city", Population: 580_000},
	{ID: "kota-bandung", Name: "Kota Bandung", Type: "city", Population: 2_510_000},
	{ID: "kab-garut", Name: "Kab. Garut", Type: "regency", Population: 2_650_000},
	{ID: "kota-tasikmalaya", Name: "Kota Tasikmalaya", Type: "city", Population: 730_000},
	{ID: "kab-kuningan", Name: "Kab. Kuningan", Type: "regency", Population: 1_200_000},

	{ID: "kab-sukabumi", Name: "Kab. Sukabumi", Type: "regency", Population: 2_800_000},
	{ID: "kab-bandung", Name: "Kab. Bandung", Type: "regency", Population: 3_720_000},
	{ID: "kab-tasikmalaya", Name: "Kab. Tasikmalaya", Type: "regency", Population: 1_890_000},
	{ID: "kab-ciamis", Name: "Kab. Ciamis", Type: "regency", Population: 1_250_000},
	{ID: "kota-banjar", Name: "Kota Banjar", Type: "city", Population: 210_000},

	{ID: "kab-pangandaran", Name: "Kab. Pangandaran", Type: "regency", Population: 430_000},
}

// jabarBorders is written one way; linkNeighbors makes it symmetric.
var jabarBorders = map[string][]string{
	"kota-depok":        {"kab-bogor", "kota-bekasi"},
	"kota-bekasi":       {"kab-bekasi", "kab-bogor"},
	"kab-bekasi":        {"kab-bogor", "kab-karawang"},
	"kab-karawang":      {"kab-bogor", "kab-purwakarta", "kab-subang"},
	"kab-subang":        {"kab-purwakarta", "kab-bandung-barat", "kab-sumedang", "kab-indramayu"},
	"kab-indramayu":     {"kab-sumedang", "kab-majalengka", "kab-cirebon"},
	"kota-cirebon":      {"kab-cirebon"},
	"kota-bogor":        {"kab-bogor"},
	"kab-bogor":         {"kab-purwakarta", "kab-cianjur", "kab-sukabumi"},
	"kab-purwakarta":    {"kab-bandung-barat", "kab-cianjur"},
	"kab-bandung-barat": {"kab-bandung", "kota-bandung", "kota-cimahi", "kab-cianjur", "kab-sumedang"},
	"kab-sumedang":      {"kab-majalengka", "kab-garut", "kab-bandung"},
	"kab-majalengka":    {"kab-cirebon", "kab-kuningan", "kab-ciamis", "kab-tasikmalaya"},
	"kab-cirebon":       {"kab-kuningan"},
	"kota-sukabumi":     {"kab-sukabumi"},
	"kab-cianjur":       {"kab-bandung", "kab-garut", "kab-sukabumi"},
	"kota-cimahi":       {"kota-bandung", "kab-bandung"},
	"kota-bandung":      {"kab-bandung"},
	"kab-garut":         {"kab-bandung", "kab-tasikmalaya"},
	"kota-tasikmalaya":  {"kab-tasikmalaya", "kab-ciamis"},
	"kab-kuningan":      {"kab-ciamis"},
	"kab-tasikmalaya":   {"kab-ciamis", "kab-pangandaran"},
	"kab-ciamis":        {"kota-banjar", "kab-pangandaran"},
}
