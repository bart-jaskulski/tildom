# syntax=docker/dockerfile:1.7

FROM node:26-trixie-slim AS package-manifests

WORKDIR /repo

COPY packages packages
RUN find packages -type f ! -name package.json -delete

FROM node:26-trixie-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.10.0 && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/do/package.json apps/do/package.json
COPY --from=package-manifests /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter do.tildom...

ARG VITE_SYNC_BASE_URL=https://sync.tildom.app
ENV VITE_SYNC_BASE_URL=$VITE_SYNC_BASE_URL
ARG VITE_API_BASE_URL=https://api.tildom.app
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY apps/do apps/do
COPY packages packages
RUN pnpm --filter do.tildom build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

COPY docker/static-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/do/dist /usr/share/nginx/html

EXPOSE 3000
