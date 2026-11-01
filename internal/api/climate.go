package api

import (
	"net/http"
	"pantara/internal/regional"

	"github.com/go-chi/chi/v5"
)

// asOfDate resolves the as_of query parameter to a calendar date (default: last day).
func asOfDate(r *http.Request) (string, bool) {
	now := asOfIndex(r)
	if now < 0 {
		return "", false
	}
	return regional.Dates()[now], true
}

// handleClimate returns the climate risk of every province.
func handleClimate(w http.ResponseWriter, r *http.Request) {
	asOf, ok := asOfDate(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}
	writeJSON(w, http.StatusOK, regional.ClimateAt(asOf))
}

type RegionClimateResponse struct {
	RegionID    string                    `json:"region_id"`
	ProvinceID  string                    `json:"province_id"`
	AsOf        string                    `json:"as_of"`
	WeatherAsOf string                    `json:"weather_as_of"`
	ENSO        regional.ENSO             `json:"enso"`
	Climate     *regional.ProvinceClimate `json:"climate"`
	History     []regional.MonthRain      `json:"history"`
}

// historyMonthsClimate is how many months of rain vs normal the region view shows.
const historyMonthsClimate = 12

// handleRegionClimate returns the climate of the province a region belongs to,
// with monthly rain vs normal.
func handleRegionClimate(w http.ResponseWriter, r *http.Request) {
	regionID := chi.URLParam(r, "regionID")
	prov, ok := regional.ClimateProvince(regionID)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown region")
		return
	}
	asOf, ok := asOfDate(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "as_of is before the data range")
		return
	}
	snap := regional.ClimateAt(asOf)
	res := RegionClimateResponse{RegionID: regionID, ProvinceID: prov.ID, AsOf: asOf, WeatherAsOf: snap.WeatherAsOf, ENSO: snap.ENSO,
		History: regional.RainHistory(prov.ID, asOf, historyMonthsClimate)}
	for i := range snap.Provinces {
		if snap.Provinces[i].RegionID == prov.ID {
			res.Climate = &snap.Provinces[i]
		}
	}
	writeJSON(w, http.StatusOK, res)
}
