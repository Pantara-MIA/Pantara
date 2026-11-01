package store

import (
	"context"
	"database/sql"
	"io/fs"
	"log"
	"os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

var bgCtx = context.Background()

// InitDB opens DATABASE_URL and, when the database is reachable, applies any
// pending migrations from migrations (db/migrations/*.sql). The server still
// starts without a database so the public, file-backed pages keep working.
func InitDB(migrations fs.FS) {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Error opening database: %v", err)
	}
	DB = db

	if err := db.Ping(); err != nil {
		log.Printf("Warning: Could not connect to Supabase PostgreSQL: %v", err)
		return
	}
	log.Println("Successfully connected to Supabase PostgreSQL!")

	if err := Migrate(db, migrations); err != nil {
		log.Printf("Warning: database migration failed: %v", err)
	}
}
