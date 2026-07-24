# mark.tildom

mark.tildom is the Tildom bookmark and note manager. It is a Solid/Vite app that stores entries locally in browser SQLite via OPFS.

The app is served as static files. Bookmark metadata and AI tagging are provided by
`services/api` at `/v1/mark/*`. Bookmark data itself remains local-first in the browser.

AI bookmark tagging uses the API service's `GOOGLE_API_KEY`. Offline state, rate limits, and AI
failures do not block saving; tags simply are not applied.

## Developing

From the repository root:

```bash
pnpm install
pnpm dev:api
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

Preview the static production build locally:

```bash
pnpm build
pnpm preview
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
- `dist/` and generated service-worker assets are build outputs.
- See the root [PROJECT.md](../../PROJECT.md) for the long-term sync and deployment plan.
