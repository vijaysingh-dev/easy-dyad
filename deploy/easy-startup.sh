#!/bin/bash
set -euo pipefail
trap 'echo "[ERROR] Line $LINENO: \"$BASH_COMMAND\" failed with exit code $?" >&2' ERR

echo "Waiting for Redis to be ready on 127.0.0.1:6379..."
for i in {1..60}; do
  if bash -c "echo > /dev/tcp/127.0.0.1/6379" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! bash -c "echo > /dev/tcp/127.0.0.1/6379" 2>/dev/null; then
  echo "Redis did not start in time" >&2
  exit 1
fi

echo "Redis is up. Starting Easy Dyad services..."

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
cd /var/www/easy-dyad/server
if $BUILD_SERVER; then
  rm -rf dist/
  echo "Building backend..."
  npm install
  npx drizzle-kit generate
  npm run build
  echo "Backend build done."
fi

# Start the backend with pm2
if pm2 list | grep -q easy-backend; then
  pm2 restart easy-backend --update-env
else
  pm2 start dist/index.js --name easy-backend
  pm2 save
fi

# Create fresh frontend build (optional)
cd /var/www/easy-dyad/web
if $BUILD_WEB; then
  rm -rf dist/
  echo "Building frontend..."
  npm install
  npm run build
  aws s3 sync dist/ s3://dev-easy-web --delete
  echo "Frontend deployed to S3."
fi

echo "----- Easy Dyad Startup Script Completed -----"
