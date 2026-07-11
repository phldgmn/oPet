# syntax=docker/dockerfile:1.7
FROM oven/bun:1 AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile --filter opet-backend

FROM deps AS build
COPY backend ./backend
COPY i18n ./i18n
WORKDIR /repo/backend
RUN bunx prisma generate
RUN bun build src/index.ts --outdir dist --target bun --packages external

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /app/uploads && chown -R bun:bun /app

COPY --from=build --chown=bun:bun /repo/node_modules ./node_modules
COPY --from=build --chown=bun:bun /repo/backend/dist ./dist
COPY --from=build --chown=bun:bun /repo/backend/prisma ./prisma
COPY --from=build --chown=bun:bun /repo/backend/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=bun:bun /repo/backend/scripts ./scripts
COPY --from=build --chown=bun:bun /repo/backend/src/lib/databaseUrl.ts ./src/lib/databaseUrl.ts

USER bun
EXPOSE 3001

CMD ["sh", "-c", "bun run scripts/prepare-db.ts && bun dist/index.js"]
