package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"games/api"
	"games/cache"
	"games/db"
	"games/game/core"
	"games/library"
	"games/media"
	"games/ws"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}

	ctx := context.Background()

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		if err := db.Connect(ctx, dsn); err != nil {
			log.Fatalf("postgres connect: %v", err)
		}
		defer db.Close()
		log.Println("postgres connected")
	}

	if rurl := os.Getenv("REDIS_URL"); rurl != "" {
		if err := cache.Connect(ctx, rurl); err != nil {
			log.Printf("redis connect failed (non-fatal): %v", err)
		} else {
			defer cache.Close()
			log.Println("redis connected")
		}
	}

	manager := core.NewManager()
	go manager.StartCleanup(ctx)
	hub := ws.NewHub()
	wsHandler := ws.NewHandler(hub, manager)
	quizStore := library.NewQuizStore(db.Pool())
	apiRouter := api.NewRouter(manager, wsHandler, quizStore)
	mediaHandler := media.NewHandler(uploadDir)

	mux := http.NewServeMux()

	mux.Handle("/ws", wsHandler)
	apiRouter.Register(mux)
	mux.HandleFunc("/api/media/upload", apiRouter.WithAdminAuth(mediaHandler.ServeUpload))
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(uploadDir))))

	log.Printf("Games backend starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
