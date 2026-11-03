# push.tildom

Minimal, zero-knowledge Web Push courier service for Tildom apps.

The push service knows only **when** to knock and **where** to deliver; it holds no plaintext names, notes, or event details.

## Endpoints

```txt
GET    /health                            service health
GET    /v1/push/public-key                retrieves VAPID public key
PUT    /v1/push/subscriptions/:subId      replaces subscription and scheduled reminders
DELETE /v1/push/subscriptions/:subId      removes subscription and all pending reminders
```

## Running

From repository root:

```bash
pnpm dev:push
```

Or via Docker Compose:

```bash
docker compose up push
```

## Environment Variables

- `PORT` (default: `8789`)
- `PUSH_STORAGE_ROOT` (default: `./storage`)
- `VAPID_PUBLIC_KEY` (auto-generated ephemeral if unset)
- `VAPID_PRIVATE_KEY` (auto-generated ephemeral if unset)
- `VAPID_SUBJECT` (default: `mailto:push@tildom.app`)
