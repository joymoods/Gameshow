package media

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

var allowedTypes = map[string]string{
	"image/jpeg":  ".jpg",
	"image/png":   ".png",
	"image/gif":   ".gif",
	"image/webp":  ".webp",
	"audio/mpeg":  ".mp3",
	"audio/wav":   ".wav",
	"audio/ogg":   ".ogg",
	"video/mp4":   ".mp4",
	"video/webm":  ".webm",
}

const maxUploadSize = 100 << 20 // 100 MB

type Handler struct {
	uploadDir string
}

func NewHandler(uploadDir string) *Handler {
	os.MkdirAll(uploadDir, 0o755)
	return &Handler{uploadDir: uploadDir}
}

// ServeUpload handles POST /api/media/upload
func (h *Handler) ServeUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "file too large or invalid form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Detect content type from first 512 bytes
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	// Also check declared content type from header
	declaredType := header.Header.Get("Content-Type")
	if declaredType != "" {
		// strip parameters like "; charset=utf-8"
		declaredType = strings.Split(declaredType, ";")[0]
		declaredType = strings.TrimSpace(declaredType)
	}

	ext, ok := allowedTypes[contentType]
	if !ok && declaredType != "" {
		ext, ok = allowedTypes[declaredType]
	}
	if !ok {
		http.Error(w, fmt.Sprintf("file type not allowed: %s", contentType), http.StatusBadRequest)
		return
	}

	filename := uuid.NewString() + ext
	dst, err := os.Create(filepath.Join(h.uploadDir, filename))
	if err != nil {
		http.Error(w, "could not save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Write the already-read bytes back, then copy the rest
	dst.Write(buf[:n])
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "could not save file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"url":"/media/%s"}`, filename)
}
