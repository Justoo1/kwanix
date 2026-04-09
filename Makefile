# RoutePass — Makefile
# All commands run inside Docker. Run `make up` first.

.PHONY: help \
        up down restart restart-api restart-web logs api-logs web-logs ps \
        build rebuild rebuild-api rebuild-web \
        web-shell shell db-shell \
        generate-types \
        test test-postgres test-all test-cov \
        lint lint-fix typecheck \
        migrate migrate-down migrate-history revision \
        seed \
        staging-up staging-down staging-build staging-migrate staging-logs \
        prod-up prod-down prod-build prod-migrate prod-logs \
        clean clean-staging clean-prod prune

# Shared env-file flag for each environment
DEV     = docker compose --env-file .env.dev
STAGING = docker compose --env-file .env.staging -f docker-compose.staging.yml
PROD    = docker compose --env-file .env.production -f docker-compose.prod.yml

# ── Default target ─────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "RoutePass — available targets"
	@echo ""
	@echo "  Development (reads .env.dev)"
	@echo "    up              Start all services: postgres, redis, api, web"
	@echo "    down            Stop and remove all containers"
	@echo "    restart-api     Restart the api service"
	@echo "    restart-web     Restart the web service (re-runs npm install)"
	@echo "    restart         Restart both api and web"
	@echo "    logs            Follow logs for all services"
	@echo "    api-logs        Follow api service logs only"
	@echo "    web-logs        Follow web service logs only"
	@echo "    ps              Show running containers"
	@echo ""
	@echo "  Build (development)"
	@echo "    build           Build both api and web images"
	@echo "    rebuild         Force rebuild both images (no cache) and restart"
	@echo "    rebuild-api     Force rebuild api image only"
	@echo "    rebuild-web     Force rebuild web image + clear node_modules cache"
	@echo ""
	@echo "  Shells"
	@echo "    shell           Bash shell inside the api container"
	@echo "    web-shell       sh shell inside the web container"
	@echo "    db-shell        psql shell (superuser)"
	@echo ""
	@echo "  Type generation (API must be running)"
	@echo "    generate-types  Regenerate apps/web/types/api.generated.ts from OpenAPI"
	@echo ""
	@echo "  Testing"
	@echo "    test            Fast suite (SQLite, no Postgres required)"
	@echo "    test-postgres   RLS isolation tests (requires live Postgres)"
	@echo "    test-all        Both suites"
	@echo "    test-cov        Fast suite with HTML coverage report"
	@echo ""
	@echo "  Code quality"
	@echo "    lint            ruff check (read-only)"
	@echo "    lint-fix        ruff check --fix + format"
	@echo "    typecheck       mypy static analysis"
	@echo ""
	@echo "  Database"
	@echo "    migrate         Manually apply pending migrations (auto-runs on up)"
	@echo "    migrate-down    Downgrade one migration step"
	@echo "    migrate-history Show migration history"
	@echo "    revision MSG=   Generate a new Alembic migration (MSG required)"
	@echo "    seed            Load demo data (company, stations, users, vehicle)"
	@echo ""
	@echo "  Staging (reads .env.staging)"
	@echo "    staging-up      Start staging stack (detached)"
	@echo "    staging-down    Stop staging stack"
	@echo "    staging-build   Build staging images (no cache)"
	@echo "    staging-migrate Apply pending migrations on staging"
	@echo "    staging-logs    Follow staging logs"
	@echo ""
	@echo "  Production (reads .env.production)"
	@echo "    prod-up         Start production stack (detached)"
	@echo "    prod-down       Stop production stack"
	@echo "    prod-build      Build production images (no cache)"
	@echo "    prod-migrate    Apply pending migrations on production"
	@echo "    prod-logs       Follow production logs"
	@echo ""
	@echo "  Cleanup"
	@echo "    clean           Stop dev stack, remove volumes and locally-built images"
	@echo "    clean-staging   Stop staging stack, remove volumes and locally-built images"
	@echo "    clean-prod      Stop prod stack and remove volumes (DATA LOSS — confirm first)"
	@echo "    prune           System-wide: remove all stopped containers, dangling images, build cache"
	@echo ""

