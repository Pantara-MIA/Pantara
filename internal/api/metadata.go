package api

import (
	"encoding/json"
	"net/http"
	"pantara/internal/store"
)

type MasterCommodity struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type MasterCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type MasterMarket struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Region string `json:"region"`
}

type MasterStorageMethod struct {
	ID             string  `json:"id"`
	Label          string  `json:"label"`
	ShortLabel     string  `json:"short_label"`
	Icon           string  `json:"icon"`
	DailyDecayRate float64 `json:"daily_decay_rate"`
	ShelfLifeDays  int     `json:"shelf_life_days"`
	Description    string  `json:"description"`
	FormLabel      string  `json:"form_label"`
}

type MetadataResponse struct {
	Commodities    []MasterCommodity     `json:"commodities"`
	Categories     []MasterCategory      `json:"categories"`
	Markets        []MasterMarket        `json:"markets"`
	StorageMethods []MasterStorageMethod `json:"storage_methods"`
}

func handleGetMetadata(w http.ResponseWriter, r *http.Request) {
	res := MetadataResponse{
		Commodities:    []MasterCommodity{},
		Categories:     []MasterCategory{},
		Markets:        []MasterMarket{},
		StorageMethods: []MasterStorageMethod{},
	}

	// Fetch Commodities
	rowsC, err := store.DB.Query(`SELECT id, name FROM master_commodities ORDER BY name`)
	if err == nil {
		defer rowsC.Close()
		for rowsC.Next() {
			var c MasterCommodity
			if rowsC.Scan(&c.ID, &c.Name) == nil {
				res.Commodities = append(res.Commodities, c)
			}
		}
	}

	// Fetch Categories
	rowsCat, err := store.DB.Query(`SELECT id, name FROM master_fnb_categories ORDER BY name`)
	if err == nil {
		defer rowsCat.Close()
		for rowsCat.Next() {
			var c MasterCategory
			if rowsCat.Scan(&c.ID, &c.Name) == nil {
				res.Categories = append(res.Categories, c)
			}
		}
	}

	// Fetch Markets
	rowsM, err := store.DB.Query(`SELECT id, name, region FROM master_markets ORDER BY name`)
	if err == nil {
		defer rowsM.Close()
		for rowsM.Next() {
			var m MasterMarket
			if rowsM.Scan(&m.ID, &m.Name, &m.Region) == nil {
				res.Markets = append(res.Markets, m)
			}
		}
	}

	// Fetch Storage Methods
	rowsS, err := store.DB.Query(`SELECT id, label, short_label, icon, daily_decay_rate, shelf_life_days, description, form_label FROM master_storage_methods`)
	if err == nil {
		defer rowsS.Close()
		for rowsS.Next() {
			var s MasterStorageMethod
			if rowsS.Scan(&s.ID, &s.Label, &s.ShortLabel, &s.Icon, &s.DailyDecayRate, &s.ShelfLifeDays, &s.Description, &s.FormLabel) == nil {
				res.StorageMethods = append(res.StorageMethods, s)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}
