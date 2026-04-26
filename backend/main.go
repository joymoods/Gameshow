package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"games/api"
	"games/game/core"
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

	manager := core.NewManager()
	go manager.StartCleanup(context.Background())
	hub := ws.NewHub()
	wsHandler := ws.NewHandler(hub, manager)
	apiRouter := api.NewRouter(manager, wsHandler)
	mediaHandler := media.NewHandler(uploadDir)

	mux := http.NewServeMux()

	mux.Handle("/ws", wsHandler)
	apiRouter.Register(mux)
	mux.HandleFunc("/api/media/upload", mediaHandler.ServeUpload)
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(uploadDir))))

	log.Printf("Games backend starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
