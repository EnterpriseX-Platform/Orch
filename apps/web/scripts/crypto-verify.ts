/**
 * crypto-verify.ts — unit verification of the app-level AES-256-GCM primitive.
 *
 *   cd apps/web && npx tsx scripts/crypto-verify.ts
 *
 * Covers the contract that the Data Repository encrypt/decrypt path relies on:
 * round-trip, passthrough of non-tokens, coercion, fail-closed on wrong key /
 * tampering / unresolvable version, key rotation, and fresh-IV uniqueness.
 */
import { encryptValue, decryptValue, isEncrypted } from '../lib/app-crypto'
import { randomBytes } from 'crypto'

const key = randomBytes(32)
const v1 = (v: number) => (v === 1 ? key : undefined)
let pass = 0
let fail = 0
const check = (n: string, c: boolean) => {
  c ? pass++ : fail++
  console.log(`${c ? '✅' : '❌'} ${n}`)
}

const tok = encryptValue('hello-secret-123', key, 1)
check('token is enc:v1:…', typeof tok === 'string' && tok.startsWith('enc:v1:'))
check('isEncrypted(token)', isEncrypted(tok))
check('round-trip decrypt', decryptValue(tok, v1) === 'hello-secret-123')
check('plaintext passthrough', decryptValue('plain', v1) === 'plain')
check('isEncrypted(plain) = false', !isEncrypted('plain'))
check('null passthrough (encrypt)', encryptValue(null, key, 1) === null)
check('null passthrough (decrypt)', decryptValue(null, v1) === null)
check('number coerced → round-trips', decryptValue(encryptValue(42, key, 1), v1) === '42')

let wrongKeyThrew = false
try { decryptValue(tok, (v) => (v === 1 ? randomBytes(32) : undefined)) } catch { wrongKeyThrew = true }
check('wrong key throws (no plaintext leak)', wrongKeyThrew)

let tamperThrew = false
try { decryptValue((tok as string).slice(0, -4) + 'AAAA', v1) } catch { tamperThrew = true }
check('tampered token throws', tamperThrew)

let versionThrew = false
try { decryptValue(tok, () => undefined) } catch { versionThrew = true }
check('unresolvable version throws', versionThrew)

const key2 = randomBytes(32)
const both = (v: number) => (v === 1 ? key : v === 2 ? key2 : undefined)
check('v2 token round-trips', decryptValue(encryptValue('rotated', key2, 2), both) === 'rotated')
check('v1 token still decrypts after rotation', decryptValue(tok, both) === 'hello-secret-123')
check('fresh IV per encrypt (tokens differ)', encryptValue('x', key, 1) !== encryptValue('x', key, 1))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
