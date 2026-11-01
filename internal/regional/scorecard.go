package regional

import (
	"fmt"
	"math"
	"sort"
	"sync"
)

// ─────────────────────────────────────────────────────────────────────────────
// Regional scorecard: two separate indicators per region × commodity × month.
//
// 1. STABILITY (score and grade A–E) — spikes above the normal band
//    (90-day median + 10%, see Scope.normal), for every commodity:
//   Days above normal     observation days in the month with price > normal band.
//   Spike episode         >= MinEpisodeDays CONSECUTIVE observation days above
//                         the band. Episodes are measured in full even when
//                         they cross month boundaries; the scorecard includes
//                         every episode that overlaps the month.
//   Duration              episode length (days), first to last day above.
//   Recovery time         days from the episode PEAK to the first day the price
//                         is back <= the band. Unrecovered episodes are counted
//                         up to the period end (a lower bound) and flagged.
//   Neighbour gap         daily mean of (region price / neighbour median − 1).
//   Scope gap             daily mean of (region price / scope median − 1).
//
//   Score 0–100 = 100 − penalties:
//     40 × share of days above the normal band
//     20 × min(mean duration / 14 days, 1)
//     20 × min(mean recovery / 10 days, 1)
//     20 × min(max(neighbour gap, 0) / 10%, 1)
//   Region score = plain mean of the scores of commodities with data: every
//   market counts the same, so stable staples do not mask volatile ones.
//   Grade: A >= 85, B >= 70, C >= 55, D >= 40, E < 40.
//
// 2. COMPLIANCE — the regulatory ceiling (HET/HAP), reported as is, for
//    regulated commodities only: days above the ceiling and the mean gap to it.
//   Region compliance = CPI-weighted share of regulated commodity-days at or
//   below the ceiling, in % (weighted by household spending, since it measures
//   consumer burden).
//
// Keeping them apart stops a nationwide, persistent breach (e.g. rice above
// HET everywhere) from flattening every grade, while the breach itself stays
// fully visible.
// ─────────────────────────────────────────────────────────────────────────────

const MinEpisodeDays = 3

const (
	penaltyAbove     = 40.0
	penaltyDuration  = 20.0
	penaltyRecovery  = 20.0
	penaltyNeighbor  = 20.0
	saturateDuration = 14.0 // days
	saturateRecovery = 10.0 // days
	saturateNeighbor = 10.0 // percent
)

type Episode struct {
	Start        string  `json:"start"`
	Peak         string  `json:"peak"`
	End          string  `json:"end"` // last day above the reference
	PeakPrice    float64 `json:"peak_price"`
	PeakPct      float64 `json:"peak_pct"` // % above the reference at the peak
	DurationDays int     `json:"duration_days"`
	RecoveryDays int     `json:"recovery_days"`
	Ongoing      bool    `json:"ongoing"` // not back <= reference by the period end
}

type CommodityMetrics struct {
	CommodityID     string    `json:"commodity_id"`
	ObservedDays    int       `json:"observed_days"`
	DaysAboveNormal int       `json:"days_above_normal"`
	Episodes        []Episode `json:"episodes"`
	MeanDuration    float64   `json:"mean_duration"`
	MeanRecovery    float64   `json:"mean_recovery"`
	MeanPrice       float64   `json:"mean_price"`
	MeanNormal      float64   `json:"mean_normal"`
	NeighborGapPct  float64   `json:"neighbor_gap_pct"`
	ScopeGapPct     float64   `json:"scope_gap_pct"`
	Score           float64   `json:"score"`
	Grade           string    `json:"grade"`
	// Source of the series (pihps | sp2kp | synthetic) and its reference type.
	Source        string `json:"source"`
	ReferenceType string `json:"reference_type"`
	// Compliance; zero values when the series has no HET/HAP.
	Regulated        bool    `json:"regulated"`
	MeanCeiling      float64 `json:"mean_ceiling,omitempty"`
	DaysAboveCeiling int     `json:"days_above_ceiling"`
	// Mean of (price / ceiling − 1) over the month, in %.
	CeilingGapPct float64 `json:"ceiling_gap_pct"`
}

