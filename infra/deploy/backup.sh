#!/usr/bin/env bash
# Copies the database and the uploaded photos to /var/backups/wechiau, keeping
# 14 days. Run by wechiau-backup.timer every night, and by deploy.sh before
# database changes. These copies are on the same disk as the server: also copy
# them somewhere else (see infra/deploy/README.md).
set -euo pipefail

DEST=/var/backups/wechiau
STAMP="$(date -u +%Y%m%d-%H%M%S)"

# The connection details go to pg_dump as PG* variables, so the password
# never appears in the process list.
re='^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+)'
[[ "${DATABASE_URL:-}" =~ $re ]] || { echo "DATABASE_URL is missing or not a postgresql:// address." >&2; exit 1; }
export PGUSER="${BASH_REMATCH[2]}" PGPASSWORD="${BASH_REMATCH[3]}" PGHOST="${BASH_REMATCH[4]}" PGPORT="${BASH_REMATCH[5]:-5432}" PGDATABASE="${BASH_REMATCH[6]}"

pg_dump --format=custom --no-owner --file="$DEST/db-$STAMP.dump"
tar -C /var/lib/wechiau -czf "$DEST/uploads-$STAMP.tar.gz" uploads
find "$DEST" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete

echo "Backed up to $DEST: db-$STAMP.dump ($(du -h "$DEST/db-$STAMP.dump" | cut -f1)), uploads-$STAMP.tar.gz ($(du -h "$DEST/uploads-$STAMP.tar.gz" | cut -f1))"
