package regional

// Provinces lists the 34 provinces reported by PIHPS (the four Papua provinces
// created in 2022 are still reported under Papua and Papua Barat). Code is the
// BPS province code, which is also the key in data/pihps/province_prices.csv.
// Population is indicative (rounded, in line with BPS 2024 projections).
var Provinces = []Region{
	{ID: "aceh", Name: "Aceh", Code: "11", Population: 5_550_000},
	{ID: "sumatera-utara", Name: "Sumatera Utara", Code: "12", Population: 15_590_000},
	{ID: "sumatera-barat", Name: "Sumatera Barat", Code: "13", Population: 5_840_000},
	{ID: "riau", Name: "Riau", Code: "14", Population: 6_730_000},
	{ID: "jambi", Name: "Jambi", Code: "15", Population: 3_720_000},
	{ID: "sumatera-selatan", Name: "Sumatera Selatan", Code: "16", Population: 8_840_000},
	{ID: "bengkulu", Name: "Bengkulu", Code: "17", Population: 2_110_000},
	{ID: "lampung", Name: "Lampung", Code: "18", Population: 9_420_000},
	{ID: "kepulauan-bangka-belitung", Name: "Kep. Bangka Belitung", Code: "19", Population: 1_530_000},
	{ID: "kepulauan-riau", Name: "Kepulauan Riau", Code: "21", Population: 2_180_000},
	{ID: "dki-jakarta", Name: "DKI Jakarta", Code: "31", Population: 10_680_000},
	{ID: "jawa-barat", Name: "Jawa Barat", Code: "32", Population: 50_350_000},
	{ID: "jawa-tengah", Name: "Jawa Tengah", Code: "33", Population: 37_890_000},
	{ID: "di-yogyakarta", Name: "DI Yogyakarta", Code: "34", Population: 3_760_000},
	{ID: "jawa-timur", Name: "Jawa Timur", Code: "35", Population: 41_810_000},
	{ID: "banten", Name: "Banten", Code: "36", Population: 12_430_000},
	{ID: "bali", Name: "Bali", Code: "51", Population: 4_430_000},
	{ID: "nusa-tenggara-barat", Name: "Nusa Tenggara Barat", Code: "52", Population: 5_650_000},
	{ID: "nusa-tenggara-timur", Name: "Nusa Tenggara Timur", Code: "53", Population: 5_660_000},
	{ID: "kalimantan-barat", Name: "Kalimantan Barat", Code: "61", Population: 5_620_000},
	{ID: "kalimantan-tengah", Name: "Kalimantan Tengah", Code: "62", Population: 2_810_000},
	{ID: "kalimantan-selatan", Name: "Kalimantan Selatan", Code: "63", Population: 4_220_000},
	{ID: "kalimantan-timur", Name: "Kalimantan Timur", Code: "64", Population: 4_000_000},
	{ID: "kalimantan-utara", Name: "Kalimantan Utara", Code: "65", Population: 730_000},
	{ID: "sulawesi-utara", Name: "Sulawesi Utara", Code: "71", Population: 2_700_000},
	{ID: "sulawesi-tengah", Name: "Sulawesi Tengah", Code: "72", Population: 3_120_000},
	{ID: "sulawesi-selatan", Name: "Sulawesi Selatan", Code: "73", Population: 9_460_000},
	{ID: "sulawesi-tenggara", Name: "Sulawesi Tenggara", Code: "74", Population: 2_770_000},
	{ID: "gorontalo", Name: "Gorontalo", Code: "75", Population: 1_210_000},
	{ID: "sulawesi-barat", Name: "Sulawesi Barat", Code: "76", Population: 1_480_000},
	{ID: "maluku", Name: "Maluku", Code: "81", Population: 1_950_000},
	{ID: "maluku-utara", Name: "Maluku Utara", Code: "82", Population: 1_360_000},
	{ID: "papua-barat", Name: "Papua Barat", Code: "91", Population: 1_780_000},
	{ID: "papua", Name: "Papua", Code: "94", Population: 4_500_000},
}

// provinceBorders links provinces that share a land border or a main
// ferry/logistics crossing (e.g. Merak–Bakauheni, Ketapang–Gilimanuk), so that
// island provinces still have a meaningful neighbour comparison.
var provinceBorders = map[string][]string{
	"aceh":                      {"sumatera-utara"},
	"sumatera-utara":            {"sumatera-barat", "riau"},
	"sumatera-barat":            {"riau", "jambi", "bengkulu"},
	"riau":                      {"jambi", "kepulauan-riau"},
	"jambi":                     {"bengkulu", "sumatera-selatan"},
	"bengkulu":                  {"sumatera-selatan", "lampung"},
	"sumatera-selatan":          {"lampung", "kepulauan-bangka-belitung"},
	"lampung":                   {"banten"},
	"banten":                    {"dki-jakarta", "jawa-barat"},
	"dki-jakarta":               {"jawa-barat"},
	"jawa-barat":                {"jawa-tengah"},
	"jawa-tengah":               {"di-yogyakarta", "jawa-timur"},
	"jawa-timur":                {"bali"},
	"bali":                      {"nusa-tenggara-barat"},
	"nusa-tenggara-barat":       {"nusa-tenggara-timur"},
	"kalimantan-barat":          {"kalimantan-tengah"},
	"kalimantan-tengah":         {"kalimantan-selatan", "kalimantan-timur"},
	"kalimantan-selatan":        {"kalimantan-timur"},
	"kalimantan-timur":          {"kalimantan-utara"},
	"sulawesi-utara":            {"gorontalo", "maluku-utara"},
	"gorontalo":                 {"sulawesi-tengah"},
	"sulawesi-tengah":           {"sulawesi-barat", "sulawesi-selatan", "sulawesi-tenggara"},
	"sulawesi-barat":            {"sulawesi-selatan"},
	"sulawesi-selatan":          {"sulawesi-tenggara"},
	"maluku":                    {"maluku-utara", "papua-barat"},
	"papua":                     {"papua-barat"},
	"kepulauan-bangka-belitung": {},
}

// priceZone is the HET zone of each province for rice (Bapanas):
// 1 = Java, Lampung, South Sumatra, Bali, NTB, Sulawesi; 2 = rest of Sumatra,
// NTT, Kalimantan; 3 = Maluku and Papua.
var priceZone = map[string]int{
	"aceh": 2, "sumatera-utara": 2, "sumatera-barat": 2, "riau": 2, "jambi": 2,
	"sumatera-selatan": 1, "bengkulu": 2, "lampung": 1, "kepulauan-bangka-belitung": 2,
	"kepulauan-riau": 2, "dki-jakarta": 1, "jawa-barat": 1, "jawa-tengah": 1,
	"di-yogyakarta": 1, "jawa-timur": 1, "banten": 1, "bali": 1,
	"nusa-tenggara-barat": 1, "nusa-tenggara-timur": 2, "kalimantan-barat": 2,
	"kalimantan-tengah": 2, "kalimantan-selatan": 2, "kalimantan-timur": 2,
	"kalimantan-utara": 2, "sulawesi-utara": 1, "sulawesi-tengah": 1,
	"sulawesi-selatan": 1, "sulawesi-tenggara": 1, "gorontalo": 1, "sulawesi-barat": 1,
	"maluku": 3, "maluku-utara": 3, "papua-barat": 3, "papua": 3,
}
