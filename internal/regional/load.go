package regional

import (
	"log"
	"sync"
	"sync/atomic"
)

// scopeData is the price data of one scope, indexed [commodity][region][day]
// like Commodities, Regions and dates. It is immutable once built, so callers
// may keep using a *scopeData even after the scope has been evicted.
type scopeData struct {
	// prices[ci][ri] is nil when the region has no data for the commodity.
	prices [][][]float64
	// reference is the ceiling the price is held to: HET/HAP where one exists,
	// else the statistical baseline. It drives alerts, planning and evaluation.
	reference [][][]float64
	// normal is the statistical "normal band" (90-day median + 10%) for every
	// commodity, regulated or not. The stability score measures spikes above it.
	normal    [][][]float64
	logPrices [][][]float64
	sigmas    [][][]float64
	// median[ci][day]: median across the regions with data; nil if none.
	median [][]float64
	// source[ci][ri] is where a series comes from (SourcePIHPS, SourceSP2KP,
	// SourceSynthetic); refType[ci][ri] the type of its reference ("HET", "HAP",
	// "baseline"), which can depend on the source (MinyaKita HET for SP2KP).
	source  [][]string
	refType [][]string
}

// Price series sources.
const (
	SourcePIHPS     = "pihps"
	SourceSP2KP     = "sp2kp"
	SourceSynthetic = "synthetic"
)

// SourceLabel names a series source for users (Indonesian).
func SourceLabel(source string) string {
	switch source {
	case SourcePIHPS:
		return "PIHPS Bank Indonesia"
	case SourceSP2KP:
		return "SP2KP Kemendag"
	case SourceSynthetic:
		return "sintetis (Pantara)"
	}
	return ""
}

// maxLazyLoaded caps how many lazily built scopes stay in memory; the least
// recently used one is dropped (and rebuilt on demand, deterministically).
const maxLazyLoaded = 8

var (
	useTick atomic.Int64
	evictMu sync.Mutex
)

// d returns the scope's data, building it on first use for lazy scopes.
func (s *Scope) d() *scopeData {
	if d := s.data.Load(); d != nil {
		s.used.Store(useTick.Add(1))
		return d
	}
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	if d := s.data.Load(); d != nil {
		return d
	}
	d, _ := s.derive(s.build())
	s.data.Store(d)
	s.used.Store(useTick.Add(1))
	log.Printf("Scope %s: built %d regions × %d commodities on demand", s.ID, len(s.Regions), len(s.Commodities))
	evictIdle(s)
	return d
}

// evictIdle drops the least recently used lazy scopes beyond maxLazyLoaded.
func evictIdle(keep *Scope) {
	evictMu.Lock()
	defer evictMu.Unlock()
	for {
		var loaded []*Scope
		for _, s := range Scopes {
			if s.build != nil && s.data.Load() != nil {
				loaded = append(loaded, s)
			}
		}
		if len(loaded) <= maxLazyLoaded {
			return
		}
		var oldest *Scope
		for _, s := range loaded {
			if s != keep && (oldest == nil || s.used.Load() < oldest.used.Load()) {
				oldest = s
			}
		}
		oldest.data.Store(nil)
	}
}
