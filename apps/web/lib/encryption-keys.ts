/**
 * encryption-keys.ts — key management for app-level column encryption.
 *
 * Envelope scheme (KEK / DEK):
 *   - KEK (Key-Encryption-Key): 32 bytes from env/secret `ORCH_ENCRYPTION_KEK`
 *     (base64). Dev fallback: HKDF-derived from JWT_SECRET (insecure — a
 *     warning is logged; set ORCH_ENCRYPTION_KEK in every real env).
 *   - DEK (Data-Encryption-Key): random 32-byte AES key, one per *version*,
 *     stored KEK-WRAPPED (aes-256-gcm) in SystemConfig `security.encryption`.
 *     A DB dump alone therefore yields only wrapped keys.
 *
 * Rotation: mint a new DEK version, point `activeKeyVersion` at it; old
 * versions stay available so previously-written values (token carries its
 * version) still decrypt. Re-encryption to the new version is lazy / via the
 * migrate job.
 *
 * Consumed by the Data Repository data path via repo-crypto-hooks.ts:
 *   getActiveEncryptionKey()  -> {key, version}   (for encrypt-on-write)
 *   getKeyByVersion(v)        -> Buffer|undefined  (for decrypt-on-read)
 */
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'crypto'
import { getConfig } from './system-config'

export const ENCRYPTION_CONFIG_KEY = 'security.encryption'
const KEK_IV = 12
const KEK_TAG = 16

export interface EncryptionState {
  /** Master on/off for app-level encryption. */
  enabled: boolean
  /** Version used for NEW encryptions. */
  activeKeyVersion: number
  /** version (string) -> base64url(iv|tag|wrappedDEK). */
  keys: Record<string, string>
}

// ── KEK ────────────────────────────────────────────────────────────────
let _kek: Buffer | null = null

export function getKEK(): Buffer {
  if (_kek) return _kek
  const env = process.env.ORCH_ENCRYPTION_KEK
  if (env) {
    const b = Buffer.from(env, 'base64')
    if (b.length !== 32) {
      throw new Error('ORCH_ENCRYPTION_KEK must decode to exactly 32 bytes (base64)')
    }
    _kek = b
    return b
  }
  // Dev-only fallback. Never rely on this in a real environment.
  console.warn('[encryption-keys] ORCH_ENCRYPTION_KEK not set — deriving an INSECURE dev KEK from JWT_SECRET. Set ORCH_ENCRYPTION_KEK in non-dev envs.')
  const seed = process.env.JWT_SECRET || 'orch-dev-insecure-seed'
  _kek = Buffer.from(hkdfSync('sha256', Buffer.from(seed), Buffer.alloc(0), Buffer.from('orch-encryption-kek-v1'), 32))
  return _kek
}

function wrapDEK(dek: Buffer): string {
  const iv = randomBytes(KEK_IV)
  const c = createCipheriv('aes-256-gcm', getKEK(), iv)
  const ct = Buffer.concat([c.update(dek), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

function unwrapDEK(wrapped: string): Buffer {
  const raw = Buffer.from(wrapped, 'base64url')
  if (raw.length < KEK_IV + KEK_TAG) throw new Error('encryption-keys: wrapped DEK too short')
  const iv = raw.subarray(0, KEK_IV)
  const tag = raw.subarray(KEK_IV, KEK_IV + KEK_TAG)
  const ct = raw.subarray(KEK_IV + KEK_TAG)
  const d = createDecipheriv('aes-256-gcm', getKEK(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

// ── DEK access (with process-local unwrapped cache) ──────────────────────
const dekCache = new Map<number, Buffer>()

async function loadState(): Promise<EncryptionState | null> {
  const v = await getConfig<EncryptionState>(ENCRYPTION_CONFIG_KEY)
  return v && typeof v === 'object' ? v : null
}

/** Active key for new encryptions. Throws if encryption isn't enabled/configured. */
export async function getActiveEncryptionKey(): Promise<{ key: Buffer; version: number }> {
  const st = await loadState()
  if (!st || !st.enabled) {
    throw new Error('App encryption is not enabled — configure a key in System Settings → Encryption.')
  }
  const version = st.activeKeyVersion
  const key = await getKeyByVersion(version)
  if (!key) throw new Error(`Active encryption key v${version} is missing.`)
  return { key, version }
}

/** Resolve a key by version (for decrypting old values). Cached per process. */
export async function getKeyByVersion(version: number): Promise<Buffer | undefined> {
  const cached = dekCache.get(version)
  if (cached) return cached
  const st = await loadState()
  const wrapped = st?.keys?.[String(version)]
  if (!wrapped) return undefined
  const dek = unwrapDEK(wrapped)
  dekCache.set(version, dek)
  return dek
}

/** Synchronous resolver bound to a pre-loaded state — used inside row loops. */
export function makeKeyResolver(state: EncryptionState): (v: number) => Buffer | undefined {
  return (version: number) => {
    const cached = dekCache.get(version)
    if (cached) return cached
    const wrapped = state.keys?.[String(version)]
    if (!wrapped) return undefined
    const dek = unwrapDEK(wrapped)
    dekCache.set(version, dek)
    return dek
  }
}

/** Read full state (for the key-management API + resolver building). */
export async function getEncryptionState(): Promise<EncryptionState | null> {
  return loadState()
}

/** Mint a fresh wrapped DEK (used by the key-management API on init/rotate). */
export function mintWrappedDEK(): string {
  return wrapDEK(randomBytes(32))
}

/** Drop the in-process unwrapped-DEK cache (after rotate / key change). */
export function clearKeyCache(): void {
  dekCache.clear()
}
