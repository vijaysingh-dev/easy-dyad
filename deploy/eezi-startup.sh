#!/bin/bash

set -euo pipefail

echo "----- EEZI Startup Script Running -----"

# Detect public IP
PUBLIC_IP=$(curl -s https://ipv4.icanhazip.com)
echo "Detected Public IP: $PUBLIC_IP"

cd /var/www/eezi/server || exit 1

# Create fresh backend build (optional)
if [[ "${1:-}" == "--build" ]]; then
    rm -rf dist/
    echo "Building project..."
    npm install
    npm run build
    echo "Build completed."
fi

# Update ONLY these variables in your .env (backend needs them)
sudo sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${PUBLIC_IP}|" .env
sudo sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=localhost,127.0.0.1,http://${PUBLIC_IP}|" .env

# Start the backend with pm2
pm2 list | grep eezi-backend
if [ $? != 0 ]; then
  pm2 start dist/index.js --name eezi-backend
  pm2 save
else
  pm2 restart eezi-backend --update-env
fi

cd /var/www/eezi/web || exit 1

if [[ "${1:-}" == "--build" ]]; then
    rm -rf dist/
    echo "Building frontend..."
    npm install
    npm run build
    mkdir -p /var/www/eezi-frontend/
    cp -r dist/* /var/www/eezi-frontend/
    echo "Frontend build completed."
fi

# Reload nginx (config already exists)
sudo nginx -t && sudo systemctl reload nginx

echo "----- EEZI Startup Script Completed -----"
