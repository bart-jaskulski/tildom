# do.tildom

do.tildom is the Tildom task manager. It is a Solid/Vite app with local-first task storage in browser SQLite through `@tildom/browser-db`.

The app includes a small Node/Hono server for AI task breakdown. It also contains an older sync route prototype under `src/routes/api/sync`; keep that code as reference until the dedicated `services/sync` architecture replaces it.

## Developing

From the repository root:

```bash
pnpm install
pnpm dev:do
```

Or from this app directory:

```bash
pnpm dev
```

The Vite dev server defaults to `http://localhost:5173`.

## Optional AI Feature

AI task breakdown uses `GOOGLE_API_KEY` when the server endpoint is called.

For local development, create an app-local env file if needed:

```bash
cp .env.example .env
```

Then set `GOOGLE_API_KEY` in `.env`.

The core task app does not require an AI key.

## Verification

From the repository root:

```bash
pnpm typecheck:do
pnpm test:do
pnpm build:do
```

From this app directory:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Run the production server locally after building:

```bash
pnpm start
```

## Docker

From the repository root, run the optional app profile:

```bash
docker compose --profile apps up --build
```

`do` is exposed on `http://localhost:3001` by default. Change the host port with:

```bash
DO_APP_PORT=8081 docker compose --profile apps up --build
```

## Notes

- Task data lives in browser storage, not in the Docker container.
- The mounted `/app/storage` volume is for server-side sync experiments and future service boundaries.
- `dist/`, `server-dist/`, and generated `public/sw.js` are build outputs.
- See the root [PROJECT.md](../../PROJECT.md) before expanding sync or billing behavior.
