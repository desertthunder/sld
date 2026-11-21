# One entry point for every package. Run `make help` for the list.

.DEFAULT_GOAL := help

.PHONY: help install dev fmt lint check test build app-shell dry-run lockfile ci

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

# Deploy refuses a build like this, but only once a release is tagged.
app-shell: ## Check the web build serves the app shell and isolation headers for every path
	@if [ ! -f apps/web/build/index.html ]; then echo "::error title=web::apps/web/build/index.html is missing."; exit 1; fi
	@if [ -f apps/web/build/404.html ]; then echo "::error title=web::apps/web/build/404.html exists, so Pages won't serve the app shell for deck URLs."; exit 1; fi
	@for header in Cross-Origin-Opener-Policy Cross-Origin-Embedder-Policy; do \
		if ! grep -qi "^[[:space:]]*$$header:" apps/web/build/_headers 2>/dev/null; then echo "::error title=web::apps/web/build/_headers doesn't set $$header."; exit 1; fi; \
	done

# comment.yml runs the poster with Node alone, so run it that way once.
dry-run: ## Run the Bot comment poster as comment.yml does, posting nothing
	printf 'Review loop finished\n' | node tools/devtools/src/devtools.ts pr ready --repo desertthunder/sld --pr 1 --dry-run --body-file /dev/stdin

lockfile: ## Check pnpm-lock.yaml matches every package.json
	pnpm install --frozen-lockfile

ci: lockfile lint check test build app-shell dry-run ## Everything CI runs
