#!/bin/bash

set -euo pipefail
trap 'echo "[ERROR] Line $LINENO: \"$BASH_COMMAND\" failed with exit code $?" >&2' ERR

echo "----- EEZI Startup Script Running -----"

# Detect public IP
PUBLIC_IP=$(curl -s https://ipv4.icanhazip.com)
echo "Detected Public IP: $PUBLIC_IP"

# Parse args: accept --build-server and/or --build-web in any order
BUILD_SERVER=false
BUILD_WEB=false

for arg in "$@"; do
  case "$arg" in
    --build-server) BUILD_SERVER=true ;;
    --build-web)    BUILD_WEB=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--build-server] [--build-web]"
      exit 1
      ;;
  esac
done

cd /var/www/eezi/server || exit 1

# Create fresh backend build (optional)
if $BUILD_SERVER; then
    rm -rf dist/
    echo "Building project..."
    npm install
    npm run build
    echo "Build completed."
fi

# Update ONLY these variables in .env
sudo sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${PUBLIC_IP}|" .env
sudo sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=localhost,127.0.0.1,http://${PUBLIC_IP}|" .env

# Start the backend with pm2
if pm2 list | grep -q eezi-backend; then
    pm2 restart eezi-backend --update-env
else
    pm2 start dist/index.js --name eezi-backend
    pm2 save
fi

cd /var/www/eezi/web || exit 1

if $BUILD_WEB; then
    rm -rf dist/
    echo "Building frontend..."
    npm install
    npm run build
    mkdir -p /var/www/eezi-frontend/
    cp -r dist/* /var/www/eezi-frontend/
    echo "Frontend build completed."
fi

# Reload nginx (config already exists)
sudo nginx -t
sudo systemctl reload nginx

echo "----- EEZI Startup Script Completed -----"
