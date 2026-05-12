#!/usr/bin/env bun
/**
 * prepare-db.ts
 *
 * Detects the configured database type from DATABASE_URL and:
 *  - Falls back to SQLite (file:<backend>/opet.db) when no PostgreSQL URL is set
 *  - Generates the Prisma client for the correct provider
 *  - Applies the database schema
 *
 * Run automatically via the `prestart` / `predev` npm hooks.
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, appendFileSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'
import { isPostgresDatabaseUrl, resolveDatabaseUrl } from '../src/lib/databaseUrl.js'

const ROOT = resolve(import.meta.dir, '..')
const ENV_FILE = resolve(ROOT, '..', '.env')
// Store the SQLite database next to the backend root for a predictable location.
const SQLITE_DB_PATH = resolve(ROOT, 'opet.db')
const SQLITE_URL = `file:${SQLITE_DB_PATH}`
const POSTGRES_SCHEMA = resolve(ROOT, 'prisma', 'schema.prisma')
const SQLITE_SCHEMA = resolve(ROOT, 'prisma', 'schema.sqlite.prisma')
const PRISMA_CONFIG = resolve(ROOT, 'prisma.config.ts')
const MIGRATIONS_DIR = resolve(ROOT, 'prisma', 'migrations')

function run(cmd: string, env: Record<string, string | undefined>): void {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, ...env } })
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function envFileContains(key: string): boolean {
  if (!existsSync(ENV_FILE)) return false
  return readFileSync(ENV_FILE, 'utf-8').includes(`${key}=`)
}

function appendToEnvFile(line: string): void {
  if (existsSync(ENV_FILE) && !isRegularFile(ENV_FILE)) {
    console.warn(`[prepare-db] Skipping .env write: ${ENV_FILE} is not a regular file`)
    return
  }
  try {
    appendFileSync(ENV_FILE, `\n${line}\n`, 'utf-8')
    console.log(`[prepare-db] Wrote '${line}' to ${ENV_FILE}`)
  } catch (err) {
    console.warn(`[prepare-db] Could not write to ${ENV_FILE}: ${err}`)
  }
}

function hasMigrationFiles(): boolean {
  if (!existsSync(MIGRATIONS_DIR)) return false

  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory()) return false

    const migrationPath = resolve(MIGRATIONS_DIR, entry.name, 'migration.sql')
    return existsSync(migrationPath) && isRegularFile(migrationPath)
  })
}

const rawUrl = (process.env.DATABASE_URL ?? '').trim()
const isPostgres = isPostgresDatabaseUrl(rawUrl)

let schema: string
let databaseUrl: string

if (isPostgres) {
  console.log('[prepare-db] PostgreSQL detected — using PostgreSQL database')
  schema = POSTGRES_SCHEMA
  databaseUrl = resolveDatabaseUrl(rawUrl, ROOT)
} else {
  databaseUrl = resolveDatabaseUrl(rawUrl || SQLITE_URL, ROOT)
  console.log(
    `[prepare-db] No PostgreSQL URL detected — falling back to SQLite (${databaseUrl})`
  )
  schema = SQLITE_SCHEMA

  // Persist the default DATABASE_URL to .env so subsequent process starts
  // (the server itself) pick it up without needing to re-run this script.
  if (!rawUrl && !envFileContains('DATABASE_URL')) {
    appendToEnvFile(`DATABASE_URL=${databaseUrl}`)
  }
}

const env = { DATABASE_URL: databaseUrl }
const quotedConfig = `"${PRISMA_CONFIG}"`
const quotedSchema = `"${schema}"`
const quotedUrl = `"${databaseUrl}"`

console.log('[prepare-db] Generating Prisma client…')
run(`bunx prisma generate --config=${quotedConfig} --schema=${quotedSchema}`, env)

console.log('[prepare-db] Applying database schema…')
if (isPostgres) {
  if (hasMigrationFiles()) {
    // Use migrate deploy for PostgreSQL when real migrations are present.
    run(`bunx prisma migrate deploy --config=${quotedConfig} --schema=${quotedSchema}`, env)
  } else {
    console.log('[prepare-db] No Prisma migrations found — running db push for PostgreSQL')
    run(`bunx prisma db push --config=${quotedConfig} --schema=${quotedSchema} --url=${quotedUrl}`, env)
  }
} else {
  // SQLite is used for development/fallback; db push is appropriate here.
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[prepare-db] WARNING: Running SQLite in production is not recommended. ' +
      'Set DATABASE_URL to a PostgreSQL connection string for production use.'
    )
  }
  run(
    `bunx prisma db push --config=${quotedConfig} --schema=${quotedSchema} --url=${quotedUrl} --accept-data-loss`,
    env
  )
}

console.log('[prepare-db] Database ready.')

console.log('[prepare-db] Seeding admin user…')
run(`bun run prisma/seed.ts`, env)
