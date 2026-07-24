# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS package-manifests

WORKDIR /repo

COPY packages packages
RUN find packages -type f ! -name package.json -delete

FROM node:22-bookworm-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/package.json
COPY --from=package-manifests /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @tildom/api...

COPY services/api services/api
COPY packages packages
RUN pnpm --filter @tildom/api build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @tildom/api deploy --prod --legacy /app

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build --chown=65532:65532 /app ./

EXPOSE 3000

CMD ["dist/index.js"]
