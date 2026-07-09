# Tildom Project Architecture

Tildom is a family of local-first personal web applications. The first apps are:

- `mark`: bookmark and note manager, currently migrated from `hn-links`.
- `do`: task manager, migrated from `../micro-step`.
- `kin`: personal relationship manager, migrated from `../kin`.

The long-term goal is a privacy-friendly, open-source, self-hostable suite with excellent mobile and desktop behavior, optional encrypted sync, and optional hosted paid services.

## Core Principles

- Local-first is the default. Product data lives in browser SQLite/OPFS first.
- Offline behavior is product behavior, not an enhancement.
- Hosted services must be optional for self-hosters.
- Servers should not receive plaintext user data unless a feature explicitly requires it.
- Shared code should be extracted only after a second or third real use case proves the boundary.
- The monorepo should make coordination easier without turning the project into a framework.
- Each app and service should remain independently deployable.

## Repository Layout

Target shape:

```txt
tildom/
  apps/
    home/      # tildom.app
    mark/      # mark.tildom.app
    do/        # do.tildom.app
    kin/       # kin.tildom.app
  services/
    sync/      # sync.tildom.app
    api/       # optional shared feature API
  packages/
    ui/
    server/
    sync-client/
    browser-db/
    config/
```

Current foundation:

```txt
tildom/
  apps/
    do/
    kin/
    mark/
  packages/
  services/
  compose.yaml
  package.json
  pnpm-workspace.yaml
```

`../micro-step` and `../kin` were migrated without preserving git history. Their old directories may still contain repository metadata, dependency caches, and generated build outputs, but source/config/docs now live under `apps/`.

## pnpm Workspace Model

pnpm is the package manager for the monorepo.

Workspace package discovery lives in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/*"
```

Local packages should be consumed with the workspace protocol:

```json
{
  "dependencies": {
    "@tildom/ui": "workspace:*"
  }
}
```

This is intentional. `workspace:*` makes pnpm resolve the dependency from the local workspace and fail if it is missing, which is better than accidentally pulling a similarly named package from the registry.

Use filtered commands from the root:

```bash
pnpm --filter mark.tildom dev
pnpm --filter mark.tildom build
pnpm --filter mark.tildom test
```

Root convenience scripts may wrap these filters, but app package scripts should remain usable from the app directory.

## Applications

Each app owns its domain model, routes, local database schema, and product behavior.

Apps should share:

- visual tokens and app shell primitives through `packages/ui`;
- production asset serving and common response headers through `packages/server`;
- encrypted sync client behavior through `packages/sync-client`, once sync stabilizes.

Apps should not share:

- bookmark/task/contact domain stores;
- product-specific SQLite schemas;
- feature copy or route structures unless a real common abstraction emerges.

## Homepage

`apps/home` should serve `tildom.app`.

Its first version should be a small portal and trust page, not a heavy marketing site:

- app shortcuts for Mark, Do, and Kin;
- local-first and privacy explanation;
- self-hosting instructions;
- links to source code and docs;
- pricing only after hosted sync exists.

It may share `packages/ui`, but it should not depend on browser database or sync internals.

## Services

### Sync Service

`services/sync` should become the central encrypted sync service at `sync.tildom.app`.

The first production sync service should be deliberately dumb:

- store opaque encrypted blobs;
- separate data by app id and vault id;
- enforce size limits and rate limits;
- never parse bookmarks, tasks, contacts, or plaintext SQLite content;
- support self-hosting with filesystem storage first.

Initial API shape should be snapshot-oriented:

```txt
PUT /v1/apps/:appId/vaults/:vaultId/snapshot
GET /v1/apps/:appId/vaults/:vaultId/latest
GET /v1/apps/:appId/vaults/:vaultId/snapshots
```

App ids should be stable strings such as `mark`, `do`, and `kin`.

Change-based sync can come later. Snapshot sync is easier to reason about, easier to self-host, and matches the near-term backup/sync goal.

### Feature API

`services/api` is optional. It may eventually host network-required features such as:

- bookmark title and metadata fetching;
- AI task breakdown;
- personal AI chat.

Keep it separate from the sync service unless there is a strong operational reason to combine them. Sync has a stricter privacy boundary than feature APIs.

## Deployment Model

Do not ship one giant container image.

Each deployable should have its own image:

```txt
tildom.app          -> apps/home
mark.tildom.app     -> apps/mark
do.tildom.app       -> apps/do
kin.tildom.app      -> apps/kin
sync.tildom.app     -> services/sync
api.tildom.app      -> services/api, optional
```

For self-hosting, provide a root `compose.yaml` that can run the useful default stack. The default stack currently runs Mark and sync. Later it should grow to include the home app and the other apps.

Published images should use stable, per-deployable GHCR names:

```txt
ghcr.io/bart-jaskulski/tildom/mark -> apps/mark
ghcr.io/bart-jaskulski/tildom/sync -> services/sync
```

Keep image construction boring and small: multi-stage Dockerfiles, pnpm 11, production-only deploy output, and nonroot runtime images. Deployment topology is an operator concern, but the repository-provided image-only Compose file assumes services join an external `cloudflared` Docker network and exposes no host ports.

Required deployment properties:

- Node 22+ runtime for server-backed apps and services.
- Persistent Docker volumes for service storage.
- COOP/COEP headers for browser SQLite/OPFS support.
- No hosted dependency for basic local-first use.
- Environment variables only for optional network features.

## Billing and Entitlements

Billing should not be implemented until hosted sync works end to end.

When added, billing belongs in hosted services, not in the open-source local apps:

- local apps remain fully useful without hosted services;
- self-hosted sync can be enabled through self-hosted configuration;
- hosted `sync.tildom.app` can require account and entitlement checks;
- apps should ask a configured server for available capabilities instead of hard-coding pricing logic.

This preserves the open-source/self-hosted story while allowing hosted convenience to be paid.

## Package Extraction Order

Extract packages only when useful pressure exists.

Recommended order:

1. `packages/ui`: design tokens, base CSS, app shell, nav primitives.
2. `packages/server`: static asset handler, COOP/COEP headers, Node request helpers, Vite dev API adapter.
3. `services/sync`: encrypted snapshot storage.
4. `packages/sync-client`: vault keys, pairing URLs, encrypted upload/download.
5. `packages/browser-db`: DB worker protocol and OPFS helpers, only after the app differences are understood.
6. `packages/config`: shared TypeScript/Vitest/ESLint configuration, only after multiple apps live in the monorepo.

## Migration Plan

1. Move `mark`, `do`, and `kin` into `apps/` and make the repository a pnpm workspace. Done.
2. Keep root scripts for app-level dev/build/test/typecheck commands. Done.
3. Normalize Mark Docker deployment from the monorepo root. Done.
4. Add a root Compose profile for running `do` separately from the default Mark service. Done.
5. Fix the current `do` server split before treating its sync routes as production architecture.
6. Add `apps/home`.
7. Extract `packages/ui` from actual shared styles.
8. Extract `packages/server`.
9. Build `services/sync`.
10. Add `packages/sync-client` after one app successfully syncs through the service.

## Maintenance Rules

- Keep changes scoped to the app, service, or package that owns the behavior.
- Avoid cross-app abstractions until at least two apps need the same thing.
- Prefer boring Docker and filesystem storage first.
- Make every app build, typecheck, and test independently.
- Keep generated build outputs out of source control.
- Preserve local-first behavior before adding hosted convenience.
- Treat self-hosting docs as a product feature.
- Do not let billing logic leak into local-only app behavior.
