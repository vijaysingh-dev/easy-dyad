FROM node:22-alpine

# pnpm 10 matches the deployed image tag (22-pnpm10); pnpm 11+ fails installs on unapproved build scripts
RUN npm install -g pnpm@10

WORKDIR /workspace

# Global, persistent, writable locations (mounted in Docker, EFS in ECS)
ENV XDG_CACHE_HOME=/workspace/.cache
ENV PNPM_STORE_PATH=/workspace/.pnpm-store
ENV NPM_CONFIG_CACHE=/workspace/.npm-cache
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# docker build -t easy-dyad/node-runtime:22 path/to/node-runtime
