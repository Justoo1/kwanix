# RoutePass — Makefile
# All API commands run inside Docker. Run `make up` first.

.PHONY: help \
        up down restart logs ps \
        build rebuild \
        test test-postgres test-all test-cov \
        lint lint-fix typecheck \
        migrate migrate-down migrate-history revision \
        seed shell db-shell \
        api-logs

# ── Default target ─────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "RoutePass — available targets"
	@echo ""
	@echo "  Infrastructure"
	@echo "    up              Start all services (detached)"
	@echo "    down            Stop and remove containers"
	@echo "    restart         Restart the api service"
	@echo "    logs            Follow logs for all services"
	@echo "    api-logs        Follow api service logs only"
	@echo "    ps              Show running containers"
	@echo ""
	@echo "  Build"
	@echo "    build           Build the api image"
	@echo "    rebuild         Force rebuild api image (no cache) and restart"
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
	@echo "    migrate         Apply all pending Alembic migrations"
	@echo "    migrate-down    Downgrade one migration step"
	@echo "    migrate-history Show migration history"
	@echo "    revision MSG=   Generate a new Alembic migration (MSG required)"
	@echo "    seed            Run seed script (demo data)"
	@echo ""
	@echo "  Shells"
	@echo "    shell           Bash shell inside the api container"
	@echo "    db-shell        psql shell (superuser)"
	@echo ""

# ── Infrastructure ─────────────────────────────────────────────────────────────

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart api

logs:
	docker compose logs -f

api-logs:
	docker compose logs -f api

ps:
	docker compose ps

# ── Build ──────────────────────────────────────────────────────────────────────

build:
	docker compose build api

rebuild:
	docker compose build --no-cache api
	docker compose up -d api

# ── Testing ───────────────────────────────────────────────────────────────────

test:
	docker compose exec api pytest tests/ -m "not postgres" -q

test-postgres:
	docker compose exec api pytest tests/ -m postgres -q

test-all:
	docker compose exec api pytest tests/ -q

test-cov:
	docker compose exec api pytest tests/ -m "not postgres" \
	  --cov=app --cov-report=html --cov-report=term-missing -q
	@echo "Coverage report: apps/api/htmlcov/index.html"

# ── Code quality ──────────────────────────────────────────────────────────────

lint:
	docker compose exec api ruff check app tests

lint-fix:
	docker compose exec api ruff check app tests --fix
	docker compose exec api ruff format app tests

typecheck:
	docker compose exec api mypy app

# ── Database ──────────────────────────────────────────────────────────────────

migrate:
	docker compose exec api alembic upgrade head

migrate-down:
	docker compose exec api alembic downgrade -1

migrate-history:
	docker compose exec api alembic history --verbose

# Usage: make revision MSG="add payment_status index"
revision:
	@if [ -z "$(MSG)" ]; then \
	  echo "Error: MSG is required. Usage: make revision MSG=\"your message\""; \
	  exit 1; \
	fi
	docker compose exec api alembic revision --autogenerate -m "$(MSG)"

seed:
	docker compose exec -e PYTHONPATH=/app api python /infrastructure/scripts/seed_db.py

# ── Shells ────────────────────────────────────────────────────────────────────

shell:
	docker compose exec api bash

db-shell:
	docker compose exec postgres psql -U routpass -d routpass_db
