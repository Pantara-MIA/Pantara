package pantara

import "embed"

//go:embed data/*
var DataFS embed.FS

//go:embed db/migrations/*.sql
var MigrationsFS embed.FS

//go:embed web/dist/*
//go:embed web/dist/assets/*
var WebFS embed.FS
