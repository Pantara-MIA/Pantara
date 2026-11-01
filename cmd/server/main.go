package main

import (
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"pantara"
	"pantara/internal/api"
	"pantara/internal/regional"
	"pantara/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	if err := api.InitAuth(); err != nil {
		log.Fatal(err)
	}
	store.InitDB(pantara.MigrationsFS)
	regional.Init(pantara.DataFS)
	// Warm the backtest cache so the methodology page answers immediately.
	go regional.Backtest()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
	}))

	api.SetupRoutes(r)

	webDist, _ := fs.Sub(pantara.WebFS, "web/dist")

	// Custom SPA handler
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve a physical file
		file, err := webDist.Open(r.URL.Path[1:])
		if err == nil {
			file.Close()
			http.FileServer(http.FS(webDist)).ServeHTTP(w, r)
			return
		}

		// Fall back to index.html for react-router
		indexFile, _ := webDist.Open("index.html")
		defer indexFile.Close()
		stat, _ := indexFile.Stat()
		http.ServeContent(w, r, "index.html", stat.ModTime(), indexFile.(io.ReadSeeker))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server Pantara berjalan di port %s...\n", port)
	http.ListenAndServe(":"+port, r)
}
