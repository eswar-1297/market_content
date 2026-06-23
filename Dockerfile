# syntax=docker/dockerfile:1

# ---- Build stage: install deps (incl. native better-sqlite3) + build client ----
FROM node:20-bookworm AS build
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

# Toolchain for native modules (better-sqlite3 compiles here if no prebuilt binary).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm install --prefix client && npm install --prefix server

# Copy source (node_modules excluded via .dockerignore) and build the client bundle.
COPY . .
RUN npm run build --prefix client

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PORT=3001
WORKDIR /app

# Server (with its node_modules) and the built client bundle.
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3001
CMD ["node", "server/index.js"]
