package api

import (
	"net/http"
	"os"
	"strings"
)

// isAdmin checks the Authorization header against the ADMIN_TOKEN env var.
// Reading from env on each call keeps the implementation test-friendly
// (tests can use t.Setenv without restarting the process).
func isAdmin(r *http.Request) bool {
	token := os.Getenv("ADMIN_TOKEN")
	if token == "" {
		return false
	}
	auth := r.Header.Get("Authorization")
	return strings.TrimPrefix(auth, "Bearer ") == token
}

// withAdminAuth wraps a handler and returns 401 for unauthenticated callers.
// OPTIONS preflight requests bypass auth (handled upstream by withCORS).
func (ro *Router) withAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isAdmin(r) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}
