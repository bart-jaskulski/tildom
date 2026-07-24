# Tildom

Tildom is a family of local-first personal web applications. The current apps are:

- `home`: suite portal and trust page.
- `mark`: bookmark and note manager.
- `do`: task manager.
- `kin`: personal relationship manager.
- `hey`: personal conversation app.

Each app is a Solid/Vite application. Product apps store their data locally in browser SQLite/OPFS;
the Home portal has no product data layer.
`services/api` provides the network-required metadata and AI features at `api.tildom.app`;
`services/sync` remains a separate encrypted sync boundary.

For architecture, deployment direction, sync planning, and maintenance rules, read [PROJECT.md](./PROJECT.md).

## Repository Layout

```txt
apps/
  home/
  mark/
  do/
  kin/
packages/
services/
```

`packages/` and `services/` are intentionally light for now. Shared packages should be extracted only after real reuse pressure exists.

## Requirements

- Node.js 22+
- pnpm 11.10+
- Docker, optional for container deployment

## Install

```bash
pnpm install
```

## Development

Run one app at a time from the repository root:

```bash
pnpm dev:home
pnpm dev:mark
pnpm dev:do
pnpm dev:kin
pnpm dev:hey
pnpm dev:api
```

The Vite dev server defaults to `http://localhost:5173`; the feature API defaults to
`http://localhost:8788`. Set `GOOGLE_API_KEY` for AI-backed requests.

## Verification

Run all app checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Run a single app:

```bash
pnpm typecheck:mark
pnpm test:do
pnpm build:kin
```

## Docker

The root Compose file runs Mark, the feature API, and sync by default:

```bash
docker compose up --build
```

Mark is exposed on `http://localhost:3000`, the API on `http://localhost:8788`, and sync on
`http://localhost:8787`.

`do` is available through the optional `apps` profile:

```bash
docker compose --profile apps up --build
```

With that profile, `do` is exposed on `http://localhost:3001` and Kin on `http://localhost:3002`.

## Published Images

GitHub Actions publishes the app, API, and sync images to GHCR:

```txt
ghcr.io/bart-jaskulski/tildom/home
ghcr.io/bart-jaskulski/tildom/mark
ghcr.io/bart-jaskulski/tildom/do
ghcr.io/bart-jaskulski/tildom/kin
ghcr.io/bart-jaskulski/tildom/hey
ghcr.io/bart-jaskulski/tildom/api
ghcr.io/bart-jaskulski/tildom/sync
```

Deployment compose files are intentionally kept outside this application repo. The current homelab
deployment lives at `../homelab/tildom/compose.yaml`. Set `API_BASE_URL` or
`MARK_SYNC_BASE_URL` as GitHub Actions repository variables when the public service URLs differ
from `https://api.tildom.app` and `https://sync.tildom.app`.

## Workspace Packages

pnpm workspaces are configured in [pnpm-workspace.yaml](./pnpm-workspace.yaml). Future local packages should be consumed with the workspace protocol:

```json
{
  "dependencies": {
    "@tildom/ui": "workspace:*"
  }
}
```

This keeps local package resolution explicit and prevents accidentally using a registry package when a workspace package is expected.
