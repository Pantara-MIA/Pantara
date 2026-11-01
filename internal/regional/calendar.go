package regional

import (
	"encoding/csv"
	"io"
	"io/fs"
	"log"
	"sort"
	"time"
)

// HolidaysFile is the Indonesian holiday calendar built by model/fetch_holidays.py:
// date,holiday_id,name,category,estimated.
const HolidaysFile = "data/calendar/holidays.csv"

const (
	HolidayPublic = "libur_nasional"
	HolidayLeave  = "cuti_bersama"
	HolidayEid    = "idul-fitri"
	HolidayAdha   = "idul-adha"
)

type Holiday struct {
	Date      time.Time
	ID        string
	Name      string
	Category  string
	Estimated bool
}

var holidays []Holiday

// eidAlFitr is the first day of Idul Fitri per year, ascending.
var eidAlFitr []time.Time

var idulAdha []time.Time

// offDays holds every holiday and collective leave day, keyed "2006-01-02".
var offDays map[string]bool

func initCalendar(fsys fs.FS) {
	holidays = loadHolidays(fsys)
	eidAlFitr = holidayDates(HolidayEid, HolidayPublic)
	idulAdha = holidayDates(HolidayAdha, HolidayPublic)
	offDays = map[string]bool{}
	for _, h := range holidays {
		offDays[h.Date.Format("2006-01-02")] = true
	}
	if len(eidAlFitr) == 0 {
		log.Printf("Warning: no Idul Fitri dates in %s, Eid features and effects disabled", HolidaysFile)
		return
	}
	log.Printf("Calendar: %d holiday rows, Idul Fitri %s to %s", len(holidays),
		eidAlFitr[0].Format("2006"), eidAlFitr[len(eidAlFitr)-1].Format("2006"))
}

func loadHolidays(fsys fs.FS) []Holiday {
	f, err := fsys.Open(HolidaysFile)
	if err != nil {
		return nil
	}
	defer f.Close()
	r := csv.NewReader(f)
	_, _ = r.Read()
	var out []Holiday
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(rec) < 5 {
			continue
		}
		day, err := time.Parse("2006-01-02", rec[0])
		if err != nil {
			continue
		}
		out = append(out, Holiday{Date: day, ID: rec[1], Name: rec[2], Category: rec[3], Estimated: rec[4] == "1"})
	}
	return out
}

// holidayDates returns the sorted, distinct dates of one holiday in one category.
func holidayDates(id, category string) []time.Time {
	seen := map[time.Time]bool{}
	var out []time.Time
	for _, h := range holidays {
		if h.ID == id && h.Category == category && !seen[h.Date] {
			seen[h.Date] = true
			out = append(out, h.Date)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Before(out[j]) })
	return out
}

// offDaysAhead counts holidays and collective leave days in (day, day+n].
func offDaysAhead(day time.Time, n int) float64 {
	count := 0.0
	for i := 1; i <= n; i++ {
		if offDays[day.AddDate(0, 0, i).Format("2006-01-02")] {
			count++
		}
	}
	return count
}
