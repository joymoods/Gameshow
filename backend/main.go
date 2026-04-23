package main

import (
	"log"
	"net/http"
	"os"

	"jeopardy/api"
	"jeopardy/game"
	"jeopardy/media"
	"jeopardy/ws"
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

	manager := game.NewManager()
	hub := ws.NewHub()
	wsHandler := ws.NewHandler(hub, manager)
	apiRouter := api.NewRouter(manager, wsHandler)
	mediaHandler := media.NewHandler(uploadDir)

	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.Handle("/ws", wsHandler)

	// REST API
	apiRouter.Register(mux)

	// Media upload
	mux.HandleFunc("/api/media/upload", mediaHandler.ServeUpload)

	// Static file server for uploaded media
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(uploadDir))))

	log.Printf("Jeopardy backend starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
