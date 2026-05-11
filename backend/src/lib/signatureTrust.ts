export const MIN_SIGNATURE_FORM_AGE_MS = 2500

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function evaluateSignatureTrust(input: { website?: string; formStartedAt?: number; now?: number }) {
  if (input.website?.trim()) {
    return { ok: false as const, reason: 'honeypot' }
  }

  if (input.formStartedAt) {
    const formAgeMs = (input.now ?? Date.now()) - input.formStartedAt
    if (formAgeMs < MIN_SIGNATURE_FORM_AGE_MS) {
      return { ok: false as const, reason: 'too_fast', formAgeMs }
    }
  }

  return { ok: true as const }
}
