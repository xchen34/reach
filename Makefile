SHELL := /bin/bash

COMPOSE := docker compose -f infra/docker-compose.yml
COMPOSE_WEB := docker compose -f infra/docker-compose.yml --profile web
WEB_DIR := apps/web

.PHONY: help up down restart ps logs logs-api logs-db logs-web \
	migrate api-shell db-shell web web-clean web-port-free reset reset-all seed-demo \
	test-api lint-web typecheck-web build-web

help:
	@printf "\nReach dev commands\n\n"
	@printf "  make up            Start db + api in Docker\n"
	@printf "  make down          Stop Docker services\n"
	@printf "  make restart       Restart db + api\n"
	@printf "  make ps            Show Docker service status\n"
	@printf "  make logs          Tail db + api logs\n"
	@printf "  make logs-api      Tail api logs\n"
	@printf "  make logs-db       Tail db logs\n"
	@printf "  make logs-web      Tail optional Docker web logs\n"
	@printf "  make migrate       Run Alembic migrations in api container\n"
	@printf "  make api-shell     Open a shell in the api container\n"
	@printf "  make db-shell      Open a psql shell in the db container\n"
	@printf "  make web           Run Next dev on the host machine\n"
	@printf "  make web-clean     Remove apps/web/.next\n"
	@printf "  make web-port-free Stop optional Docker web so port 3000 is free\n"
	@printf "  make reset         Stop Docker services and clear host .next cache\n"
	@printf "  make reset-all     Stop Docker services, remove volumes, clear host .next\n"
	@printf "  make seed-demo     Load fictional local demo data through ingest API\n"
	@printf "  make test-api      Run backend pytest suite on the host\n"
	@printf "  make lint-web      Run frontend lint\n"
	@printf "  make typecheck-web Run frontend typecheck\n"
	@printf "  make build-web     Run frontend production build\n\n"
	@printf "Recommended daily flow:\n"
	@printf "  1. make up\n"
	@printf "  2. make migrate\n"
	@printf "  3. make web\n\n"

up:
	$(COMPOSE) up -d db api

down:
	$(COMPOSE_WEB) down

restart:
	$(COMPOSE) restart db api

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f db api

logs-api:
	$(COMPOSE) logs -f api

logs-db:
	$(COMPOSE) logs -f db

logs-web:
	$(COMPOSE_WEB) logs -f web

migrate:
	$(COMPOSE) exec -T api alembic upgrade head

api-shell:
	$(COMPOSE) exec api /bin/sh

db-shell:
	$(COMPOSE) exec db psql -U Reach -d Reach

web-clean:
	rm -rf $(WEB_DIR)/.next

web-port-free:
	-$(COMPOSE_WEB) stop web
	-$(COMPOSE_WEB) rm -f web

web: web-port-free web-clean
	set -a; [ -f ./.env ] && . ./.env || true; set +a; cd $(WEB_DIR) && npm run dev

reset: down web-clean

reset-all: down web-clean
	$(COMPOSE_WEB) down -v

seed-demo:
	set -a; [ -f ./.env ] && . ./.env || true; set +a; bash ./scripts/seed_demo_data.sh

test-api:
	PYTHONPATH="$(PWD)/apps/api" python3 -m pytest

lint-web:
	cd $(WEB_DIR) && npm run lint

typecheck-web:
	cd $(WEB_DIR) && npm run typecheck

build-web:
	cd $(WEB_DIR) && npm run build
