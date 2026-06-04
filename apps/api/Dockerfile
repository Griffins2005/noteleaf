# ─────────────────────────────────────────────────────────────────────────────
# Noteleaf API — Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): Install all deps, compile shared-types, compile API.
#   Stage 2 (runner):  Copy only compiled output + prod deps. No dev tools.
#
# Why multi-stage:
#   The builder stage needs TypeScript, tsx, and all devDependencies (~400MB).
#   The runner stage only needs the compiled JS and node_modules from
#   dependencies (not devDependencies) — typically ~80MB. This keeps the
#   production image small, reducing pull times and attack surface.
#
# Build context: the monorepo root (docker build -f apps/api/Dockerfile .)
#   The context must be the monorepo root so the COPY commands can reach
#   packages/shared-types and the root tsconfig.base.json.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

# Install dumb-init for proper signal handling and libc compatibility for Prisma.
# ffmpeg is needed to convert audio/webm;codecs=opus (from MediaRecorder) to
# LINEAR_PCM before sending to the NVIDIA NIM gRPC endpoint.
RUN apk add --no-cache dumb-init libc6-compat ffmpeg

WORKDIR /app

# Copy workspace manifests first — Docker layer cache only invalidates here
# when package.json or package-lock.json changes, not on every source change.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install all dependencies (including devDependencies needed for compilation).
# --ignore-scripts prevents postinstall scripts from running in CI.
RUN npm ci --ignore-scripts

# Copy source files after dependency install to maximise cache hits.
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/api/ ./apps/api/

# Compile shared-types first — API TypeScript depends on it.
RUN cd packages/shared-types && npm run build

# Generate Prisma client before compiling the API.
# The generated client is included in apps/api/node_modules/@prisma/client.
RUN cd apps/api && npx prisma generate

# Compile the API TypeScript to dist/.
RUN cd apps/api && npm run build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

# dumb-init: PID 1 signal handling.
# ffmpeg: runtime audio format conversion (opus → PCM for NVIDIA NIM gRPC).
RUN apk add --no-cache dumb-init libc6-compat ffmpeg

# Run as non-root user — security best practice.
# The 'node' user is created by the node:alpine base image.
USER node

WORKDIR /app

# Copy compiled output from builder.
COPY --from=builder --chown=node:node /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

# Copy the proto file — loaded at runtime by @grpc/proto-loader.
# The .proto file defines the gRPC service for NVIDIA NIM Nemotron ASR.
COPY --from=builder --chown=node:node /app/apps/api/src/riva_asr.proto ./apps/api/dist/riva_asr.proto

# Copy Prisma schema and generated client.
# The schema is needed at runtime for prisma migrate deploy.
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma

# Copy node_modules from the npm workspace root and the API workspace.
# Most dependencies are hoisted to the root; Prisma is pinned in the API workspace.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules

# Copy package.json for npm run commands and version metadata.
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/packages/shared-types/package.json ./packages/shared-types/package.json

# Copy the scripts directory — needed by the migrate service.
COPY --from=builder --chown=node:node /app/apps/api/scripts ./apps/api/scripts

WORKDIR /app/apps/api

# Expose the API port. Matches PORT env var (default 3001).
EXPOSE 3001

# Health check — used by Docker Compose and container orchestrators to
# determine when the API is ready to receive traffic.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# dumb-init wraps the node process to handle signals correctly.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
