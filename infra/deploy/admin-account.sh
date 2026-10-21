#!/usr/bin/env bash
# Creates the first admin, or resets an admin's password, on the VPS:
#
#   sudo bash /opt/wechiau/current/infra/deploy/admin-account.sh --name "Gloria Gyimaa" --phone 024XXXXXXX --email gloria@example.com
#   sudo bash /opt/wechiau/current/infra/deploy/admin-account.sh --email gloria@example.com     (reset a password)
#
# It asks for the password and doesn't show it as you type.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "ERROR: Run this with sudo." >&2; exit 1; }
[[ -e /opt/wechiau/current ]] || { echo "ERROR: Deploy a release first." >&2; exit 1; }
cd /

exec systemd-run --quiet --wait --pty --collect --uid=wechiau --gid=wechiau \
  -p EnvironmentFile=/etc/wechiau/wechiau.env -p WorkingDirectory=/opt/wechiau/current/apps/server \
  "$(readlink -f "$(command -v node)")" dist/cli/admin-account.js "$@"
