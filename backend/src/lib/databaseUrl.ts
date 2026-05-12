import { resolve } from 'path'

const SSL_MODES_WITH_LEGACY_PG_ALIAS = new Set(['prefer', 'require', 'verify-ca'])

export function defaultSqliteDatabaseUrl(baseDir: string): string {
  return `file:${resolve(baseDir, 'opet.db')}`
}

export function isPostgresDatabaseUrl(databaseUrl: string): boolean {
  return databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')
}

export function normalizePostgresSslMode(databaseUrl: string): string {
  if (!isPostgresDatabaseUrl(databaseUrl)) return databaseUrl

  const url = new URL(databaseUrl)
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase()
  const useLibpqCompat = url.searchParams.get('uselibpqcompat')?.toLowerCase() === 'true'

  if (sslMode && SSL_MODES_WITH_LEGACY_PG_ALIAS.has(sslMode) && !useLibpqCompat) {
    url.searchParams.set('sslmode', 'verify-full')
  }

  return url.toString()
}

export function resolveDatabaseUrl(rawUrl: string | undefined, sqliteBaseDir: string): string {
  const databaseUrl = rawUrl?.trim() || defaultSqliteDatabaseUrl(sqliteBaseDir)
  return normalizePostgresSslMode(databaseUrl)
}
