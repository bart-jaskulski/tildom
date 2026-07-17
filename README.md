# Tildom

Tildom is a family of local-first personal web applications. The current apps are:

- `mark`: bookmark and note manager.
- `do`: task manager.
- `kin`: personal relationship manager.

Each app runs as a Solid/Vite application and stores product data locally in browser SQLite/OPFS. Server APIs are optional and used only for features that require network access, such as bookmark metadata fetching or AI task breakdown.

For architecture, deployment direction, sync planning, and maintenance rules, read [PROJECT.md](./PROJECT.md).

## Repository Layout

```txt
apps/
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
pnpm dev:mark
pnpm dev:do
pnpm dev:kin
```

The Vite dev server defaults to `http://localhost:5173`.

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

The root Compose file currently runs Mark and the sync service by default:

```bash
docker compose up --build
```

Mark is exposed on `http://localhost:3000`. Sync is exposed on `http://localhost:8787`.

`do` is available through the optional `apps` profile:

```bash
docker compose --profile apps up --build
```

With that profile, `do` is exposed on `http://localhost:3001` and Kin on `http://localhost:3002`.

## Published Images

GitHub Actions publishes Mark, Kin, and sync images to GHCR on pushes to `main`, version tags, and manual runs:

```txt
ghcr.io/bart-jaskulski/tildom/mark
ghcr.io/bart-jaskulski/tildom/kin
ghcr.io/bart-jaskulski/tildom/sync
```

Deployment compose files are intentionally kept outside this application repo. The current homelab deployment lives at `../homelab/tildom/compose.yaml`. Set `MARK_SYNC_BASE_URL` as a GitHub Actions repository variable before building Mark if sync is not served from `https://sync.tildom.app`.

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
