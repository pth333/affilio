# Affilio — lệnh nhanh cho môi trường dev.
# Mặc định `make` = bật toàn bộ hạ tầng Docker (Postgres + Temporal + Temporal UI)
# rồi chạy đồng thời API, web và worker (Ctrl+C dừng 3 service của app).

.DEFAULT_GOAL := dev
.PHONY: dev api web worker install db-up db-down infra db-migrate check test build help

dev: ## Bật hạ tầng Docker (Postgres + Temporal + UI), migrate, rồi chạy api (3100) + web (3001) + worker
	pnpm dev

api: ## Chỉ chạy API
	pnpm dev:api

web: ## Chỉ chạy web
	pnpm dev:web

worker: ## Chỉ chạy worker
	pnpm dev:worker

install: ## Cài dependency toàn workspace
	pnpm install

db-up: ## Chỉ bật Postgres dev bằng Docker
	pnpm db:up

db-down: ## Tắt hạ tầng dev (Postgres + Temporal + UI), giữ dữ liệu
	pnpm db:down

infra: ## Chỉ bật hạ tầng Docker + migrate rồi thoát
	node scripts/dev-all.mjs --infra-only

db-migrate: ## Chạy migration + seed
	pnpm db:migrate

check: ## Kiểm tra kiểu, lint và test
	pnpm typecheck
	pnpm lint
	pnpm test

build: ## Build web
	pnpm build

help: ## In danh sách lệnh
	@echo dev        - bat ha tang Docker (Postgres + Temporal + UI) + api + web + worker
	@echo api        - chi chay API
	@echo web        - chi chay web
	@echo worker     - chi chay worker
	@echo install    - cai dependency
	@echo db-up      - chi bat Postgres dev (Docker)
	@echo db-down    - tat ha tang dev (Postgres + Temporal + UI)
	@echo infra      - chi bat ha tang Docker + migrate roi thoat
	@echo db-migrate - chay migration + seed
	@echo check      - typecheck + lint + test
	@echo build      - build web
