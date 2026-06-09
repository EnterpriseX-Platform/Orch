/**
 * app-crypto.ts — application-level AES-256-GCM value encryption.
 *
 * Pure crypto primitive: the caller passes the raw 32-byte key + version;
 * key resolution / storage lives in `encryption-keys.ts`. Used by the Data
 * Repository data path (encrypt on write-via-API, decrypt on read-via-API).
 *
 * Token format:  enc:v<version>:<base64url( iv[12] | tag[16] | ciphertext )>
 *   - aes-256-gcm, fresh 96-bit IV per value, 128-bit auth tag
 *   - the key VERSION is embedded so rotation can decrypt old values
 *
 * Decrypt is intentionally LENIENT on input shape (passes through any value
 * that isn't one of our tokens — existing plaintext / legacy plaintext rows stay
 * readable) but STRICT on our own tokens (throws on wrong key / tampering)
 * so ciphertext is never silently surfaced as plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const PREFIX = 'enc:v'
const IV_LEN = 12 // 96-bit GCM nonce
const TAG_LEN = 16 // 128-bit GCM auth tag

/** True iff the value is one of our encryption tokens. */
export function isEncrypted(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

/**
 * Encrypt a value with the given 32-byte key + version. null/undefined are
 * returned unchanged (NULLs stay NULL in the DB). Non-strings are coerced
 * via String() — encrypted columns are treated as text.
 */
export function encryptValue(plain: unknown, key: Buffer, version: number): string | null | undefined {
  if (plain === null || plain === undefined) return plain as null | undefined
  const data = typeof plain === 'string' ? plain : String(plain)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const token = Buffer.concat([iv, tag, ct]).toString('base64url')
  return `${PREFIX}${version}:${token}`
}

export type KeyResolver = (version: number) => Buffer | undefined

/**
 * Decrypt a token back to its plaintext string. Non-tokens (plaintext,
 * numbers, null, …) pass through unchanged. Throws when the token's key
 * version can't be resolved or GCM authentication fails (wrong key / tamper).
 */
export function decryptValue(token: unknown, resolveKey: KeyResolver): unknown {
  if (!isEncrypted(token)) return token

  const rest = token.slice(PREFIX.length) // "<version>:<base64url>"
  const sep = rest.indexOf(':')
  if (sep < 0) throw new Error('app-crypto: malformed token (missing version separator)')

  const version = Number.parseInt(rest.slice(0, sep), 10)
  if (!Number.isInteger(version)) throw new Error('app-crypto: malformed token version')

  const key = resolveKey(version)
  if (!key) throw new Error(`app-crypto: no encryption key for version ${version}`)

  const raw = Buffer.from(rest.slice(sep + 1), 'base64url')
  if (raw.length < IV_LEN + TAG_LEN) throw new Error('app-crypto: ciphertext too short')

  const iv = raw.subarray(0, IV_LEN)
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = raw.subarray(IV_LEN + TAG_LEN)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const out = Buffer.concat([decipher.update(ct), decipher.final()]) // throws on auth failure
  return out.toString('utf8')
}
