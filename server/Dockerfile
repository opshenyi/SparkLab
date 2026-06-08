# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder

WORKDIR /src
RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/sparklab-server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/sparklab-seed ./cmd/seed

FROM docker:27-cli

RUN apk add --no-cache bash ca-certificates docker-cli-compose git tzdata

WORKDIR /app
COPY --from=builder /out/sparklab-server /app/sparklab-server
COPY --from=builder /out/sparklab-seed /app/sparklab-seed
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh /app/sparklab-server /app/sparklab-seed

EXPOSE 3001
ENTRYPOINT ["/app/entrypoint.sh"]
