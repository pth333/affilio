# Affilio — lệnh nhanh cho môi trường dev.
# Mặc định `make` = chạy đồng thời API, web và worker (Ctrl+C dừng cả 3).

.DEFAULT_GOAL := dev
.PHONY: dev api web worker install db-up db-down db-migrate check test build help

dev: ## Chạy api (3100) + web (3001) + worker
	pnpm dev

api: ## Chỉ chạy API
	pnpm dev:api

web: ## Chỉ chạy web
	pnpm dev:web

worker: ## Chỉ chạy worker
	pnpm dev:worker

install: ## Cài dependency toàn workspace
	pnpm install

db-up: ## Bật Postgres dev bằng Docker
	pnpm db:up

db-down: ## Tắt Postgres dev
	pnpm db:down

db-migrate: ## Chạy migration + seed
	pnpm db:migrate

check: ## Kiểm tra kiểu, lint và test
	pnpm typecheck
	pnpm lint
	pnpm test

build: ## Build web
	pnpm build

help: ## In danh sách lệnh
	@echo dev        - chay api + web + worker (Ctrl+C de dung)
	@echo api        - chi chay API
	@echo web        - chi chay web
	@echo worker     - chi chay worker
	@echo install    - cai dependency
	@echo db-up      - bat Postgres dev (Docker)
	@echo db-down    - tat Postgres dev
	@echo db-migrate - chay migration + seed
	@echo check      - typecheck + lint + test
	@echo build      - build web