type RegionScore struct {
	RegionID             string  `json:"region_id"`
	Score                float64 `json:"score"`
	Grade                string  `json:"grade"`
	Rank                 int     `json:"rank"`
	DaysAboveNormalTotal int     `json:"days_above_normal_total"`
	CommoditiesAffected  int     `json:"commodities_affected"` // >= 1 day above the normal band
	EpisodesTotal        int     `json:"episodes_total"`
	// Compliance with HET/HAP; Compliance is nil when no regulated commodity is selected.
	Compliance            *float64           `json:"compliance"`
	DaysAboveCeilingTotal int                `json:"days_above_ceiling_total"`
	CeilingBreached       int                `json:"ceiling_breached"` // regulated commodities >= 1 day above
	Commodities           []CommodityMetrics `json:"commodities"`
}

// MonthBounds returns the first and last day index of "YYYY-MM".
func MonthBounds(month string) (int, int, error) {
	a, b := -1, -1
	for i, d := range dates {
		if d[:7] == month {
			if a < 0 {
				a = i
			}
			b = i
		}
	}
	if a < 0 {
		return 0, 0, fmt.Errorf("month %q is outside the data range", month)
	}
	return a, b, nil
}

// Months returns every month in the data (ascending).
func Months() []string {
	var out []string
	for _, d := range dates {
		if len(out) == 0 || out[len(out)-1] != d[:7] {
			out = append(out, d[:7])
		}
	}
	return out
}

// detectEpisodes finds episodes in p[0..end] that overlap [start, end].
func detectEpisodes(p, ref []float64, start, end int) []Episode {
	var out []Episode
	t := 0
	for t <= end {
		if p[t] <= ref[t] {
			t++
			continue
		}
		first := t
		peak := t
		for t <= end && p[t] > ref[t] {
			if p[t]/ref[t] > p[peak]/ref[peak] {
				peak = t
			}
			t++
		}
		last := t - 1
		if last-first+1 < MinEpisodeDays || last < start {
			continue
		}
		ongoing := t > end
		recovery := t - peak // t = first day back <= reference (or end+1)
		if ongoing {
			recovery = end - peak
		}
		out = append(out, Episode{
			Start:        dates[first],
			Peak:         dates[peak],
			End:          dates[last],
			PeakPrice:    p[peak],
			PeakPct:      round((p[peak]/ref[peak]-1)*100, 1),
			DurationDays: last - first + 1,
			RecoveryDays: recovery,
			Ongoing:      ongoing,
		})
	}
	return out
}

func round(v float64, decimals int) float64 {
	p := math.Pow(10, float64(decimals))
	return math.Round(v*p) / p
}

func grade(score float64) string {
	switch {
	case score >= 85:
		return "A"
	case score >= 70:
		return "B"
	case score >= 55:
		return "C"
	case score >= 40:
		return "D"
	}
	return "E"
}

func (s *Scope) computeMetrics(d *scopeData, ci, ri, start, end int) CommodityMetrics {
	c := Commodities[ci]
	reg := s.Regions[ri]
	p := d.prices[ci][ri]
	band := d.normal[ci][ri]
	ceiling := d.reference[ci][ri]

	m := CommodityMetrics{CommodityID: c.ID, ObservedDays: end - start + 1, Source: d.source[ci][ri], ReferenceType: d.refType[ci][ri]}
	m.Regulated = m.ReferenceType != "baseline"
	var sumPrice, sumBand, sumCeiling, sumCeilingGap, sumNeighbor, sumScope float64
	for t := start; t <= end; t++ {
		if p[t] > band[t] {
			m.DaysAboveNormal++
		}
		if m.Regulated {
			if p[t] > ceiling[t] {
				m.DaysAboveCeiling++
			}
			sumCeiling += ceiling[t]
			sumCeilingGap += p[t]/ceiling[t] - 1
		}
		sumPrice += p[t]
		sumBand += band[t]
		if len(reg.Neighbors) > 0 {
			if nb := s.neighborMedian(d, ci, ri, t); nb > 0 {
				sumNeighbor += p[t]/nb - 1
			}
		}
		sumScope += p[t]/d.median[ci][t] - 1
	}
	n := float64(m.ObservedDays)
	m.MeanPrice = math.Round(sumPrice / n)
	m.MeanNormal = math.Round(sumBand / n)
	if m.Regulated {
		m.MeanCeiling = math.Round(sumCeiling / n)
		m.CeilingGapPct = round(sumCeilingGap/n*100, 1)
	}
	m.NeighborGapPct = round(sumNeighbor/n*100, 1)
	m.ScopeGapPct = round(sumScope/n*100, 1)

	m.Episodes = detectEpisodes(p, band, start, end)
	if m.Episodes == nil {
		m.Episodes = []Episode{}
	}
	if len(m.Episodes) > 0 {
		var d, r float64
		for _, e := range m.Episodes {
			d += float64(e.DurationDays)
			r += float64(e.RecoveryDays)
		}
		m.MeanDuration = round(d/float64(len(m.Episodes)), 1)
		m.MeanRecovery = round(r/float64(len(m.Episodes)), 1)
	}

	penalty := penaltyAbove*float64(m.DaysAboveNormal)/n +
		penaltyDuration*math.Min(m.MeanDuration/saturateDuration, 1) +
		penaltyRecovery*math.Min(m.MeanRecovery/saturateRecovery, 1) +
		penaltyNeighbor*math.Min(math.Max(m.NeighborGapPct, 0)/saturateNeighbor, 1)
	m.Score = round(100-penalty, 1)
	m.Grade = grade(m.Score)
	return m
}

