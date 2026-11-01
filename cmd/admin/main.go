// Command admin manages accounts that must not be self-registered.
//
//	go run ./cmd/admin create-government \
//	    -email dinas@bandungkab.go.id -password '...' \
//	    -agency "Dinas Ketahanan Pangan Kab. Bandung" -region kab-bandung
//
// -region is a region ID (regency/city or province, see internal/regional) or a
// scope ID: "jawa-barat" for the whole province, "indonesia" for national
// for province-wide authority. Running it again for an existing email resets
// the password and updates the agency and region.
package main

import (
	"flag"
	"fmt"
	"os"
	"pantara"
	"pantara/internal/regional"
	"pantara/internal/store"
	"strings"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "create-government" {
		fmt.Fprintln(os.Stderr, "usage: admin create-government -email E -password P -agency A -region R")
		os.Exit(2)
	}
	fs := flag.NewFlagSet("create-government", flag.ExitOnError)
	email := fs.String("email", "", "login email")
	password := fs.String("password", "", "password (min. 10 characters)")
	agency := fs.String("agency", "", "agency name shown to the public")
	region := fs.String("region", "", `region ID, or a scope ID ("jawa-barat", "indonesia")`)
	fs.Parse(os.Args[2:])

	*email = strings.TrimSpace(strings.ToLower(*email))
	if *email == "" || *agency == "" || *region == "" {
		fail("email, agency and region are required")
	}
	if len(*password) < 10 {
		fail("password must be at least 10 characters")
	}
	regional.Init(pantara.DataFS)
	if !regional.IsJurisdiction(*region) {
		fail(fmt.Sprintf("unknown region %q", *region))
	}

	_ = godotenv.Load()
	store.InitDB(pantara.MigrationsFS)
	if err := store.DB.Ping(); err != nil {
		fail("database unreachable: " + err.Error())
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		fail(err.Error())
	}
	tx, err := store.DB.Begin()
	if err != nil {
		fail(err.Error())
	}
	defer tx.Rollback()

	var id, role string
	err = tx.QueryRow(`
		INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, 'government')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		RETURNING id, role`, *email, string(hash)).Scan(&id, &role)
	if err != nil {
		fail(err.Error())
	}
	if role != "government" {
		fail("this email already belongs to an MSME account; use another email")
	}
	if _, err := tx.Exec(`
		INSERT INTO government_profiles (id, agency_name, region_id) VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE SET agency_name = EXCLUDED.agency_name, region_id = EXCLUDED.region_id`,
		id, *agency, *region); err != nil {
		fail(err.Error())
	}
	if err := tx.Commit(); err != nil {
		fail(err.Error())
	}
	fmt.Printf("government account ready: %s (%s, region %s)\n", *email, *agency, *region)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "error:", msg)
	os.Exit(1)
}
