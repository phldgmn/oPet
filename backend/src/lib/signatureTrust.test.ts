import { describe, expect, test } from 'bun:test'
import { evaluateSignatureTrust, normalizeEmail } from './signatureTrust.js'

describe('signature trust checks', () => {
  test('normalizes email before duplicate checks', () => {
    expect(normalizeEmail('  PERSON@Example.ORG ')).toBe('person@example.org')
  })

  test('rejects honeypot submissions', () => {
    expect(evaluateSignatureTrust({ website: 'https://spam.example', now: 10_000 })).toEqual({
      ok: false,
      reason: 'honeypot',
    })
  })

  test('rejects unrealistically fast submissions', () => {
    expect(evaluateSignatureTrust({ formStartedAt: 9_000, now: 10_000 })).toEqual({
      ok: false,
      reason: 'too_fast',
      formAgeMs: 1000,
    })
  })

  test('accepts normal submissions', () => {
    expect(evaluateSignatureTrust({ formStartedAt: 1_000, now: 10_000 })).toEqual({ ok: true })
  })
})