var (
	scorecardCache   = map[string][]RegionScore{}
	scorecardCacheMu sync.Mutex
)

// ComputeScorecard scores every region of a scope for one month. An empty
// commodityID means every commodity with data. Regions
// without data for the selection are left out. Results are sorted by rank.
func ComputeScorecard(scopeID, month, commodityID string) ([]RegionScore, error) {
	s, ok := scopeByID[scopeID]
	if !ok {
		return nil, fmt.Errorf("unknown scope %q", scopeID)
	}
	key := scopeID + "|" + month + "|" + commodityID
	scorecardCacheMu.Lock()
	if r, ok := scorecardCache[key]; ok {
		scorecardCacheMu.Unlock()
		return r, nil
	}
	scorecardCacheMu.Unlock()

	start, end, err := MonthBounds(month)
	if err != nil {
		return nil, err
	}
	var cis []int
	if commodityID == "" {
		for _, id := range s.Commodities {
			cis = append(cis, commodityIndex[id])
		}
	} else {
		if _, ok := commodityIndex[commodityID]; !ok {
			return nil, fmt.Errorf("unknown commodity %q", commodityID)
		}
		if !s.Has(commodityID) {
			return nil, fmt.Errorf("commodity %q has no data in scope %q", commodityID, scopeID)
		}
		cis = []int{commodityIndex[commodityID]}
	}

	d := s.d()
	out := make([]RegionScore, 0, len(s.Regions))
	for ri, reg := range s.Regions {
		rs := RegionScore{RegionID: reg.ID}
		var sumScore, sumWeight, sumCompliant, sumRegWeight float64
		for _, ci := range cis {
			if d.prices[ci][ri] == nil {
				continue
			}
			m := s.computeMetrics(d, ci, ri, start, end)
			rs.Commodities = append(rs.Commodities, m)
			w := Commodities[ci].CPIWeight
			sumScore += m.Score
			sumWeight++
			rs.DaysAboveNormalTotal += m.DaysAboveNormal
			rs.EpisodesTotal += len(m.Episodes)
			if m.DaysAboveNormal > 0 {
				rs.CommoditiesAffected++
			}
			if m.Regulated {
				sumCompliant += w * (1 - float64(m.DaysAboveCeiling)/float64(m.ObservedDays))
				sumRegWeight += w
				rs.DaysAboveCeilingTotal += m.DaysAboveCeiling
				if m.DaysAboveCeiling > 0 {
					rs.CeilingBreached++
				}
			}
		}
		if sumWeight == 0 {
			continue
		}
		rs.Score = round(sumScore/sumWeight, 1)
		rs.Grade = grade(rs.Score)
		if sumRegWeight > 0 {
			c := round(sumCompliant/sumRegWeight*100, 1)
			rs.Compliance = &c
		}
		out = append(out, rs)
	}

	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	for i := range out {
		// Equal scores share a rank.
		if i > 0 && out[i].Score == out[i-1].Score {
			out[i].Rank = out[i-1].Rank
		} else {
			out[i].Rank = i + 1
		}
	}

	scorecardCacheMu.Lock()
	scorecardCache[key] = out
	scorecardCacheMu.Unlock()
	return out, nil
}

// RegionScorecard picks one region out of its scope's scorecard.
func RegionScorecard(month, commodityID, regionID string) (RegionScore, error) {
	s, ok := regionHome[regionID]
	if !ok {
		return RegionScore{}, fmt.Errorf("unknown region %q", regionID)
	}
	all, err := ComputeScorecard(s.ID, month, commodityID)
	if err != nil {
		return RegionScore{}, err
	}
	for _, r := range all {
		if r.RegionID == regionID {
			return r, nil
		}
	}
	return RegionScore{}, fmt.Errorf("region %q has no data for this selection", regionID)
}
