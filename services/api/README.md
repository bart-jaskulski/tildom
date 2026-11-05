# api.tildom

Shared network-feature and push notification service for the static Tildom apps, written in Go.

```txt
/v1/mark/*  bookmark metadata and tags
/v1/do/*    task breakdown
/v1/push/*  subscriptions, scheduling, and web push delivery
```

From the repository root:

```bash
GOOGLE_API_KEY=... pnpm dev:api
```

The service listens on `http://localhost:8788`.

### Configuration

- `PORT` (default: `8788`)
- `GOOGLE_API_KEY` (Gemini API key for Mark tags and Do breakdown)
- `GEMINI_MODEL` (default: `gemini-3.5-flash-lite`)
- `API_ALLOWED_ORIGINS` (default: `https://mark.tildom.app,https://do.tildom.app,https://kin.tildom.app`)
- `PUSH_STORAGE_ROOT` (default: `./storage`)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (default: `mailto:push@tildom.app`)
- `API_TRUSTED_PROXIES` (default: empty): comma-separated proxy CIDRs permitted to supply `X-Forwarded-For`. Configure only proxies you control that append or replace this header. Other client-IP headers are ignored.

Feature endpoints accept one JSON value up to 64 KiB; larger bodies return 413. Rate limits apply per client IP, regardless of connection or user agent.
