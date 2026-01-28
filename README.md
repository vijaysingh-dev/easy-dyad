# easy-dyad

easy-dyad is a fork of [Dyad](https://github.com/dyad-sh/dyad) that runs as a hosted web app (React web client + Express server) instead of a local-only desktop app.

## Running as web + server

This repo can run as a standalone React web app with a separate Express TypeScript server.

### Server

```
cd server
pnpm i
pnpm dev
```

The server starts on `http://localhost:4000`.

### Web

```
pnpm i
pnpm dev
```

### Health check

```
curl http://localhost:4000/health
```

## Migrating from Electron IPC to HTTP

- Replace uses of `IpcClient` with a transport abstraction that calls `fetch` to the server.
- Port IPC handler logic under `src/ipc/handlers/*` to Express routes under `server/src/routes/*` incrementally.
- Keep types in shared modules so both web and server can import.

## License

Apache 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Based on Dyad, Copyright 2025 Dyad Tech, Inc.
