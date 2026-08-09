# ---- Base: Node + pnpm ----
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Deps: install only web workspace dependencies ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @lms/web...

# ---- Build: Vite production build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY package.json pnpm-workspace.yaml ./
WORKDIR /app/apps/web
RUN pnpm run build

# ---- Runner: nginx serving static files ----
FROM nginx:stable-alpine AS runner

# Refresh base-image packages so fixed Alpine security updates are present even
# when the upstream nginx tag has not yet been rebuilt.
RUN apk upgrade --no-cache

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/nginx.conf /etc/nginx/templates/default.conf.template
COPY infra/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

ENV API_UPSTREAM_URL=http://api.railway.internal:3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
