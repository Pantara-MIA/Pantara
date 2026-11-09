package api

import "testing"

func TestRecentSignalExamplesOnePerEpisodeNewestFirst(t *testing.T) {
	const days = 200
	dates := make([]string, days)
	source := make([]float64, days)
	alt := make([]float64, days)
	for i := range days {
		dates[i] = string(rune('a'+i%26)) + string(rune('a'+i/26))
		source[i] = 110 + float64(i%2)*2
		alt[i] = 100
	}
	// Episodes: days 120-122 and day 180; the older one has three active days.
	for _, i := range []int{120, 121, 122, 180} {
		source[i] = 150
	}

	got := recentSignalExamples(dates, source, []altSeries{{name: "Pengganti", prices: alt}}, 5)
	if len(got) != 2 {
		t.Fatalf("got %d examples, want 2: %+v", len(got), got)
	}
	if got[0].Date != dates[180] || got[1].Date != dates[122] {
		t.Fatalf("got dates %s, %s; want %s, %s", got[0].Date, got[1].Date, dates[180], dates[122])
	}
	if got[0].Commodity != "Pengganti" {
		t.Fatalf("got commodity %q", got[0].Commodity)
	}
}

func TestRecentSignalExamplesRespectsLimit(t *testing.T) {
	const days = 200
	dates := make([]string, days)
	source := make([]float64, days)
	alt := make([]float64, days)
	for i := range days {
		dates[i] = string(rune('a'+i%26)) + string(rune('a'+i/26))
		source[i] = 110 + float64(i%2)*2
		alt[i] = 100
	}
	for _, i := range []int{120, 180} {
		source[i] = 150
	}

	got := recentSignalExamples(dates, source, []altSeries{{name: "Pengganti", prices: alt}}, 1)
	if len(got) != 1 || got[0].Date != dates[180] {
		t.Fatalf("got %+v, want only day 180", got)
	}
}
