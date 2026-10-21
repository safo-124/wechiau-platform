#!/usr/bin/env bash
# Installs a release on the VPS and switches to it. From the unpacked release:
#
#   tar -xzf wechiau-YYYYMMDD-HHMM.tar.gz
#   sudo bash wechiau-YYYYMMDD-HHMM/infra/deploy/deploy.sh
#
# Steps: copy to /opt/wechiau/releases, install packages, back up the
# database, apply database changes, switch /opt/wechiau/current, restart,
# and check the health endpoint. If the new version doesn't come up, it goes
# back to the previous release. (Database changes are not undone; they are
# written so the previous release still works with them.)
set -euo pipefail

APP_USER=wechiau
ENV_FILE=/etc/wechiau/wechiau.env
RELEASES=/opt/wechiau/releases
CURRENT=/opt/wechiau/current
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/../.." && pwd)"
NAME="$(basename "$SRC")"
DEST="$RELEASES/$NAME"
cd /

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[[ $EUID -eq 0 ]] || fail "Run this with sudo."
[[ -f "$SRC/RELEASE.json" ]] || fail "Run the deploy.sh inside an unpacked release (wechiau-.../infra/deploy/deploy.sh)."
[[ -f "$ENV_FILE" ]] || fail "Run setup-vps.sh first."
NODE_BIN="$(readlink -f "$(command -v node)")"
PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE")"
SITE="$(cat /etc/wechiau/site 2>/dev/null || true)"
PREVIOUS=""
[[ -L "$CURRENT" ]] && PREVIOUS="$(readlink -f "$CURRENT")"

[[ "$PREVIOUS" != "$DEST" ]] || fail "$NAME is already the running release."

step "Copying $NAME"
rm -rf "$DEST"
cp -a "$SRC" "$DEST"
chown -R "$APP_USER:$APP_USER" "$DEST"

step "Installing packages (takes a few minutes)"
runuser -u "$APP_USER" -- env HOME=/var/lib/wechiau npm_config_cache=/var/lib/wechiau/npm-cache \
  bash -c "cd '$DEST' && npm ci --omit=dev -w @wechiau/server --no-audit --no-fund --loglevel=error"
# The running service can read its code but not change it.
chown -R root:root "$DEST"

# Runs a command the way the service runs: as the wechiau user, with its settings.
as_service() {
  systemd-run --quiet --wait --pipe --collect --uid="$APP_USER" --gid="$APP_USER" \
    -p EnvironmentFile="$ENV_FILE" -p WorkingDirectory="$DEST/apps/server" "$@"
}

if [[ -n "$PREVIOUS" ]]; then
  step "Backing up the database before changing it"
  systemctl start wechiau-backup.service
  journalctl -u wechiau-backup.service --since "-5min" --no-pager -o cat | grep 'Backed up to' | tail -n 1 || true
fi

step "Applying database changes"
as_service "$NODE_BIN" "$DEST/node_modules/prisma/build/index.js" migrate deploy

step "Switching to $NAME"
ln -sfn "$DEST" "$CURRENT.new"
mv -Tf "$CURRENT.new" "$CURRENT"
systemctl restart wechiau-api

healthy=""
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then healthy=yes; break; fi
  sleep 1
done
if [[ -z "$healthy" ]]; then
  echo "The new version didn't start. Its last log lines:" >&2
  journalctl -u wechiau-api -n 40 --no-pager >&2 || true
  if [[ -n "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT.new"
    mv -Tf "$CURRENT.new" "$CURRENT"
    systemctl restart wechiau-api
    fail "Went back to $(basename "$PREVIOUS")."
  fi
  fail "Fix the problem above and deploy again."
fi
curl -fsS "http://127.0.0.1:$PORT/api/health"
echo

step "Cleaning up"
# Keep the running release and the one before it, for going back.
for old in "$RELEASES"/*; do
  [[ "$old" == "$DEST" || "$old" == "$PREVIOUS" ]] && continue
  rm -rf "$old" && echo "Removed $(basename "$old")"
done

echo
echo "Deployed $NAME."
if [[ -n "$SITE" ]]; then
  if curl -fsS --max-time 20 "https://$SITE/api/health" >/dev/null 2>&1; then
    echo "Online at https://$SITE"
  else
    echo "https://$SITE isn't answering yet. On the first deploy Caddy may still be getting its certificate; try again in a minute."
  fi
fi
echo "You can delete ~/$NAME and ~/$NAME.tar.gz now."
