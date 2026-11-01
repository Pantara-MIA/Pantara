package regional

import (
	"fmt"
	"slices"
	"sync"
	"sync/atomic"
)

// ─────────────────────────────────────────────────────────────────────────────
// Scopes: the regional hierarchy.
//
//   indonesia   — 34 provinces, real PIHPS prices (data/pihps/province_prices.csv)
//   jawa-barat  — 27 regencies/cities of West Java (curated), synthetic prices
//                 anchored to the real West Java series
//   <province>  — the regencies/cities of each other province
//                 (data/regions/regencies.json), synthetic prices anchored to the
//                 real province series, built on first use (see load.go)
//
// Regions are ranked against the other regions of their scope. A region whose
// ChildScope is set (every province) can be drilled into. Scope IDs double as
// government jurisdictions: an account for a scope covers every region in it
// and in its sub-scopes.
// ─────────────────────────────────────────────────────────────────────────────

const (
	ScopeNational = "indonesia"
	ScopeJabar    = "jawa-barat"
)

// Scope is one level of the hierarchy with its own price data.
type Scope struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Level string `json:"level"` // level of its members: "province" | "regency"
	// Parent is the enclosing scope; Region is the region (in the parent scope)
	// this scope breaks down.
	Parent    string `json:"parent,omitempty"`
	Region    string `json:"region,omitempty"`
	Source    string `json:"source"`    // shown to users, so written in Indonesian
	Synthetic bool   `json:"synthetic"` // true when any series is synthetic
	// RealShare is the share of region × commodity series with real data.
	RealShare float64 `json:"real_share"`
	// Commodities lists the commodity IDs with data in this scope.
	Commodities []string `json:"commodities"`
	Regions     []Region `json:"-"`

	// ownBaseline: statistical references follow each region's own history
	// (provinces differ structurally) rather than the scope median.
	ownBaseline bool
	index       map[string]int
	// data holds the price series; build, when set, generates the prices of a
	// lazily loaded scope (see load.go).
	data   atomic.Pointer[scopeData]
	build  func() ([][][]float64, [][]string)
	loadMu sync.Mutex
	used   atomic.Int64
}

var (
	Scopes     []*Scope
	scopeByID  = map[string]*Scope{}
	regionHome = map[string]*Scope{}
)

func register(s *Scope) {
	s.index = map[string]int{}
	for i := range s.Regions {
		id := s.Regions[i].ID
		if _, dup := regionHome[id]; dup {
			panic(fmt.Sprintf("regional: duplicate region ID %q", id))
		}
		s.Regions[i].Scope = s.ID
		s.index[id] = i
		regionHome[id] = s
	}
	Scopes = append(Scopes, s)
	scopeByID[s.ID] = s
}

// linkNeighbors fills Neighbors from a one-way border list, keeping the order
// of regions so API output is stable.
func linkNeighbors(regions []Region, borders map[string][]string) {
	adj := map[string]map[string]bool{}
	link := func(a, b string) {
		if adj[a] == nil {
			adj[a] = map[string]bool{}
		}
		adj[a][b] = true
	}
	for a, list := range borders {
		for _, b := range list {
			link(a, b)
			link(b, a)
		}
	}
	for i := range regions {
		r := &regions[i]
		r.Neighbors = []string{}
		for _, other := range regions {
			if adj[r.ID][other.ID] {
				r.Neighbors = append(r.Neighbors, other.ID)
			}
		}
	}
}

// FindScope returns a scope by ID.
func FindScope(id string) (*Scope, bool) {
	s, ok := scopeByID[id]
	return s, ok
}

// FindRegion returns a region by ID, in any scope.
func FindRegion(id string) (Region, bool) {
	s, ok := regionHome[id]
	if !ok {
		return Region{}, false
	}
	return s.Regions[s.index[id]], true
}

// ScopeOf returns the scope a region is ranked in.
func ScopeOf(regionID string) (*Scope, bool) {
	s, ok := regionHome[regionID]
	return s, ok
}

// Ancestors returns the scope IDs enclosing a region, innermost first.
func Ancestors(regionID string) []string {
	var out []string
	s, ok := regionHome[regionID]
	for ok {
		out = append(out, s.ID)
		s, ok = scopeByID[s.Parent]
	}
	return out
}

// IsJurisdiction reports whether id names a region or a scope.
func IsJurisdiction(id string) bool {
	_, isScope := scopeByID[id]
	_, isRegion := regionHome[id]
	return isScope || isRegion
}

// Covers reports whether a jurisdiction (a region or scope ID) includes regionID.
func Covers(jurisdiction, regionID string) bool {
	return jurisdiction == regionID || slices.Contains(Ancestors(regionID), jurisdiction)
}

// Has reports whether the scope has data for a commodity.
func (s *Scope) Has(commodityID string) bool {
	return slices.Contains(s.Commodities, commodityID)
}

func (s *Scope) indices(regionID, commodityID string) (d *scopeData, ci, ri int, ok bool) {
	ri, ok1 := s.index[regionID]
	ci, ok2 := commodityIndex[commodityID]
	if !ok1 || !ok2 {
		return nil, 0, 0, false
	}
	d = s.d()
	return d, ci, ri, d.prices[ci][ri] != nil
}

// Prices returns a region's price series for a commodity (nil if no data).
func (s *Scope) Prices(regionID, commodityID string) []float64 {
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return nil
	}
	return d.prices[ci][ri]
}

// Reference returns the reference ceiling in force for a region, per day.
func (s *Scope) Reference(regionID, commodityID string) []float64 {
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return nil
	}
	return d.reference[ci][ri]
}

// Normal returns the statistical normal band of a region, per day.
func (s *Scope) Normal(regionID, commodityID string) []float64 {
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return nil
	}
	return d.normal[ci][ri]
}

// SeriesInfo returns where a region's series comes from (SourcePIHPS,
// SourceSP2KP, SourceSynthetic) and the type of its reference.
func (s *Scope) SeriesInfo(regionID, commodityID string) (source, refType string) {
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return "", ""
	}
	return d.source[ci][ri], d.refType[ci][ri]
}

// Median returns the scope-wide median price series of a commodity.
func (s *Scope) Median(commodityID string) []float64 {
	ci, ok := commodityIndex[commodityID]
	if !ok {
		return nil
	}
	return s.d().median[ci]
}

// NeighborMedian returns the median price of a region's neighbours with data
// on day t, or 0 when there are none.
func (s *Scope) NeighborMedian(regionID, commodityID string, t int) float64 {
	d, ci, ri, ok := s.indices(regionID, commodityID)
	if !ok {
		return 0
	}
	return s.neighborMedian(d, ci, ri, t)
}

func (s *Scope) neighborMedian(d *scopeData, ci, ri, t int) float64 {
	nb := s.Regions[ri].Neighbors
	buf := make([]float64, 0, len(nb))
	for _, id := range nb {
		if p := d.prices[ci][s.index[id]]; p != nil {
			buf = append(buf, p[t])
		}
	}
	return median(buf)
}

// Prices returns a region's price series for a commodity, in its own scope.
func Prices(regionID, commodityID string) []float64 {
	if s, ok := regionHome[regionID]; ok {
		return s.Prices(regionID, commodityID)
	}
	return nil
}
