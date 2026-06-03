# syntax=docker/dockerfile:1

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
RUN pnpm install --frozen-lockfile --filter @lms/api

# ---- Build: generate Prisma client and compile TypeScript ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY package.json pnpm-workspace.yaml ./
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- Deploy: create standalone production bundle ----
FROM base AS deployer
WORKDIR /app
COPY --from=builder /app .
# hoisted linker so COPY in the runner stage works without symlinks
RUN echo "node-linker=hoisted" >> .npmrc && \
    pnpm --filter @lms/api deploy --prod /standalone

# ---- Runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S lms && adduser -S lms -G lms

COPY --from=deployer /standalone/node_modules ./node_modules
COPY --from=deployer /standalone/package.json ./package.json
COPY --from=builder  /app/apps/api/dist ./dist
COPY --from=builder  /app/apps/api/prisma ./prisma

USER lms
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Run migrations then start the app.
# prisma is included because it is listed in devDependencies — for production
# deployments use Railway's deploy command to run migrations separately.
CMD ["node", "dist/main.js"]
