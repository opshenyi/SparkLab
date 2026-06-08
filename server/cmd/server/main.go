package main

import (
	"log"
	"net/http"
	"time"

	"sparklab/server/internal/config"
	"sparklab/server/internal/db"
	"sparklab/server/internal/router"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	database, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("open db failed: %v", err)
	}

	r := router.New(cfg, database)
	addr := "0.0.0.0:" + cfg.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 20 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	log.Printf("Spark Lab Server running on http://%s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}
