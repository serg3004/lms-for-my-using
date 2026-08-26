# ---- Base: Node + pnpm ----
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Deps: install only API workspace dependencies ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @lms/api...

# ---- Build: compile TypeScript (Prisma client already generated in deps) ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY package.json pnpm-workspace.yaml ./
WORKDIR /app/apps/api
RUN pnpm run build

# ---- Deploy: create standalone production bundle ----
FROM base AS deployer
WORKDIR /app
# Reuse pnpm store from deps so deploy does not re-download packages
COPY --from=deps /pnpm/store /pnpm/store
COPY --from=builder /app .
# hoisted linker so COPY in the runner stage works without symlinks
RUN echo "node-linker=hoisted" >> .npmrc && \
    pnpm --filter @lms/api deploy --prod /standalone

# ---- Runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app

# Refresh runtime OpenSSL libraries so fixed Alpine security updates are
# present even when the upstream Node image has not yet been rebuilt.
RUN apk add --no-cache --upgrade libcrypto3 libssl3 && \
    addgroup -S lms && adduser -S lms -G lms

COPY --from=deployer /standalone/node_modules ./node_modules
COPY --from=deployer /standalone/package.json ./package.json
COPY --from=builder  /app/apps/api/dist ./dist
COPY --from=builder  /app/apps/api/prisma ./prisma

# npm is only build tooling; keeping it in the runtime image adds its
# dependency tree and an unnecessary package-installation surface.
RUN node node_modules/.bin/prisma generate && \
    rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx

USER lms
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health/ready || exit 1

# prisma is in production dependencies so migrate deploy runs before startup
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node dist/main.js"]
