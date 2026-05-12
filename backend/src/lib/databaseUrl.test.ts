import { describe, expect, test } from 'bun:test'
import {
  isPostgresDatabaseUrl,
  normalizePostgresSslMode,
  resolveDatabaseUrl,
} from './databaseUrl.js'

describe('database URL handling', () => {
  test('detects PostgreSQL URLs', () => {
    expect(isPostgresDatabaseUrl('postgresql://user:pass@example.com:5432/db')).toBe(true)
    expect(isPostgresDatabaseUrl('postgres://user:pass@example.com:5432/db')).toBe(true)
    expect(isPostgresDatabaseUrl('file:./opet.db')).toBe(false)
  })

  test('normalizes deprecated PostgreSQL sslmode aliases to the current secure behavior', () => {
    const normalized = normalizePostgresSslMode(
      'postgresql://user:pass@example.com:5432/db?sslmode=require'
    )

    expect(new URL(normalized).searchParams.get('sslmode')).toBe('verify-full')
  })

  test('preserves explicit libpq compatibility mode', () => {
    const normalized = normalizePostgresSslMode(
      'postgresql://user:pass@example.com:5432/db?sslmode=require&uselibpqcompat=true'
    )
    const params = new URL(normalized).searchParams

    expect(params.get('sslmode')).toBe('require')
    expect(params.get('uselibpqcompat')).toBe('true')
  })

  test('keeps non-PostgreSQL URLs untouched and falls back to SQLite', () => {
    expect(normalizePostgresSslMode('file:./opet.db')).toBe('file:./opet.db')
    expect(resolveDatabaseUrl(undefined, '/tmp/opet')).toBe('file:/tmp/opet/opet.db')
  })
})
