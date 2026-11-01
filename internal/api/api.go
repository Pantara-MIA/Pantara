package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func SetupRoutes(r chi.Router) {
	// Public routes
	r.Get("/api/v1/public/metadata", handleGetMetadata)
	r.Post("/api/v1/public/simulate-waste", handleSimulateWaste)
	r.Get("/api/v1/public/market-radar", handleMarketRadar)

	// Regional scorecard (public transparency)
	r.Get("/api/v1/public/regions", handleRegions)
	r.Get("/api/v1/public/scorecard", handleScorecard)
	r.Get("/api/v1/public/scorecard/{regionID}", handleRegionScorecard)
	r.Get("/api/v1/public/prices", handlePrices)
	r.Get("/api/v1/public/alerts", handleAlerts)
	r.Get("/api/v1/public/watchlist", handleWatchlist)
	r.Get("/api/v1/public/model-metrics", handleModelMetrics)
	r.Get("/api/v1/public/model-metrics/v2", handleModelMetricsV2)
	r.Get("/api/v1/public/climate", handleClimate)
	r.Get("/api/v1/public/climate/{regionID}", handleRegionClimate)
	r.Get("/api/v1/public/interventions", handlePublicInterventions)
	r.Get("/api/v1/public/interventions/{id}", handlePublicIntervention)

	// Open-data CSV exports
	r.Get("/api/v1/public/export/prices.csv", handleExportPrices)
	r.Get("/api/v1/public/export/scorecard.csv", handleExportScorecard)
	r.Get("/api/v1/public/export/interventions.csv", handleExportInterventions)

	// Government (regional authority) routes
	r.Route("/api/v1/gov", func(gr chi.Router) {
		gr.Use(requireGovernment)
		gr.Get("/interventions", handleGovListInterventions)
		gr.Post("/interventions", handleGovCreateIntervention)
		gr.Put("/interventions/{id}", handleGovUpdateIntervention)
		gr.Post("/interventions/{id}/publish", handleGovPublishIntervention)
		gr.Delete("/interventions/{id}", handleGovDeleteIntervention)
		gr.Post("/plan", handleGovPlan)
	})

	// Auth routes
	r.Post("/api/v1/auth/register", handleRegisterAuth)
	r.Post("/api/v1/auth/login", handleLoginAuth)
	r.Get("/api/v1/auth/me", handleGetProfile)
	r.Put("/api/v1/auth/profile", handleUpdateProfile)

	// MSME (UMKM) routes (for the demo, access is guarded in the frontend)
	r.Post("/api/v1/msme/procurement-card", handleProcurementCard)
	r.Post("/api/v1/msme/ai-solution", handleAiSolution)
}

type SimulateWasteRequest struct {
	CommodityID   string  `json:"commodity_id"`
	WeightKg      float64 `json:"weight_kg"`
	StorageMethod string  `json:"storage_method"`
	DurationDays  int     `json:"duration_days"`
}

type SimulateWasteResponse struct {
	Status string `json:"status"`
	Data   struct {
		InitialWeightKg            float64 `json:"initial_weight_kg"`
		UsableWeightKg             float64 `json:"usable_weight_kg"`
		WasteLossKg                float64 `json:"waste_loss_kg"`
		CashLossIdr                float64 `json:"cash_loss_idr"`
		BreakevenPriceHikeRequired float64 `json:"breakeven_price_hike_required_pct"`
		HistoricalSpikeProbability float64 `json:"historical_spike_probability_pct"`
	} `json:"data"`
}

func handleSimulateWaste(w http.ResponseWriter, r *http.Request) {
	var req SimulateWasteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	decayRate := 0.03
	if req.StorageMethod == "chiller" {
		decayRate = 0.015
	} else if req.StorageMethod == "airtight" {
		decayRate = 0.005
	}

	// Calculate loss
	var usable float64 = req.WeightKg
	for i := 0; i < req.DurationDays; i++ {
		usable = usable * (1 - decayRate)
	}
	waste := req.WeightKg - usable

	// Assume price = 44000 for rawit merah
	price := 44000.0
	cashLoss := waste * price

	hikeReq := (waste / usable) * 100
	prob := 2.1
	if hikeReq > 10 {
		prob = 1.5
	}
	if hikeReq > 20 {
		prob = 0.5
	}

	res := SimulateWasteResponse{Status: "success"}
	res.Data.InitialWeightKg = req.WeightKg
	res.Data.UsableWeightKg = usable
	res.Data.WasteLossKg = waste
	res.Data.CashLossIdr = cashLoss
	res.Data.BreakevenPriceHikeRequired = hikeReq
	res.Data.HistoricalSpikeProbability = prob

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

type MarketRadarResponse struct {
	Status string `json:"status"`
	Data   struct {
		CommodityID      string  `json:"commodity_id"`
		CommodityName    string  `json:"commodity_name"`
		CurrentPrice     float64 `json:"current_price"`
		LastYearPrice    float64 `json:"last_year_price"`
		YoyChangePct     float64 `json:"yoy_change_pct"`
		VolatilityStatus string  `json:"volatility_status"`
	} `json:"data"`
}

func handleMarketRadar(w http.ResponseWriter, r *http.Request) {
	// Dummy data for now based on spec
	res := MarketRadarResponse{Status: "success"}
	res.Data.CommodityID = "chili_rawit_red"
	res.Data.CommodityName = "Cabai Rawit Merah"
	res.Data.CurrentPrice = 44000
	res.Data.LastYearPrice = 38500
	res.Data.YoyChangePct = 14.28
	res.Data.VolatilityStatus = "HIGH"

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}
