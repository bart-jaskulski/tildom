# mark.tildom

mark.tildom is the Tildom bookmark and note manager. It is a Solid/Vite app that stores entries locally in browser SQLite via OPFS.

The app has a small Node/Hono server for network-required helpers, currently bookmark metadata fetching. Bookmark data itself remains local-first in the browser.

## Developing

From the repository root:

```bash
pnpm install
pnpm dev:mark
```

Or from this app directory:

```bash
pnpm dev
```

The Vite dev server defaults to `http://localhost:5173`.

For local HTTPS, place `localhost-key.pem` and `localhost.pem` in this app directory. The app can still typecheck, test, and build without those files.

## Verification

From the repository root:

```bash
pnpm typecheck:mark
pnpm test:mark
pnpm build:mark
```

From this app directory:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Run the production server locally:

```bash
pnpm start
```

## Docker

From the repository root:

```bash
docker compose up --build
```

The app listens on port `3000` inside the container and is exposed as `http://localhost:3000` by default. To change the host port:

```bash
APP_PORT=8080 docker compose up --build
```

## Notes

- Local data lives in browser storage, not in the Docker container.
- `dist/`, `server-dist/`, and generated `public/sw.js` are build outputs.
- See the root [PROJECT.md](../../PROJECT.md) for the long-term sync and deployment plan.
