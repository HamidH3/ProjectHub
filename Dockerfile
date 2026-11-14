# =============================================================================
# ProjectHub container image.
#
# Build (the two public Supabase values are built into the browser code, so
# each Supabase project needs its own image):
#   docker build -t projecthub \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... .
#
# Run (secrets are given at run time, never built in):
#   docker run -p 3000:3000 --env-file .env.docker projecthub
#
# Full guide: docs/DEPLOY-DOCKER.md (and docs/DEPLOY-KUBERNETES.md).
# =============================================================================
ARG NODE_IMAGE=node:22-bookworm-slim

# 1. Install packages exactly as locked in package-lock.json
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2. Build the app
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ]; then \
      echo "Set --build-arg NEXT_PUBLIC_SUPABASE_URL=... and --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=..."; exit 1; \
    fi
RUN npm run build

# 3. The small image that actually runs: just the built server, no source code
FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The only folder the app writes to (Next.js's cache); everything else is read-only.
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
