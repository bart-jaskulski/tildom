# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY services/sync/package.json services/sync/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @tildom/sync

COPY packages/config packages/config
COPY services/sync services/sync
RUN pnpm --filter @tildom/sync build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @tildom/sync deploy --prod --legacy /app
RUN mkdir -p /app/storage/vaults && chown -R 65532:65532 /app/storage

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV SYNC_STORAGE_ROOT=/app/storage/vaults

COPY --from=build --chown=65532:65532 /app ./

EXPOSE 8787

CMD ["dist/index.js"]
