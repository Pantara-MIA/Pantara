package api

import (
	"encoding/json"
	"net/http"
	"pantara/internal/regional"
)

type PlanRequest struct {
	AsOf string `json:"as_of"`
	regional.PlanParams
}

type PlanResponse struct {
	regional.Plan
	Defaults regional.PlanParams `json:"defaults"`
}

// handleGovPlan builds a market-operation plan for the caller's jurisdiction.
// Omitted parameters fall back to regional.DefaultPlanParams.
func handleGovPlan(w http.ResponseWriter, r *http.Request) {
	g := governmentFrom(r)
	req := PlanRequest{PlanParams: regional.DefaultPlanParams()}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Parameter perencanaan tidak valid.")
		return
	}
	if err := req.PlanParams.Validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	now := len(regional.Dates()) - 1
	if req.AsOf != "" {
		now = regional.DateIndex(req.AsOf)
	}
	if now < 0 {
		writeError(w, http.StatusUnprocessableEntity, "Tanggal di luar rentang data.")
		return
	}

	writeJSON(w, http.StatusOK, PlanResponse{
		Plan:     regional.BuildPlan(g.Regions, now, req.PlanParams),
		Defaults: regional.DefaultPlanParams(),
	})
}
