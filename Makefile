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
# ---------------------------------------------------------------------------
build-admin: sync-env
	cd admin-frontend && npm run build
	@echo "✓ Admin-Frontend gebaut"

# ---------------------------------------------------------------------------
# build-player: Vite-Build des Player-Frontends
# ---------------------------------------------------------------------------
build-player:
	cd player-frontend && npm run build
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
