FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY easy-component-selector-client.js .
COPY easy-shim.js .
COPY proxy_server.mjs .

ENV PROXY_PORT=8080
EXPOSE 8080

CMD ["node", "proxy_server.mjs"]

# docker build -t easy-dyad/easy-proxy:latest path/to/easy-proxy
