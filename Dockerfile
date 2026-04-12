# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all workspace manifests first (for layer caching)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all dependencies (workspace symlinks need all packages present)
RUN npm ci

# Copy source
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Build order: shared → server → client
RUN npm run build --workspace=@isekai/shared
RUN npm run build --workspace=@isekai/server
# VITE_SERVER_URL='' → socket.io connects to same origin at runtime
RUN VITE_SERVER_URL="" npm run build --workspace=@isekai/client

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy workspace manifests for production install
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Production deps only (workspace symlink for @isekai/shared is created here)
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
