#!/bin/bash
# =============================================================
# setup-repos.sh — Clonar todos los repos de Katrix-soft en el VPS
# Ejecutar UNA VEZ en el VPS antes de levantar el stack Docker
# =============================================================

set -e

REPOS_DIR="/home/katrix/repos"
ORG="Katrix-soft"
REPOS=(
    "landingdj"
    "metrics-docker"
    "erp-eana"
    "landing-k"
    "Landing-Katrix-16-07"
    "Login-Dashboard"
)

echo "📁 Creando directorio base: $REPOS_DIR"
mkdir -p "$REPOS_DIR"

for REPO in "${REPOS[@]}"; do
    REPO_PATH="$REPOS_DIR/$REPO"
    REPO_URL="https://github.com/$ORG/$REPO.git"

    if [ -d "$REPO_PATH/.git" ]; then
        echo "🔄 [$REPO] Ya existe — haciendo pull..."
        cd "$REPO_PATH"
        git fetch --all
        BRANCH=$(git rev-parse --abbrev-ref HEAD)
        git pull origin "$BRANCH"
        cd -
    else
        echo "⬇️  [$REPO] Clonando desde $REPO_URL..."
        git clone "$REPO_URL" "$REPO_PATH"
    fi

    echo "✅ [$REPO] OK — path: $REPO_PATH"
done

echo ""
echo "============================================="
echo "✅ Todos los repos listos en: $REPOS_DIR"
echo "Ahora podés levantar el stack:"
echo "  docker compose up -d --build"
echo "============================================="
