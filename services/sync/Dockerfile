# syntax=docker/dockerfile:1.7

FROM golang:1.27-alpine AS build

WORKDIR /src

COPY services/sync/go.mod services/sync/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY services/sync/*.go ./
RUN --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bin/tildom-sync .

RUN mkdir -p /app/storage/vaults && chown -R 65532:65532 /app/storage

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

ENV PORT=8787
ENV SYNC_STORAGE_ROOT=/app/storage/vaults

COPY --from=build /bin/tildom-sync /bin/tildom-sync
COPY --from=build --chown=65532:65532 /app/storage /app/storage

EXPOSE 8787

USER nonroot:nonroot

CMD ["/bin/tildom-sync"]
