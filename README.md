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
  hey/
packages/
services/
```

Shared packages cover UI, browser storage, encrypted sync, Markdown, and app configuration.
Extract further shared code only after real reuse pressure exists.

## Requirements

- Node.js 26+
- pnpm 11.10+
- Docker, optional for container deployment

## Install

```bash
pnpm install
```

## Development

Run apps from the repository root:

```bash
pnpm dev:home
pnpm dev:mark
pnpm dev:do
pnpm dev:kin
pnpm dev:hey
pnpm dev:api
```

Development ports: Home `5170`, Mark `5173`, Kin `5174`, Hey `5175`, Do `5176`.
The feature API defaults to `http://localhost:8788`; sync uses `http://localhost:8787`.
Set `GOOGLE_API_KEY` for AI-backed requests.

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
`MARK_SYNC_BASE_URL` / `DO_SYNC_BASE_URL` as GitHub Actions repository variables when the public service URLs differ
from `https://api.tildom.app` and `https://sync.tildom.app`.

## Workspace Packages

| Package | Owns |
| --- | --- |
| `@tildom/ui` | Design tokens, base CSS, shared controls, navigation, keyboard and PWA interactions |
| `@tildom/browser-db` | SQLite worker, OPFS, migrations, queries, transactions, import/export |
| `@tildom/sync-client` | Encrypted snapshot sync, pairing, suite connection and background sync |
| `@tildom/markdownish` | Sanitized Markdown, hashtags and task rendering |
| `@tildom/config` | TypeScript defaults, common Vite setup and PWA configuration |

Use `workspace:*` for internal dependencies. Apps own their schemas, domain stores, routes,
and layouts. Mark is the reference for router-based composition.

For a product app, import `@tildom/ui/base.css` once in the app stylesheet. Use shared controls
before adding local styles; keep palette values and global appearance in UI. Domain layout
and specialized editors remain app-owned.

Use `tildomAppConfig(import.meta.url, overrides)` from `@tildom/config/vite` for the source alias,
SQLite assets, isolation headers and `/sync` development proxy. Supply app-specific plugins,
port and build options through `overrides`; `SYNC_PROXY_TARGET` changes the local sync target.
Use `tildomPwa` from `@tildom/config/pwa` for app manifests and install assets.

Dependency versions are aligned across workspaces. TypeScript stays on 6.0 until
`typescript-eslint` supports 7; newer versions currently break Do's lint tooling.

Do now uses the same snapshot sync as Mark, Kin and Hey. Previous Do pairing links are incompatible:
create a new vault on the device with your tasks, then pair the other devices using its new link.
Local task databases and legacy pairing credentials are preserved.
