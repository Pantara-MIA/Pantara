package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// ─── Request from the frontend ───────────────────────────────────────────────

type AiSolutionRequest struct {
	// Simulation results
	Commodity     string  `json:"commodity"`
	PricePerKg    float64 `json:"price_per_kg"`
	WeightKg      float64 `json:"weight_kg"`
	Days          int     `json:"days"`
	Method        string  `json:"method"`
	RemainingKg   float64 `json:"remaining_kg"`
	DecayKg       float64 `json:"decay_kg"`
	Loss          float64 `json:"loss"`
	MonthlyLoss   float64 `json:"monthly_loss"`
	PastShelfLife bool    `json:"past_shelf_life"`
	ShelfLife     int     `json:"shelf_life"`
	Decay         float64 `json:"decay"`

	// Storage method comparison
	ByMethod []struct {
		Key         string  `json:"key"`
		Label       string  `json:"label"`
		RemainingKg float64 `json:"remaining_kg"`
		Loss        float64 `json:"loss"`
	} `json:"by_method"`

	// Business profile
	BusinessName     string `json:"business_name"`
	BusinessCategory string `json:"business_category"`
}

// ─── Response to the frontend ────────────────────────────────────────────────

type AiStep struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Tone  string `json:"tone"` // green | gold | red
	Icon  string `json:"icon"` // check | snowflake | cart | alert
}

type AiProcessedProduct struct {
	Name      string `json:"name"`
	ShelfLife string `json:"shelf_life"`
	Note      string `json:"note"`
}

type AiSolutionResponse struct {
	Steps                   []AiStep             `json:"steps"`
	Summary                 string               `json:"summary"`
	MonthlySavingsPotential float64              `json:"monthly_savings_potential"`
	Products                []AiProcessedProduct `json:"products"`
}

