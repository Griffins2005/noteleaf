# ─────────────────────────────────────────────────────────────────────────────
# Noteleaf Web — Dockerfile
#
# Multi-stage build:
#   Stage 1 (deps):    Install production dependencies only.
#   Stage 2 (builder): Install all deps, compile shared-types, build Next.js.
#   Stage 3 (runner):  Copy only the Next.js standalone output + static files.
#
# Next.js standalone output:
#   `output: 'standalone'` in next.config.ts (added below) traces all imports
#   and produces a self-contained server.js with only the files it needs.
#   This reduces the production image from ~1GB to ~150MB.
#
# Build context: monorepo root (docker build -f apps/web/Dockerfile .)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────

FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts

# ── Stage 2: Builder ──────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Reuse the installed node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy source.
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/web/ ./apps/web/

# Build shared-types first — Next.js TypeScript compilation depends on it.
RUN cd packages/shared-types && npm run build

# Build the Next.js app.
# NEXT_PUBLIC_API_URL must be set at build time when baked into the client bundle.
# In Docker Compose, the web container calls the API via the published host port,
# not the internal Docker DNS — so this uses localhost for same-machine deployments
# and is overridden via ARG for remote API deployments.
ARG NEXT_PUBLIC_API_URL=http://localhost:3002
ARG NEXT_PUBLIC_APP_URL=http://localhost:3003
# Server-side rewrite destination — Docker internal DNS so Next.js
# (inside the container) can reach the API without going via the host port.
ARG API_INTERNAL_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL

# Disable Next.js telemetry in CI/Docker.
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web && npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

RUN apk add --no-cache dumb-init

# Non-root user.
USER node

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# Copy the standalone output — this is self-contained with its own node_modules.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Next.js standalone server — produced by `output: 'standalone'` in next.config.ts.
CMD ["node", "apps/web/server.js"]
