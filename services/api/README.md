# api.tildom

Shared network-feature service for the static Tildom apps.

```txt
/v1/mark/*  bookmark metadata and tags
/v1/do/*    task breakdown
/v1/hey/*   chat and titles
```

From the repository root:

```bash
GOOGLE_API_KEY=... pnpm dev:api
```

The service listens on `http://localhost:8788` during development and on port `3000` in its
container. `API_ALLOWED_ORIGINS` is a comma-separated production origin allowlist; localhost
origins are accepted for development.
