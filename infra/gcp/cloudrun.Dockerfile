# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY web ./web
RUN cd web && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app/web
ENV NODE_ENV=production \
    PORT=8080

# Create non-root user for runtime
RUN useradd --user-group --system nextjs

COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/.next ./.next
COPY --from=builder /app/web/package.json ./package.json
COPY --from=builder /app/web/node_modules ./node_modules
COPY web/next.config.ts ./next.config.ts
COPY web/postcss.config.mjs ./postcss.config.mjs

USER nextjs
EXPOSE 8080
CMD ["npm", "run", "start"]
