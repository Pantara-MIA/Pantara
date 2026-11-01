package store

import (
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"path"
	"sort"
	"strings"
)

// migrationLockKey is an arbitrary constant for pg_advisory_lock, so two
// servers starting at once never apply the same migration twice.
const migrationLockKey = 72_617_301

// Migrate applies every db/migrations/*.sql file not yet recorded in
// schema_migrations, in filename order, each inside its own transaction.
func Migrate(db *sql.DB, fsys fs.FS) error {
	files, err := fs.Glob(fsys, "db/migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	conn, err := db.Conn(bgCtx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if _, err := conn.ExecContext(bgCtx, `SELECT pg_advisory_lock($1)`, migrationLockKey); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	defer conn.ExecContext(bgCtx, `SELECT pg_advisory_unlock($1)`, migrationLockKey)

	if _, err := conn.ExecContext(bgCtx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    text        PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	applied := map[string]bool{}
	rows, err := conn.QueryContext(bgCtx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return err
		}
		applied[v] = true
	}
	rows.Close()

	for _, f := range files {
		version := strings.TrimSuffix(path.Base(f), ".sql")
		if applied[version] {
			continue
		}
		body, err := fs.ReadFile(fsys, f)
		if err != nil {
			return err
		}
		tx, err := conn.BeginTx(bgCtx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s: %w", version, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
		log.Printf("Applied migration %s", version)
	}
	return nil
}
