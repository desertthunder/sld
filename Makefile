# One entry point for every package. Run `make help` for the list.

.DEFAULT_GOAL := help

.PHONY: help install dev fmt lint check test build ci

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-10s %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

dev: ## Run the web app on :5173
	pnpm --filter @sld/web dev

fmt: ## Format everything
	pnpm format

lint: ## Check formatting and lint
	pnpm lint

check: ## Type-check TypeScript
	pnpm check

test: ## Run every test suite
	pnpm test

build: ## Build every package
	pnpm build

ci: lint check test build ## Everything CI runs
