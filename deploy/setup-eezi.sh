#!/usr/bin/env bash
set -euo pipefail

# Install EEZI deployment files into system locations:
# - /etc/nginx/sites-available/eezi.conf
# - /usr/local/bin/eezi-startup.sh
# - /etc/systemd/system/eezi-startup.service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"

NGINX_SRC="$DEPLOY_DIR/eezi.conf"
STARTUP_SRC="$DEPLOY_DIR/eezi-startup.sh"
SERVICE_SRC="$DEPLOY_DIR/eezi-startup.service"

NGINX_DEST="/etc/nginx/sites-available/eezi.conf"
NGINX_LINK="/etc/nginx/sites-enabled/eezi.conf"
STARTUP_DEST="/usr/local/bin/eezi-startup.sh"
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
		if [ -e "$backup" ]; then
			echo "Removing previous backup '$backup'"
			rm -f "$backup"
		fi
		echo "Backing up existing '$dest' to '$backup'"
		cp -p "$dest" "$backup"
	fi

	install -m "$mode" "$src" "$dest"
	echo "Installed '$dest'"
}

echo "Installing EEZI deployment files from '$DEPLOY_DIR'"

# Ensure target directories exist
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /usr/local/bin /etc/systemd/system

# Install nginx config
copy_file_with_backup "$NGINX_SRC" "$NGINX_DEST" 0644

# Create/replace symlink in sites-enabled pointing to our config
if [ -L "$NGINX_LINK" ] || [ -e "$NGINX_LINK" ]; then
	# if it's already the correct symlink, do nothing
	if [ -L "$NGINX_LINK" ] && [ "$(readlink -f "$NGINX_LINK")" = "$NGINX_DEST" ]; then
		echo "Nginx site link '$NGINX_LINK' already correct."
	else
		echo "Removing existing '$NGINX_LINK'"
		rm -f "$NGINX_LINK"
		ln -s "$NGINX_DEST" "$NGINX_LINK"
		echo "Created symlink '$NGINX_LINK' -> '$NGINX_DEST'"
	fi
else
	ln -s "$NGINX_DEST" "$NGINX_LINK"
	echo "Created symlink '$NGINX_LINK' -> '$NGINX_DEST'"
fi

# Remove default site if present
if [ -e /etc/nginx/sites-enabled/default ] || [ -L /etc/nginx/sites-enabled/default ]; then
	echo "Removing default nginx site '/etc/nginx/sites-enabled/default'"
	rm -f /etc/nginx/sites-enabled/default
fi

# Install startup script
copy_file_with_backup "$STARTUP_SRC" "$STARTUP_DEST" 0755
chmod 0755 "$STARTUP_DEST" || true

# Install systemd service
copy_file_with_backup "$SERVICE_SRC" "$SERVICE_DEST" 0644


echo "Reloading systemd daemon and enabling service for boot (will not start now)"
systemctl daemon-reload || true
if systemctl enable eezi-startup.service >/dev/null 2>&1; then
	echo "Service 'eezi-startup.service' enabled to start at boot."
else
	echo "Could not enable 'eezi-startup.service' (systemd may not be present or permission denied)."
fi

echo "EEZI deployment files processed."
exit 0
