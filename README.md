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
- pnpm 10.33+
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

The root Compose file currently runs Mark by default:

```bash
docker compose up --build
```

Mark is exposed on `http://localhost:3000`.

`do` is available through the optional `apps` profile:

```bash
docker compose --profile apps up --build
```

With that profile, `do` is exposed on `http://localhost:3001`.

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
