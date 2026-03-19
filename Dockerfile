# =============================================================================
# Stage 1 — Node.js: Build Next.js standalone bundle
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# NEXT_PUBLIC_* vars are baked into the client bundle at build time.
# Pass them with: docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=https://...
# In Docker/Fly.io, NEXT_PUBLIC_BACKEND_URL is intentionally empty so
# fetch(`${NEXT_PUBLIC_BACKEND_URL}/api/briefing`) becomes a relative URL
# that nginx routes to FastAPI on the same origin.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
ARG NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID
ARG NEXT_PUBLIC_BACKEND_URL=""

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=$NEXT_PUBLIC_STRIPE_PRO_PRICE_ID \
    NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID=$NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID \
    NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

# Install dependencies first (own layer — only re-runs when lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --prefer-offline

# Copy source (own layer — re-runs when any source file changes)
COPY app/            ./app/
COPY lib/            ./lib/
COPY public/         ./public/
COPY proxy.js        ./
COPY next.config.mjs ./

RUN npm run build


# =============================================================================
# Stage 2 — Python: Runtime with nginx + supervisord + Node.js
# =============================================================================
FROM python:3.12-slim AS runner

# Install system deps:
#   nginx      — reverse proxy (routes :8080 to Next.js:3000 or FastAPI:8000)
#   supervisor — process manager (runs nginx + node + uvicorn)
#   curl       — used by HEALTHCHECK
#   nodejs     — runs the Next.js standalone server
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        curl \
        gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y --auto-remove gnupg \
    && rm -rf /var/lib/apt/lists/*

# ── Python FastAPI backend ─────────────────────────────────────────────────
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./

# ── Next.js standalone server ──────────────────────────────────────────────
# next build --output standalone produces a self-contained server in .next/standalone/
# Static chunks (.next/static) and public/ must be copied alongside it.
WORKDIR /app/frontend
COPY --from=frontend-builder /build/.next/standalone/ ./
COPY --from=frontend-builder /build/.next/static/     ./.next/static/
COPY --from=frontend-builder /build/public/           ./public/

# ── Process manager & reverse proxy config ────────────────────────────────
COPY docker/nginx.conf       /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/workspaceflow.conf

# Remove the default nginx site so our config is the only one
RUN rm -f /etc/nginx/sites-enabled/default \
          /etc/nginx/sites-available/default \
          /etc/nginx/conf.d/default.conf

# ── Port & health ─────────────────────────────────────────────────────────
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

# Start supervisord in foreground — it manages nginx, node, and uvicorn
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/workspaceflow.conf"]
