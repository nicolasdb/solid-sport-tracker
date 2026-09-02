# solid-sport-tracker — cibles de commodité.
# Seules les commandes longues, multi-étapes ou faciles à oublier vivent ici.
#
# Le build est produit LOCALEMENT et seul dist/ part sur le VPS : rien n'est
# compilé là-bas, donc pas de toolchain node à y maintenir.

REMOTE      := hetzner
REMOTE_PATH := /home/nicolas/solid-sport-tracker

# Ce qui constitue un déploiement : le build, la compose et la config nginx du
# conteneur. Les sources n'ont rien à faire sur le VPS.
DEPLOY_PATHS := dist docker-compose.yml deploy

.DEFAULT_GOAL := help
.PHONY: help dev build check clean vps-diff vps-push vps-deploy vps-logs vps-restart vps-ssh

help: ## Affiche cette aide
	@echo "solid-sport-tracker"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Déploiement : sportr.nicolasdb.eu → conteneur sportr-web (réseau gateway)."
	@echo "Le routage nginx vit dans hetzner-gateway ; voir deploy/gateway-14-sportr.conf."

# ── Local ────────────────────────────────────────────────────────────────────

dev: ## Serveur de dev Vite (--host pour tester depuis un mobile du réseau)
	npm run dev

build: ## Typecheck + build de production dans dist/
	npm run build

# Ne produit aucun fichier : c'est le seul contrôle sûr quand npm tourne dans
# un conteneur qui n'écrit pas avec ton uid (voir CLAUDE.md).
check: ## Typecheck seul, sans produire de build
	npm run check

clean: ## Supprime dist/
	rm -rf dist || podman unshare rm -rf dist

# ── VPS ──────────────────────────────────────────────────────────────────────
# Toutes ces cibles s'exécutent depuis le poste local, via SSH.

vps-diff: ## Montre ce qu'un push changerait sur le VPS, sans rien écrire
	@rsync -avzn --delete $(DEPLOY_PATHS) $(REMOTE):$(REMOTE_PATH)/

vps-push: build ## Build puis rsync dist/ + compose + config nginx vers le VPS
	@ssh $(REMOTE) "mkdir -p $(REMOTE_PATH)"
	rsync -avz --delete $(DEPLOY_PATHS) $(REMOTE):$(REMOTE_PATH)/
	@echo "Poussé vers $(REMOTE):$(REMOTE_PATH)."

vps-deploy: vps-push ## Push puis (re)démarre le conteneur sportr-web
	ssh $(REMOTE) "cd $(REMOTE_PATH) && docker compose up -d"
	@echo "Déployé. Vérifier : curl -sI https://sportr.nicolasdb.eu | head -1"

# dist/ est monté en volume : un nouveau build est servi sans redémarrage.
# Ce restart ne sert qu'après un changement de deploy/nginx-site.conf.
vps-restart: ## Redémarre sportr-web (nécessaire après un changement de conf nginx)
	ssh $(REMOTE) "cd $(REMOTE_PATH) && docker compose restart sportr-web"

vps-logs: ## Suit les logs du conteneur sportr-web
	ssh $(REMOTE) "docker logs sportr-web -f"

vps-ssh: ## Ouvre une session SSH sur le VPS
	ssh $(REMOTE)
