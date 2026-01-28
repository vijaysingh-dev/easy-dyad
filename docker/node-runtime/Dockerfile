FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Global, persistent, writable locations (mounted in Docker, EFS in ECS)
ENV XDG_CACHE_HOME=/workspace/.cache
ENV COREPACK_HOME=/workspace/.cache/corepack
ENV PNPM_STORE_PATH=/workspace/.pnpm-store
ENV NPM_CONFIG_CACHE=/workspace/.npm-cache
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# docker build -t easy-dyad/node-runtime:22 path/to/node-runtime
