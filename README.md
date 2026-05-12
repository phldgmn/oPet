# 4|change – Open Petition Platform

A self-hosted, privacy-respecting petition platform built with Bun, Hono, Prisma, and SolidJS.

## Features

- **Create & manage petitions** – draft, activate, pause, complete, or archive
- **Email verification flow** – signers receive a confirmation link before their signature counts
- **Withdrawal support** – signers can remove their signature at any time via email link
- **Admin dashboard** – manage petitions, view signatures, export data
- **CSV / JSON export** – filter and download signature data
- **Rate limiting** – protect signing and verification endpoints
- **Audit log** – track all admin actions
- **Docker Compose** – one-command deployment

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Runtime  | [Bun](https://bun.sh)               |
| API      | [Hono](https://hono.dev)            |
| ORM      | [Prisma](https://prisma.io) + PostgreSQL |
| Frontend | [SolidJS](https://solidjs.com) + Vite |
| Email    | Nodemailer (SMTP)                   |
| Deploy   | Docker Compose                      |

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/pdiegmann/oPet.git
cd oPet
cp .env.example .env
# Edit .env with your settings
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

The backend will automatically run database migrations and start on port **3001**.
The frontend will be available on port **3000**.

### 3. First login

The admin user is created automatically when the backend starts (seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in your `.env`).

### 4. Open the app

- **Public site**: http://localhost:3000
- **Admin panel**: http://localhost:3000/admin/login

## Development

### Quick start (monorepo)

```bash
cp .env.example .env   # and fill in your settings
bun install
bun dev
```

This starts both the backend (port **3001**) and the frontend dev server (port **3000**) in parallel.
The backend automatically applies the database schema and seeds the admin user on first run.

### Individual services

**Backend only**

```bash
cd backend
bun dev
```

**Frontend only**

```bash
cd frontend
bun dev
```

## Environment Variables

See [`.env.example`](.env.example) for all available variables.

| Variable        | Description                            |
|-----------------|----------------------------------------|
| `DATABASE_URL`  | PostgreSQL connection string           |
| `JWT_SECRET`    | Secret for signing admin JWT tokens    |
| `SMTP_HOST`     | SMTP server host                       |
| `SMTP_PORT`     | SMTP port (default: 587)               |
| `SMTP_USER`     | SMTP username                          |
| `SMTP_PASS`     | SMTP password                          |
| `FROM_EMAIL`    | Sender address for outgoing emails     |
| `APP_URL`       | Public URL of the frontend             |
| `ADMIN_EMAIL`   | Initial admin email (seed only)        |
| `ADMIN_PASSWORD`| Initial admin password (seed only)     |

## API Overview

### Public

| Method | Path                              | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/petitions`                  | List active petitions    |
| GET    | `/api/petitions/:slug`            | Get single petition      |
| POST   | `/api/petitions/:slug/sign`       | Sign a petition          |
| GET    | `/api/verify/:token`              | Verify email             |
| POST   | `/api/petitions/:slug/withdraw-request` | Request withdrawal |
| POST   | `/api/withdraw/:token`            | Confirm withdrawal       |

### Admin (requires Bearer token)

| Method | Path                              | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/admin/login`                | Admin login              |
| GET    | `/api/admin/dashboard`            | Dashboard stats          |
| CRUD   | `/api/admin/petitions`            | Manage petitions         |
| GET    | `/api/admin/petitions/:id/signatures` | List signatures      |
| DELETE | `/api/admin/signatures/:id`       | Remove a signature       |
| POST   | `/api/admin/export`               | Export signatures        |
| GET    | `/api/admin/audit`                | Audit log                |
| CRUD   | `/api/admin/users`                | Manage admin users       |

## License

MIT