# ── Development — Infrastructure ──────────────────────────────────────────────

up:
	$(DEV) up -d

down:
	$(DEV) down

restart-api:
	$(DEV) restart api

restart-web:
	# Force-recreate so the startup command (npm install && npm run dev) re-runs
	$(DEV) up -d --force-recreate web

restart: restart-api restart-web

logs:
	$(DEV) logs -f

api-logs:
	$(DEV) logs -f api

web-logs:
	$(DEV) logs -f web

ps:
	$(DEV) ps

# ── Development — Build ────────────────────────────────────────────────────────

build:
	# Builds all services that have a build: section (api + web)
	$(DEV) build

rebuild:
	$(DEV) build --no-cache
	$(DEV) up -d

rebuild-api:
	$(DEV) build --no-cache api
	$(DEV) up -d api

rebuild-web:
	# Clears the node_modules named volume so the next startup is fully fresh
	$(DEV) rm -f -s -v web
	docker volume rm routpass_web_node_modules 2>/dev/null || true
	$(DEV) build --no-cache web
	$(DEV) up -d web

# ── Shells ────────────────────────────────────────────────────────────────────

shell:
	$(DEV) exec api bash

web-shell:
	$(DEV) exec web sh

db-shell:
	$(DEV) exec postgres psql -U $${POSTGRES_USER:-routpass} -d $${POSTGRES_DB:-routpass_db}

# ── Type generation ───────────────────────────────────────────────────────────
# Runs on the HOST (not inside Docker) so localhost:8000 resolves to the
# exposed API port. Requires the dev stack to be running (make up).

generate-types:
	cd apps/web && npm run generate-types

# ── Testing ───────────────────────────────────────────────────────────────────

test:
	$(DEV) exec api pytest tests/ -m "not postgres" -q

test-postgres:
	$(DEV) exec api pytest tests/ -m postgres -q

test-all:
	$(DEV) exec api pytest tests/ -q

test-cov:
	$(DEV) exec api pytest tests/ -m "not postgres" \
	  --cov=app --cov-report=html --cov-report=term-missing -q
	@echo "Coverage report: apps/api/htmlcov/index.html"

# ── Code quality ──────────────────────────────────────────────────────────────

lint:
	$(DEV) exec api ruff check app tests

lint-fix:
	$(DEV) exec api ruff check app tests --fix
	$(DEV) exec api ruff format app tests

typecheck:
	$(DEV) exec api mypy app

# ── Database ──────────────────────────────────────────────────────────────────

migrate:
	$(DEV) exec api alembic upgrade head

migrate-down:
	$(DEV) exec api alembic downgrade -1

migrate-history:
	$(DEV) exec api alembic history --verbose

# Usage: make revision MSG="add payment_status index"
revision:
	@if [ -z "$(MSG)" ]; then \
	  echo "Error: MSG is required. Usage: make revision MSG=\"your message\""; \
	  exit 1; \
	fi
	$(DEV) exec api alembic revision --autogenerate -m "$(MSG)"

seed:
	$(DEV) exec -e PYTHONPATH=/app api python /infrastructure/scripts/seed_db.py

# ── Staging ───────────────────────────────────────────────────────────────────

staging-up:
	$(STAGING) up -d

staging-down:
	$(STAGING) down

staging-build:
	$(STAGING) build --no-cache

staging-migrate:
	$(STAGING) exec api alembic upgrade head

staging-logs:
	$(STAGING) logs -f

# ── Production ────────────────────────────────────────────────────────────────

prod-up:
	$(PROD) up -d

prod-down:
	$(PROD) down

prod-build:
	$(PROD) build --no-cache

prod-migrate:
	$(PROD) exec api alembic upgrade head

prod-logs:
	$(PROD) logs -f

# ── Cleanup ───────────────────────────────────────────────────────────────────

clean:
	$(DEV) down --volumes --rmi local

clean-staging:
	$(STAGING) down --volumes --rmi local

# WARNING: removes production data volumes — only run if you know what you're doing
clean-prod:
	$(PROD) down --volumes --rmi local

prune:
	docker system prune -f --volumes
