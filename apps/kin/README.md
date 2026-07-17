# kin.tildom

kin.tildom is the Tildom personal relationship manager. It is a Solid/Vite app that stores contacts, relationships, and notes locally in browser SQLite via OPFS.

This app is client-only and can be served from its production Docker image.

## Developing

From the repository root:

```bash
pnpm install
pnpm dev:kin
```

Or from this app directory:

```bash
pnpm dev
```

The Vite dev server defaults to `http://localhost:5173`.

## Verification

From the repository root:

```bash
pnpm typecheck:kin
pnpm test:kin
pnpm build:kin
```

From this app directory:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Data

All relationship data is stored in the browser. The app supports local backup/import through browser-exported SQLite data.

## Docker

From the repository root:

```bash
docker build -f apps/kin/Dockerfile -t kin.tildom .
docker run --rm -p 3002:3000 kin.tildom
```

## Notes

- `dist/` is a build output.
- See the root [PROJECT.md](../../PROJECT.md) for the long-term sync and deployment plan.
