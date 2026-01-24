FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY eezi-component-selector-client.js .
COPY eezi-shim.js .
COPY proxy_server.mjs .

ENV PROXY_PORT=8080
EXPOSE 8080

CMD ["node", "proxy_server.mjs"]

# docker build -t eezi/eezi-proxy:latest path/to/eezi-proxy