// ─── Gemini API types ─────────────────────────────────────────────────────────

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiRequest struct {
	Contents         []geminiContent `json:"contents"`
	GenerationConfig struct {
		ResponseMIMEType string `json:"responseMimeType"`
	} `json:"generationConfig"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

func handleAiSolution(w http.ResponseWriter, r *http.Request) {
	var req AiSolutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Request tidak valid: "+err.Error(), http.StatusBadRequest)
		return
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-2.0-flash"
	}
	if apiKey == "" || apiKey == "your_gemini_api_key_here" {
		http.Error(w, "GEMINI_API_KEY belum dikonfigurasi di .env server.", http.StatusServiceUnavailable)
		return
	}

	prompt := buildSolutionPrompt(req)

	gemReq := geminiRequest{}
	gemReq.Contents = []geminiContent{{Parts: []geminiPart{{Text: prompt}}}}
	gemReq.GenerationConfig.ResponseMIMEType = "application/json"

	body, _ := json.Marshal(gemReq)

	url := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		model, apiKey,
	)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		http.Error(w, "Gagal menghubungi Gemini API: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		http.Error(w, "Gemini API error: "+string(raw), http.StatusBadGateway)
		return
	}

	// Extract the text from the Gemini response
	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &gemResp); err != nil || len(gemResp.Candidates) == 0 {
		http.Error(w, "Respons Gemini tidak dapat dibaca.", http.StatusBadGateway)
		return
	}

	jsonText := strings.TrimSpace(gemResp.Candidates[0].Content.Parts[0].Text)

	var solution AiSolutionResponse
	if err := json.Unmarshal([]byte(jsonText), &solution); err != nil {
		http.Error(w, "Gemini mengembalikan JSON tidak valid: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(solution)
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

func buildSolutionPrompt(req AiSolutionRequest) string {
	// Find the best method (smallest loss)
	bestLabel := req.Method
	bestLoss := req.Loss
	for _, m := range req.ByMethod {
		if m.Loss < bestLoss {
			bestLoss = m.Loss
			bestLabel = m.Label
		}
	}
	switchSavings := req.Loss - bestLoss
	monthlySavings := 0.0
	if req.Days > 0 {
		monthlySavings = switchSavings * (30.0 / float64(req.Days))
	}

	decayPct := 0.0
	if req.WeightKg > 0 {
		decayPct = (req.DecayKg / req.WeightKg) * 100
	}
	purchaseValue := req.WeightKg * req.PricePerKg
	lossPct := 0.0
	if purchaseValue > 0 {
		lossPct = (req.Loss / purchaseValue) * 100
	}

	methodComparison := ""
	for _, m := range req.ByMethod {
		methodComparison += fmt.Sprintf("  - %s: sisa %.2f kg, kerugian Rp %.0f\n", m.Label, m.RemainingKg, m.Loss)
	}

	shelfLifeNote := ""
	if req.PastShelfLife {
		shelfLifeNote = fmt.Sprintf("PENTING: Lama simpan %d hari sudah MELEWATI batas aman metode ini (%d hari). Kualitas bahan sudah tidak layak.", req.Days, req.ShelfLife)
	}

	return fmt.Sprintf(`Kamu adalah konsultan pengadaan bahan baku F&B untuk UMKM Indonesia bernama Pantara.

DATA SIMULASI SUSUT:
- Usaha: %s (%s)
- Komoditas: %s
- Harga pasar: Rp %.0f/kg
- Bobot dibeli: %.1f kg
- Lama disimpan: %d hari
- Metode simpan: %s (batas aman: %d hari, susut %.1f%%/hari)
- Sisa layak pakai: %.2f kg
- Terbuang karena susut: %.2f kg (%.1f%% dari belanja)
- Kerugian uang: Rp %.0f (%.1f%% dari nilai belanja Rp %.0f)
- Proyeksi kerugian sebulan jika pola ini diulang: Rp %.0f

%s

PERBANDINGAN METODE SIMPAN (bobot dan lama simpan sama):
%s
Potensi hemat jika pindah ke metode terbaik (%s): Rp %.0f per siklus, sekitar Rp %.0f/bulan.

INSTRUKSI:
1. Berikan TEPAT 3-5 langkah solusi konkret, personal, dan actionable untuk pemilik usaha ini.
Setiap langkah harus spesifik untuk situasi di atas (sebutkan angka nyata seperti Rp, kg, hari).
Gunakan bahasa Indonesia yang hangat, tidak menggurui, dan langsung ke poin.
2. Berikan 2-3 saran olahan kreatif (mitigasi) untuk komoditas ini khusus untuk jenis usaha %s.

Kembalikan HANYA JSON valid dengan struktur berikut (tanpa markdown, tanpa penjelasan tambahan):
{
  "steps": [
    {
      "title": "Judul langkah singkat (maks 8 kata)",
      "body": "Penjelasan konkret 2-3 kalimat dengan angka nyata.",
      "tone": "green|gold|red",
      "icon": "check|snowflake|cart|alert"
    }
  ],
  "summary": "Satu kalimat ringkasan situasi dan prioritas tindakan.",
  "monthly_savings_potential": %.0f,
  "products": [
    {
      "name": "Nama produk olahan (contoh: Selai Pisang)",
      "shelf_life": "Estimasi daya tahan (contoh: 2 minggu)",
      "note": "Penjelasan singkat bagaimana olahan ini cocok untuk usaha tersebut."
    }
  ]
}

Aturan tone:
- "green": langkah kebiasaan/operasional sederhana tanpa biaya
- "gold": langkah investasi kecil atau perubahan siklus
- "red": peringatan mendesak, perlu tindakan segera

Aturan icon:
- "check": kebiasaan/prosedur
- "snowflake": metode penyimpanan
- "cart": pola/frekuensi belanja
- "alert": peringatan keras`,
		req.BusinessName, req.BusinessCategory,
		req.Commodity, req.PricePerKg,
		req.WeightKg, req.Days,
		req.Method, req.ShelfLife, req.Decay*100,
		req.RemainingKg, req.DecayKg, decayPct,
		req.Loss, lossPct, purchaseValue,
		req.MonthlyLoss,
		shelfLifeNote,
		methodComparison,
		bestLabel, switchSavings, monthlySavings,
		req.BusinessCategory,
		monthlySavings,
	)
}
