.PHONY: build build-admin build-player deploy up down sync-env setup test test-api

# Liest ADMIN_TOKEN aus der Root-.env (erste Zeile mit dem Key, kein Kommentar)
ADMIN_TOKEN := $(shell grep -E '^ADMIN_TOKEN=' .env 2>/dev/null | cut -d= -f2)

# ---------------------------------------------------------------------------
# sync-env: schreibt VITE_ADMIN_TOKEN in admin-frontend/.env
#           (überschreibt nur diesen Wert, Rest der Datei bleibt erhalten)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# test: Go-Unit-Tests mit Race-Detektor
# ---------------------------------------------------------------------------
test:
	cd backend && go test ./... -race

# ---------------------------------------------------------------------------
# test-api: Postman-Collection via Newman (npm i -g newman vorausgesetzt)
#           Liest ADMIN_TOKEN aus der Root-.env automatisch.
# ---------------------------------------------------------------------------
test-api:
	newman run docs/postman/BrainStorm.postman_collection.json \
	  -e docs/postman/BrainStorm.postman_environment.json \
	  --env-var "adminToken=$(ADMIN_TOKEN)"

sync-env:
	@bash scripts/sync-env.sh

# ---------------------------------------------------------------------------
# build-admin: sync + Vite-Build des Admin-Frontends
# Baut im Docker-Node-Container, falls npm nicht lokal installiert ist.
# ---------------------------------------------------------------------------
build-admin: sync-env
	@if command -v npm >/dev/null 2>&1; then \
	  cd admin-frontend && npm run build; \
	else \
	  docker run --rm \
	    -v "$(CURDIR)/admin-frontend:/app" \
	    -w /app \
	    node:20-alpine \
	    sh -c "npm ci && npm run build"; \
	fi
	@echo "✓ Admin-Frontend gebaut"

# ---------------------------------------------------------------------------
# build-player: Vite-Build des Player-Frontends
# ---------------------------------------------------------------------------
build-player:
	@if command -v npm >/dev/null 2>&1; then \
	  cd player-frontend && npm run build; \
	else \
	  docker run --rm \
	    -v "$(CURDIR)/player-frontend:/app" \
	    -w /app \
	    node:20-alpine \
	    sh -c "npm ci && npm run build"; \
	fi
	@echo "✓ Player-Frontend gebaut"

# ---------------------------------------------------------------------------
# build: beide Frontends bauen
# ---------------------------------------------------------------------------
build: build-admin build-player

# ---------------------------------------------------------------------------
# up: Docker-Stack starten (ohne Build)
# ---------------------------------------------------------------------------
up:
	docker compose up -d

# ---------------------------------------------------------------------------
# deploy: Frontends bauen + Stack neu starten
# ---------------------------------------------------------------------------
deploy: build
	docker compose up -d --build
	@echo "✓ Deploy abgeschlossen"

# ---------------------------------------------------------------------------
# down: Stack stoppen
# ---------------------------------------------------------------------------
down:
	docker compose down

# ---------------------------------------------------------------------------
# setup: Interaktives Ersteinrichtungs-Script
# ---------------------------------------------------------------------------
setup:
	@bash scripts/setup.sh
