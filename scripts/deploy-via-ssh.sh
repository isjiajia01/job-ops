#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_ALIAS="${HOST_ALIAS:-oracle}"
REMOTE_DIR="${REMOTE_DIR:-/opt/job-ops}"
SERVICE="${SERVICE:-job-ops}"
IMAGE_TAG="${1:-latest}"
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-isjiajia01}"
GIT_SHA="${GIT_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
DEPLOYED_AT="${DEPLOYED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [[ "$IMAGE_TAG" == "latest" ]]; then
  APP_VERSION="${APP_VERSION:-latest}"
else
  APP_VERSION="${APP_VERSION:-${IMAGE_TAG#v}}"
fi

JOBOPS_IMAGE="ghcr.io/${GITHUB_REPOSITORY_OWNER}/job-ops:${IMAGE_TAG}"

REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd "$REMOTE_DIR"
touch .env
cp .env .env.tmp
grep -vE '^(JOBOPS_IMAGE|APP_VERSION|GIT_SHA|IMAGE_TAG|DEPLOYED_AT)=' .env.tmp > .env || true
printf 'JOBOPS_IMAGE=%s\n' "$JOBOPS_IMAGE" >> .env
printf 'APP_VERSION=%s\n' "$APP_VERSION" >> .env
printf 'GIT_SHA=%s\n' "$GIT_SHA" >> .env
printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG" >> .env
printf 'DEPLOYED_AT=%s\n' "$DEPLOYED_AT" >> .env
rm -f .env.tmp
echo "Deploying image: $JOBOPS_IMAGE"
echo "App version: $APP_VERSION"
echo "Git SHA: $GIT_SHA"
docker compose pull "$SERVICE"
docker compose up -d "$SERVICE"
docker compose ps
EOF
)

echo "Deploying to ${HOST_ALIAS}:${REMOTE_DIR}"
echo "Service: ${SERVICE}"
echo "Image: ${JOBOPS_IMAGE}"

ssh "$HOST_ALIAS" "$REMOTE_SCRIPT"
