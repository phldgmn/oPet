# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Root workspace (runs across all packages):**
```bash
bun dev          # Start backend + frontend in parallel
bun build        # Build all packages
bun test         # Run tests in all packages
```

**Backend only:**
```bash
cd backend
bun run dev      # Start with watch mode (auto-runs DB setup via predev hook)
bun run build    # Compile to dist/
bun run test     # Run tests
bun run db:setup    # Prepare database (migrations)
bun run db:migrate  # Apply Prisma migrations
bun run db:seed     # Seed initial data
```

**Frontend only:**
```bash
cd frontend
bun dev          # Vite dev server on port 3000
bun build        # Production build
bun run typecheck  # TypeScript type check without emitting
```

## Architecture

**4|change** is a petition platform — a Bun monorepo with a Hono (TypeScript) backend and a SolidJS frontend.

### Monorepo Layout

```
oPet/
├── backend/     # Hono API server (port 3001)
├── frontend/    # SolidJS + Vite app (port 3000)
└── docker-compose.yml
```

### Backend (`backend/src/`)

- `index.ts` — Hono app entry point, wires middleware and routes
- `db.ts` — Prisma client singleton
- `routes/public.ts` — Unauthenticated routes: petition browsing, signing, email verification, withdrawal
- `routes/admin.ts` — JWT-protected routes: CRUD for petitions/signatures, dashboard stats, CSV/JSON exports
- `middleware/` — JWT auth validation, rate limiting
- `lib/` — Email (Nodemailer/SMTP), token generation, CSV/JSON export, audit logging

**Database:** Prisma ORM. Auto-falls back from PostgreSQL → SQLite (`./opet.db`) when `DATABASE_URL` is unset. Models: `User`, `Petition`, `Signature`, `VerificationToken`, `Export`, `AuditLog`.

**DB bootstrap:** Both `predev` and `prestart` hooks automatically run `scripts/prepare-db.ts` to apply schema before the server starts.

### Frontend (`frontend/src/`)

- `pages/` — Public pages (Home, Petition, Verify, Withdraw, Success) + `admin/` subfolder (Login, Dashboard, Petitions, Signatures, Export, Backup)
- `components/` — Layout, `QuillEditor` (Quill WYSIWYG for petition bodies), and `ui/` (40+ shadcn/solid components)
- `stores/auth.ts` — Solid store for authenticated user state
- `lib/api.ts` — Central API client; all backend calls go through here

**Dev proxy:** Vite proxies `/api/*` to `http://localhost:3001` so frontend and backend run independently.

### Path Aliases

| Package | Alias | Resolves to |
|---------|-------|-------------|
| backend | `@/*` | `src/*` |
| frontend | `@/*` | `src/*` |
| frontend | `~/*` | `src/*` |

### Key Flows

- **Signature flow:** User signs → receives verification email → clicks link → signature counted
- **Admin bootstrap:** On first start, an admin user is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars
- **Auth:** JWT tokens validated per-request in admin middleware; no session storage

### Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL`, `JWT_SECRET`, `SMTP_*`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
