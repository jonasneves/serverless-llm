.DEFAULT_GOAL := help

.PHONY: help build lint lint-web knip format clean update-models sync-worker-config sync-workflow-choices route-map tunnels-secret install-hooks inference deploy build-images down _purge-inference-history

-include .env
export

help:
	@echo ""
	@echo "\033[2mFrontend\033[0m"
	@echo "  \033[36mbuild\033[0m           Build frontend"
	@echo "  \033[36mdeploy\033[0m          Trigger deploy workflow"
	@echo ""
	@echo "\033[2mCode\033[0m"
	@echo "  \033[36mlint\033[0m            Check Python code"
	@echo "  \033[36mlint-web\033[0m        Lint frontend (eslint: unused vars, hooks)"
	@echo "  \033[36mknip\033[0m            Audit frontend for dead exports/files/deps"
	@echo "  \033[36mformat\033[0m          Format Python code"
	@echo "  \033[36mupdate-models\033[0m   Refresh GitHub models in models.json"
	@echo "  \033[36msync-worker-config\033[0m Regenerate ROUTE_MAP in worker.js from config/models.py"
	@echo "  \033[36msync-workflow-choices\033[0m Regenerate model choices in inference.yml from config/models.py"
	@echo "  \033[36minstall-hooks\033[0m   Install git hooks from scripts/hooks/"
	@echo "  \033[36mroute-map\033[0m       Print ROUTE_MAP JSON from config/models.py for copy-paste"
	@echo "  \033[36mclean\033[0m           Remove caches"
	@echo ""
	@echo "\033[2mInference (GitHub Actions)\033[0m"
	@echo "  \033[36minference\033[0m       Run MODEL=<name> [HOURS=5]"
	@echo "  \033[36mbuild-images\033[0m    Build Docker images [MODELS=all|<inference-dir,...>] [NO_CACHE=false]"
	@echo "  \033[36mdown\033[0m            Cancel all in-progress workflow runs"
	@echo ""
	@echo "\033[2mTunnels\033[0m"
	@echo "  \033[36mtunnels-secret\033[0m  Collect tokens and set TUNNELS_JSON secret"
	@echo ""

build:
	cd app/chat/frontend && npm install && npm run fetch-models && npm run build

lint:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff check app scripts config

lint-web:
	cd app/chat/frontend && npm run lint

knip:
	cd app/chat/frontend && npm run knip

format:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff format app scripts config

update-models:
	python3 scripts/update_github_models.py

sync-worker-config:
	python3 scripts/sync_worker_config.py

sync-workflow-choices:
	python3 scripts/sync_workflow_choices.py

install-hooks:
	@for hook in scripts/hooks/*; do \
		name=$$(basename $$hook); \
		ln -sf ../../$$hook .git/hooks/$$name; \
		echo "Installed .git/hooks/$$name"; \
	done

route-map:
	python3 config/models.py --route-map

clean:
	rm -rf __pycache__ .pytest_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

_purge-inference-history:
	@gh run list --workflow inference.yml --limit 100 --json databaseId,status \
		--jq '.[] | select(.status != "in_progress") | .databaseId' | \
		while read -r id; do \
			gh run delete $$id; \
		done

inference: _purge-inference-history
	@[ -n "$(MODEL)" ] || { echo "Usage: make inference MODEL=<name>"; exit 1; }
	gh workflow run inference.yml -f model=$(MODEL)

deploy:
	gh workflow run deploy.yml

build-images:
	gh workflow run build-push-images.yml -f models=$(or $(MODELS),all) -f no_cache=$(or $(NO_CACHE),false)

down:
	@gh run list --status in_progress --json databaseId,displayTitle --jq '.[] | "\(.databaseId) \(.displayTitle)"' | \
		while read -r id name; do \
			printf "\033[33mCancelling: $$name\033[0m\n"; \
			gh run cancel $$id; \
		done

tunnels-secret:
	python3 scripts/tunnels_secret.py
