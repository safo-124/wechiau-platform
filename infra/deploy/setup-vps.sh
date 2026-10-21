#!/usr/bin/env bash
# One-time setup of Wechiau on the VPS. Safe to run again.
#
#   sudo bash infra/deploy/setup-vps.sh wechiau.135.181.93.156.nip.io
#
# What it does, leaving everything else on the server alone:
#   - a system user `wechiau` that runs the API (it can't log in)
#   - folders: /opt/wechiau (code), /var/lib/wechiau (uploads), /var/backups/wechiau
#   - a PostgreSQL login and database for Wechiau only, with a random password
#     kept in /etc/wechiau/wechiau.env (readable by root and the service only)
#   - the systemd service (API on 127.0.0.1:3100) and the nightly backup timer
#   - a Wechiau site block in /etc/caddy/Caddyfile. The old file is backed up
#     first, the new one is checked by Caddy before reloading, and the other
#     sites in it are not changed.
set -euo pipefail

SITE="${1:-}"
PORT=3100
APP_USER=wechiau
DB_ROLE=wechiau
DB_NAME=wechiau_prod
ENV_FILE=/etc/wechiau/wechiau.env
CADDYFILE=/etc/caddy/Caddyfile
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd / # so `sudo -u postgres` and `sudo -u caddy` don't complain about the current folder

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

[[ $EUID -eq 0 ]] || fail "Run this with sudo."
[[ -n "$SITE" ]] || fail "Give the address, for example: sudo bash setup-vps.sh wechiau.135.181.93.156.nip.io"
[[ "$SITE" =~ ^[a-z0-9.-]+$ ]] || fail "\"$SITE\" doesn't look like a host name (lowercase letters, digits, dots and dashes only)."

step "Checking what's installed"
NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || fail "Node.js isn't installed for all users (not on root's PATH)."
NODE_REAL="$(readlink -f "$NODE_BIN")"
case "$NODE_REAL" in
  /home/* | /root/*) fail "Node.js is at $NODE_REAL, inside a home folder the service can't use. Install Node.js 22.12 or newer system-wide." ;;
esac
"$NODE_BIN" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' ||
  fail "Node.js $("$NODE_BIN" --version) is too old; Wechiau needs 22.12 or newer."
command -v npm >/dev/null || fail "npm isn't installed."
command -v psql >/dev/null || fail "PostgreSQL client (psql) isn't installed."
command -v pg_dump >/dev/null || fail "pg_dump isn't installed (needed for backups)."
command -v caddy >/dev/null || fail "Caddy isn't installed."
systemctl is-active --quiet postgresql || fail "PostgreSQL isn't running."
systemctl is-active --quiet caddy || fail "Caddy isn't running."
echo "Node.js $("$NODE_BIN" --version) at $NODE_REAL, $(psql --version), Caddy $(caddy version | cut -d' ' -f1)"

if ss -tln | grep -q "127.0.0.1:$PORT " && ! systemctl is-active --quiet wechiau-api; then
  fail "Port $PORT is already used by another program. Pick another port in this script and in $ENV_FILE."
fi

step "Service user and folders"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/wechiau --shell /usr/sbin/nologin "$APP_USER"
  echo "Created system user $APP_USER"
fi
install -d -m 0755 -o root -g root /opt/wechiau /opt/wechiau/releases
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" /var/lib/wechiau /var/lib/wechiau/uploads /var/lib/wechiau/npm-cache
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" /var/backups/wechiau
install -d -m 0750 -o root -g "$APP_USER" /etc/wechiau
echo "$SITE" > /etc/wechiau/site
echo "/opt/wechiau, /var/lib/wechiau, /var/backups/wechiau, /etc/wechiau"

step "Database"
if [[ -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE already exists: keeping the database login it has."
else
  DB_PASSWORD="$(openssl rand -hex 24)"
  # The password goes in on standard input, so it never shows in the process list.
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d postgres <<SQL
\set role $DB_ROLE
\set db $DB_NAME
\set pw $DB_PASSWORD
SELECT format('CREATE ROLE %I LOGIN', :'role') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'role', :'pw') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL
  (umask 077 && cat > "$ENV_FILE") <<ENV
# Wechiau API settings, read by the wechiau-api and wechiau-backup services.
# Written by setup-vps.sh. Keep this file private: it holds the database password.
NODE_ENV=production
DATABASE_URL=postgresql://$DB_ROLE:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME?schema=public
PORT=$PORT
HOST=127.0.0.1
UPLOADS_DIR=/var/lib/wechiau/uploads
COOKIE_SECURE=true
CHECKPOINT_DISABLE=1
ENV
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  unset DB_PASSWORD
  echo "Database $DB_NAME and login $DB_ROLE are ready. Password saved in $ENV_FILE."
fi

step "Services"
sed "s#@NODE@#$NODE_REAL#g" "$HERE/wechiau-api.service" > /etc/systemd/system/wechiau-api.service
install -m 0644 "$HERE/wechiau-backup.service" /etc/systemd/system/wechiau-backup.service
install -m 0644 "$HERE/wechiau-backup.timer" /etc/systemd/system/wechiau-backup.timer
systemctl daemon-reload
systemctl enable --quiet wechiau-api.service
systemctl enable --quiet --now wechiau-backup.timer
echo "wechiau-api (starts with the first deploy) and the nightly backup at 02:30 UTC"

step "Caddy site for https://$SITE"
NEW="$(mktemp)"
# Everything except an earlier Wechiau block, then the current block.
awk '/^# BEGIN wechiau/ { skip = 1 } !skip { print } /^# END wechiau/ { skip = 0 }' "$CADDYFILE" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$NEW"
printf '\n' >> "$NEW"
sed -e "s#@SITE@#$SITE#g" -e "s#@PORT@#$PORT#g" "$HERE/Caddyfile.wechiau" >> "$NEW"
chmod 0644 "$NEW"
if cmp -s "$NEW" "$CADDYFILE"; then
  echo "Caddyfile already up to date."
else
  # Checked as the caddy user, so the check can't create log files Caddy can't write later.
  if ! sudo -u caddy env HOME=/var/lib/caddy caddy validate --adapter caddyfile --config "$NEW" >/tmp/wechiau-caddy-check.log 2>&1; then
    cat /tmp/wechiau-caddy-check.log >&2
    rm -f "$NEW"
    fail "Caddy didn't accept the new config. Nothing was changed; the other sites keep running."
  fi
  BACKUP="$CADDYFILE.bak-before-wechiau-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CADDYFILE" "$BACKUP"
  cat "$NEW" > "$CADDYFILE" # keeps the file's owner and permissions
  if ! systemctl reload caddy; then
    cat "$BACKUP" > "$CADDYFILE"
    systemctl reload caddy || true
    fail "Caddy couldn't reload, so the old Caddyfile was put back."
  fi
  echo "Added the Wechiau site. Previous Caddyfile saved as $BACKUP"
fi
rm -f "$NEW" /tmp/wechiau-caddy-check.log

echo
echo "Setup done. Next: sudo bash infra/deploy/deploy.sh (from the unpacked release)."
