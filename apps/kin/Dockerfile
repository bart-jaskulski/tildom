# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/kin/package.json apps/kin/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/node-server/package.json packages/node-server/package.json
COPY packages/sync-client/package.json packages/sync-client/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter kin.tildom...

ARG VITE_SYNC_BASE_URL=https://sync.tildom.app
ENV VITE_SYNC_BASE_URL=$VITE_SYNC_BASE_URL

COPY apps/kin apps/kin
COPY packages/config packages/config
COPY packages/node-server packages/node-server
COPY packages/sync-client packages/sync-client
COPY packages/ui packages/ui
RUN pnpm --filter kin.tildom build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter kin.tildom deploy --prod --legacy /app

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=65532:65532 /app ./

EXPOSE 3000

CMD ["server.mjs"]
