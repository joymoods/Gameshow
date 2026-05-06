package media_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"games/media"
)

func newMediaServer(t *testing.T) *httptest.Server {
	t.Helper()
	dir := t.TempDir()
	h := media.NewHandler(dir)
	srv := httptest.NewServer(http.HandlerFunc(h.ServeUpload))
	t.Cleanup(srv.Close)
	return srv
}

// buildMultipart creates a multipart/form-data body with a single "file" field.
func buildMultipart(t *testing.T, fieldname, filename string, content []byte, contentType string) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile(fieldname, filename)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := fw.Write(content); err != nil {
		t.Fatalf("write content: %v", err)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

// minimalPNG is a 1×1 white pixel PNG (67 bytes).
var minimalPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
	0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
	0x54, 0x78, 0x9c, 0x62, 0xf8, 0x0f, 0x00, 0x00,
	0x01, 0x01, 0x00, 0x05, 0x18, 0xd8, 0x4e, 0x00,
	0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
	0x42, 0x60, 0x82,
}

func TestMediaUpload_PNG(t *testing.T) {
	srv := newMediaServer(t)

	body, ct := buildMultipart(t, "file", "test.png", minimalPNG, "image/png")
	req, _ := http.NewRequest(http.MethodPost, srv.URL, body)
	req.Header.Set("Content-Type", ct)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	resp.Body.Close()
	if result["url"] == "" {
		t.Error("expected url in response")
	}
}

func TestMediaUpload_InvalidType(t *testing.T) {
	srv := newMediaServer(t)

	body, ct := buildMultipart(t, "file", "test.txt", []byte("not an image"), "text/plain")
	req, _ := http.NewRequest(http.MethodPost, srv.URL, body)
	req.Header.Set("Content-Type", ct)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for disallowed type, got %d", resp.StatusCode)
	}
}

func TestMediaUpload_MissingFile(t *testing.T) {
	srv := newMediaServer(t)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	w.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL, &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for missing file field, got %d", resp.StatusCode)
	}
}

func TestMediaUpload_MethodNotAllowed(t *testing.T) {
	srv := newMediaServer(t)

	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET, got %d", resp.StatusCode)
	}
}

func TestMediaUpload_FileIsPersisted(t *testing.T) {
	dir := t.TempDir()
	h := media.NewHandler(dir)
	srv := httptest.NewServer(http.HandlerFunc(h.ServeUpload))
	defer srv.Close()

	body, ct := buildMultipart(t, "file", "test.png", minimalPNG, "image/png")
	req, _ := http.NewRequest(http.MethodPost, srv.URL, body)
	req.Header.Set("Content-Type", ct)

	resp, _ := http.DefaultClient.Do(req)
	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	resp.Body.Close()

	// Strip the /media/ prefix to get the filename.
	filename := result["url"][len("/media/"):]
	if _, err := os.Stat(dir + "/" + filename); err != nil {
		t.Errorf("uploaded file not found on disk: %v", err)
	}
}
