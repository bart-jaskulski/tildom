# syntax=docker/dockerfile:1.7

FROM node:26-trixie-slim AS package-manifests

WORKDIR /repo

COPY packages packages
RUN find packages -type f ! -name package.json -delete

FROM node:26-trixie-slim AS build

WORKDIR /repo

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install --global pnpm@11.10.0 && pnpm config set store-dir /pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/home/package.json apps/home/package.json
COPY --from=package-manifests /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter home.tildom...

COPY apps/home apps/home
COPY packages packages
RUN pnpm --filter home.tildom build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

COPY docker/static-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/home/dist /usr/share/nginx/html

EXPOSE 3000
