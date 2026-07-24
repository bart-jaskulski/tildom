# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/do/package.json apps/do/package.json
COPY packages/browser-db/package.json packages/browser-db/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/node-server/package.json packages/node-server/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter do.tildom...

COPY apps/do apps/do
COPY packages/browser-db packages/browser-db
COPY packages/config packages/config
COPY packages/node-server packages/node-server
COPY packages/ui packages/ui
RUN pnpm --filter do.tildom build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter do.tildom deploy --prod --legacy /app

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=65532:65532 /app ./

EXPOSE 3000

CMD ["server-dist/server/index.js"]
