# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder

WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG SPARKLAB_VERSION=0.0.0
ARG SPARKLAB_COMMIT=unknown
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SPARKLAB_VERSION=$SPARKLAB_VERSION
ENV NEXT_PUBLIC_SPARKLAB_COMMIT=$SPARKLAB_COMMIT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app
ARG SPARKLAB_VERSION=0.0.0
ARG SPARKLAB_COMMIT=unknown
ENV NODE_ENV=production
ENV PORT=3000
ENV SPARKLAB_VERSION=$SPARKLAB_VERSION
ENV SPARKLAB_COMMIT=$SPARKLAB_COMMIT
ENV NEXT_PUBLIC_SPARKLAB_VERSION=$SPARKLAB_VERSION
ENV NEXT_PUBLIC_SPARKLAB_COMMIT=$SPARKLAB_COMMIT

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p /app/public/uploads/videos

EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
