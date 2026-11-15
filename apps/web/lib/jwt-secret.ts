// Single source for the JWT signing secret.
//
// Production must set JWT_SECRET. The old code silently fell back to the
// literal 'orch-secret-key' — which is public in the repository — so anyone
// could mint an admin token on an environment that forgot the variable.
// Outside production the fallback is kept so local dev still works.

const DEV_FALLBACK = 'orch-dev-only-secret'

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing or shorter than 16 characters — refusing to sign or verify tokens')
  }
  return s || DEV_FALLBACK
}

/** Same rule, for code that must not throw (returns null = reject everything). */
export function getJwtSecretOrNull(): string | null {
  try {
    return getJwtSecret()
  } catch {
    return null
  }
}
