# Stage 1: builder
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/hub/package.json ./packages/hub/

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source files
COPY packages/protocol/ ./packages/protocol/
COPY packages/hub/ ./packages/hub/
COPY tsconfig.base.json ./

# Build protocol package first (hub depends on it)
RUN npm run build:protocol

# Build Next.js hub
RUN npm run build -w packages/hub

# Stage 2: runner
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/hub/package.json ./packages/hub/

# Install production dependencies only
RUN npm install --omit=dev

# Copy built protocol dist
COPY --from=builder /app/packages/protocol/dist ./packages/protocol/dist

# Copy built Next.js output and hub server
COPY --from=builder /app/packages/hub/.next ./packages/hub/.next
COPY --from=builder /app/packages/hub/server.ts ./packages/hub/server.ts
COPY --from=builder /app/packages/hub/next.config.js ./packages/hub/next.config.js
COPY --from=builder /app/packages/hub/src ./packages/hub/src

EXPOSE 3000

CMD ["npx", "tsx", "packages/hub/server.ts"]
