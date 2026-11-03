# syntax=docker/dockerfile:1.7

FROM golang:1.27-alpine AS build

WORKDIR /src

COPY services/push/go.mod services/push/go.sum ./
RUN go mod download

COPY services/push/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bin/tildom-push .

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

ENV PORT=8789
ENV PUSH_STORAGE_ROOT=/app/storage

COPY --from=build /bin/tildom-push /bin/tildom-push

EXPOSE 8789

USER nonroot:nonroot

CMD ["/bin/tildom-push"]
