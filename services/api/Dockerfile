# syntax=docker/dockerfile:1.7

FROM golang:1.27-alpine AS build

WORKDIR /src

COPY services/api/go.mod services/api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY services/api/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bin/tildom-api .

RUN mkdir -p /app/storage/subscriptions && chown -R 65532:65532 /app/storage

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

ENV PORT=8788
ENV PUSH_STORAGE_ROOT=/app/storage

COPY --from=build /bin/tildom-api /bin/tildom-api
COPY --from=build --chown=65532:65532 /app/storage /app/storage

EXPOSE 8788

USER nonroot:nonroot

CMD ["/bin/tildom-api"]
