FROM node:22-bookworm-slim AS build

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mark/package.json apps/mark/package.json
RUN pnpm install --frozen-lockfile --filter mark.tildom

COPY apps/mark apps/mark
RUN pnpm --filter mark.tildom build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /repo/apps/mark/dist ./dist
COPY --from=build /repo/apps/mark/server-dist ./server-dist
RUN mkdir -p /app/storage/vaults

EXPOSE 3000

CMD ["node", "server-dist/index.js"]
