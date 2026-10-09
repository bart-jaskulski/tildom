# Do: app guidance

Read the root AGENTS.md, PRODUCT.md, and DESIGN.md first. Do is a static SolidJS
application built with Vite and explicit `@solidjs/router` routes, not SolidStart.

- Tasks and workspaces belong to Do. `src/lib/schema.ts` owns migrations;
  `src/lib/db.ts` uses `@tildom/browser-db` and keeps the existing
  `microstep.sqlite3` OPFS database. `src/stores/taskStore.ts` mirrors local SQL
  into Solid state. Ordering uses LexoRank. No CRDT or Y.js layer is present.
- Shared tokens, base styling and controls belong to `@tildom/ui`. App CSS owns
  task-specific layout. Follow the suite's system monospace, square corners,
  accessible targets and keyboard rules. Do not introduce a separate palette.
- Optional encrypted snapshot sync uses `@tildom/sync-client` through
  `src/lib/sync.ts` and `syncState.ts`. Local database change events mark sync
  dirty; imported snapshots refresh tasks and workspaces without becoming
  local writes. Configure `VITE_SYNC_BASE_URL` for production; development uses
  the `/sync` proxy.
- Previous `vault_store` IndexedDB pairing records are deliberately left intact,
  but their changeset-era protocol is incompatible with shared snapshot sync.
  Users create a new sync vault on the device holding their tasks and pair other
  devices using its new `#sync=v1.*` link. Old `#vault` links are rejected without
  touching local tasks. Joining a new vault can replace local data and requires
  an explicit confirmation.
- AI breakdown is optional and calls `services/api` via `api.tildom.app/v1/do/*`;
  model credentials remain on the server. Ordinary task operations work offline.
- Use Solid primitives; do not destructure reactive props or use React hooks.
  Keep schema and domain code local to this app.

Run checks from the repository root: `pnpm test:do`, `pnpm typecheck:do`, and
`pnpm build:do`. Use `agent-browser` for browser verification.
