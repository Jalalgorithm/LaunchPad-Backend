#!/usr/bin/env bash
# Update the backend on the IONOS VPS to the latest code on main.
#
# Run two ways, identical in effect:
#   - automatically, by .github/workflows/deploy-production.yml on every push
#     to main (piped over SSH, so the copy that runs is the one being shipped);
#   - by hand on the server:  igms update
#
# Steps: fetch → database backup → install → build → migrate → restart →
# health check. If the build or the health check fails, the previous code is
# put back and restarted, so a bad push never leaves the API down.
#
# Database migrations cannot be undone automatically. That is why a backup is
# taken first: if a migration itself is the problem, restore it with
#   gunzip -c ~/backups/pre-deploy-<time>.sql.gz | mysql igms
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/igms-api}"
APP_NAME="${APP_NAME:-igms-api}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/health}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; }

healthy() {
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 3 "$HEALTH_URL" | grep -q '"success":true'; then return 0; fi
    sleep 1
  done
  return 1
}

build_and_restart() {
  npm ci --include=dev --no-audit --no-fund
  npm run build
  pm2 restart "$APP_NAME" --update-env
}

cd "$APP_DIR"
[ -f .env ] || { fail "$APP_DIR/.env is missing; refusing to deploy."; exit 1; }
[ -f "$HOME/.my.cnf" ] || { fail "~/.my.cnf is missing, so the pre-deploy database backup cannot run. See Step 10 of deploy/vps-setup.md."; exit 1; }

previous="$(git rev-parse HEAD)"
log "Current version: $(git log -1 --format='%h %s')"

log "Fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
target="$(git rev-parse "origin/$BRANCH")"
if [ "$target" = "$previous" ] && [ "${FORCE:-0}" != 1 ]; then
  log "Already up to date. (FORCE=1 to rebuild anyway.)"
  exit 0
fi
# The server never holds hand edits to tracked files, so a hard reset is the
# safe way to match GitHub exactly. .env and backups are git-ignored and kept.
git reset --hard --quiet "$target"
log "New version: $(git log -1 --format='%h %s')"

log "Backing up the database"
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
mysqldump --single-transaction --no-tablespaces igms | gzip > "$BACKUP_DIR/pre-deploy-$stamp.sql.gz"
# Keep the 10 most recent pre-deploy backups.
ls -1t "$BACKUP_DIR"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f

rollback() {
  fail "$1 — putting back $(git log -1 --format='%h' "$previous")"
  git reset --hard --quiet "$previous"
  build_and_restart || true
  if healthy; then
    fail "Rolled back. The API is running the previous version."
  else
    fail "Rollback did not come up healthy either. Check: pm2 logs $APP_NAME"
  fi
  exit 1
}

log "Installing and building"
npm ci --include=dev --no-audit --no-fund || rollback "npm install failed"
npm run build || rollback "Build failed"

log "Running migrations"
npm run db:migrate || rollback "Migration failed (restore $BACKUP_DIR/pre-deploy-$stamp.sql.gz if it half-applied)"

log "Restarting $APP_NAME"
pm2 restart "$APP_NAME" --update-env

log "Checking health"
healthy || rollback "Health check failed"

pm2 save >/dev/null
log "Deployed $(git log -1 --format='%h %s')"
