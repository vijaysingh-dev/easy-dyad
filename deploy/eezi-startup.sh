#!/bin/bash
set -euo pipefail
trap 'echo "[ERROR] Line $LINENO: \"$BASH_COMMAND\" failed with exit code $?" >&2' ERR

echo "----- EEZI Startup Script Running -----"

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
      exit 1 ;;
  esac
done

# Create fresh backend build (optional)
cd /var/www/eezi/server
if $BUILD_SERVER; then
  rm -rf dist/
  echo "Building backend..."
  npm install
  npm run build
  echo "Backend build done."
fi

# Detect public IP
PUBLIC_IP=$(curl -s https://ipv4.icanhazip.com | tr -d '\n')
echo "Detected Public IP: $PUBLIC_IP"

# Ensure keys exist, then update them
grep -q '^PUBLIC_IP=' .env || echo "PUBLIC_IP=" >> .env
grep -q '^ALLOWED_ORIGINS=' .env || echo "ALLOWED_ORIGINS=" >> .env

sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${PUBLIC_IP}|" .env
sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://dev.eezi.ai,http://${PUBLIC_IP}|" .env

# Start the backend with pm2
if pm2 list | grep -q eezi-backend; then
  pm2 restart eezi-backend --update-env
else
  pm2 start dist/index.js --name eezi-backend
  pm2 save
fi

# Create fresh frontend build (optional)
cd /var/www/eezi/web
if $BUILD_WEB; then
  rm -rf dist/
  echo "Building frontend..."
  npm install
  npm run build
  aws s3 sync dist/ s3://dev-eezi-web --delete
  echo "Frontend deployed to S3."
fi

echo "----- EEZI Startup Script Completed -----"
