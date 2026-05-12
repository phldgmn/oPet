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

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/prisma ./prisma
COPY --from=build /repo/backend/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/backend/scripts ./scripts
COPY --from=build /repo/backend/src/lib/databaseUrl.ts ./src/lib/databaseUrl.ts

EXPOSE 3001

CMD ["sh", "-c", "bun run scripts/prepare-db.ts && bun dist/index.js"]
