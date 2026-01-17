#!/usr/bin/env bash
set -euo pipefail

# Install EEZI deployment files into system locations:
# - /etc/nginx/conf.d/eezi.conf
# - /etc/systemd/system/eezi-startup.service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"

NGINX_SRC="$DEPLOY_DIR/eezi.conf"
SERVICE_SRC="$DEPLOY_DIR/eezi-startup.service"

NGINX_DEST="/etc/nginx/conf.d/eezi.conf"
SERVICE_DEST="/etc/systemd/system/eezi-startup.service"

if [ "$EUID" -ne 0 ]; then
echo "This script must be run as root (use sudo)."
exit 1
fi

copy_file_with_backup() {
src="$1"
dest="$2"
mode="${3:-0644}"

if [ ! -f "$src" ]; then
    echo "Source file '$src' not found — skipping $dest."
    return 0
fi

if [ -f "$dest" ]; then
    if cmp -s "$src" "$dest"; then
    echo "'$dest' already up-to-date."
    return 0
    fi

    backup="${dest}.bak"
    echo "Backing up existing '$dest' to '$backup'"
    cp -p "$dest" "$backup"
fi

install -m "$mode" "$src" "$dest"
echo "Installed '$dest'"
}

echo "Installing EEZI deployment files from '$DEPLOY_DIR'"

mkdir -p /etc/nginx/conf.d /etc/systemd/system

# ---- Nginx config ----
copy_file_with_backup "$NGINX_SRC" "$NGINX_DEST" 0644

# ---- Systemd service ----
copy_file_with_backup "$SERVICE_SRC" "$SERVICE_DEST" 0644

echo "Reloading systemd & enabling service (won't start immediately)"
systemctl daemon-reload
systemctl enable eezi-startup.service

echo "EEZI deployment install complete."
exit 0
