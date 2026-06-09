/**
 * Database-engine-aware column encryption helpers.
 *
 * The "Encryption" panel in /orch/settings shows admins a table view
 * of every (table, column) pair, lets them flag which columns hold
 * sensitive data, and generates the right DDL to encrypt them in
 * place. Different RDBMS support different mechanisms — this file is
 * the single place that knows which:
 *
 *   PostgreSQL : pgcrypto extension + bytea + pgp_sym_encrypt() per
 *                row (or transparent page-level encryption when the
 *                cluster supports it). Generates a SQL script that
 *                creates the extension + a wrapper function and
 *                migrates the column type to bytea.
 *   Oracle     : Transparent Data Encryption (TDE) — `ALTER TABLE
 *                <t> MODIFY (<col> ENCRYPT)`. Requires Advanced
 *                Security option + an open Oracle wallet, but the
 *                DDL itself is one line.
 *   MySQL      : `ALTER TABLE <t> MODIFY <col> <type> ENCRYPTED`
 *                (only on Enterprise) or AES_ENCRYPT() per row.
 *                Currently surfaced as preview only.
 *
 * Engine detection looks at DATABASE_URL prefix
 * (`postgresql://`, `oracle:`/`jdbc:oracle:`, `mysql://`).
 */

export type DbEngine = 'postgres' | 'oracle' | 'mysql' | 'unknown'

export function detectEngine(url?: string): DbEngine {
  const u = (url ?? process.env.DATABASE_URL ?? '').toLowerCase()
  if (u.startsWith('postgres') || u.startsWith('postgresql')) return 'postgres'
  if (u.startsWith('oracle') || u.includes('jdbc:oracle:')) return 'oracle'
  if (u.startsWith('mysql')) return 'mysql'
  return 'unknown'
}

export type ColumnSpec = {
  table: string
  column: string
  /** Existing column type as reported by the catalog (text/varchar/json/...). */
  dataType: string
}

/**
 * Generates the DDL needed to encrypt one column on the given engine.
 * Output is plain SQL — caller can show it as a preview, copy/paste
 * it into a DBA tool, or pipe it through prisma.$executeRawUnsafe()
 * if the connection has DDL privileges.
 *
 * Each engine returns multi-statement SQL with comments — keep them
 * in the output so admins can see what the system did.
 */
export function generateEncryptDdl(engine: DbEngine, col: ColumnSpec, opts?: { passphraseEnv?: string }): string {
  const t = col.table
  const c = col.column
  const passEnv = opts?.passphraseEnv ?? 'ORCH_ENCRYPTION_PASSPHRASE'

  switch (engine) {
    case 'postgres':
      // pgcrypto + bytea migration. Reads the passphrase from a
      // GUC variable (`current_setting`) so it isn't baked into the
      // schema. Ops sets `ALTER DATABASE orchiodb SET orch.passphrase = ...`.
      return [
        `-- spec — encrypt ${t}.${c} with pgcrypto (PostgreSQL)`,
        `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
        `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${c}_enc" bytea;`,
        `UPDATE "${t}"`,
        `   SET "${c}_enc" = pgp_sym_encrypt("${c}"::text, current_setting('orch.passphrase', true))`,
        `   WHERE "${c}" IS NOT NULL AND "${c}_enc" IS NULL;`,
        `ALTER TABLE "${t}" DROP COLUMN "${c}";`,
        `ALTER TABLE "${t}" RENAME COLUMN "${c}_enc" TO "${c}";`,
        `-- Application reads via:  pgp_sym_decrypt("${c}", current_setting('orch.passphrase', true))`,
        `-- Passphrase env: ${passEnv}`,
      ].join('\n')

    case 'oracle':
      // Oracle Transparent Data Encryption — column-level. Requires
      // Advanced Security option licensed + wallet open. After the
      // DDL the column transparently encrypts at rest; SELECT/INSERT
      // application code is unchanged.
      return [
        `-- spec — encrypt ${t}.${c} with Oracle TDE (column-level)`,
        `-- Prerequisites:`,
        `--   1. Advanced Security option licensed`,
        `--   2. Wallet open: ADMINISTER KEY MANAGEMENT SET KEYSTORE OPEN IDENTIFIED BY "...";`,
        `--   3. Master key set:  ADMINISTER KEY MANAGEMENT SET KEY USING TAG 'orch' IDENTIFIED BY "..." WITH BACKUP;`,
        `ALTER TABLE ${t.toUpperCase()} MODIFY (${c.toUpperCase()} ENCRYPT USING 'AES256');`,
        `-- Verify:  SELECT column_name, encryption_alg FROM dba_encrypted_columns WHERE table_name = '${t.toUpperCase()}';`,
      ].join('\n')

    case 'mysql':
      return [
        `-- spec — encrypt ${t}.${c} (MySQL)`,
        `-- MySQL Enterprise:  ALTER TABLE \`${t}\` MODIFY \`${c}\` ${col.dataType} /*!ENCRYPTED*/;`,
        `-- Community edition:  use AES_ENCRYPT() per row`,
        `--   UPDATE \`${t}\` SET \`${c}\` = AES_ENCRYPT(\`${c}\`, @key);`,
        `-- (Tablespace-level encryption requires a separate ALTER TABLESPACE statement.)`,
      ].join('\n')

    default:
      return `-- Unknown engine — cannot generate encryption DDL for ${t}.${c}`
  }
}

/**
 * Generate DDL that ROLLS BACK an encryption (drops the encrypted
 * column / reverts the type). Useful for the UI's "decrypt"
 * affordance. Postgres-only at the moment because Oracle TDE has
 * no column-level decrypt without re-creating the column.
 */
export function generateDecryptDdl(engine: DbEngine, col: ColumnSpec): string {
  const { table: t, column: c } = col
  switch (engine) {
    case 'postgres':
      return [
        `-- Decrypt ${t}.${c} back to plain text (PostgreSQL)`,
        `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${c}_plain" text;`,
        `UPDATE "${t}" SET "${c}_plain" = pgp_sym_decrypt("${c}", current_setting('orch.passphrase', true));`,
        `ALTER TABLE "${t}" DROP COLUMN "${c}";`,
        `ALTER TABLE "${t}" RENAME COLUMN "${c}_plain" TO "${c}";`,
      ].join('\n')
    case 'oracle':
      return [
        `-- Decrypt ${t}.${c} (Oracle TDE — column-level)`,
        `ALTER TABLE ${t.toUpperCase()} MODIFY (${c.toUpperCase()} DECRYPT);`,
      ].join('\n')
    default:
      return `-- Decrypt for engine "${engine}" is not supported in the auto-DDL panel.`
  }
}

/**
 * Tables/columns that are particularly likely to hold sensitive data
 * — surfaced first in the encryption panel so admins don't have to
 * scroll. Not an enforcement list; admins can encrypt anything.
 */
export const SUGGESTED_SENSITIVE: ColumnSpec[] = [
  { table: 'audit_logs',  column: 'new_values', dataType: 'jsonb' },
  { table: 'audit_logs',  column: 'old_values', dataType: 'jsonb' },
  { table: 'audit_logs',  column: 'changes',    dataType: 'jsonb' },
  { table: 'api_logs',    column: 'request_body',  dataType: 'jsonb' },
  { table: 'api_logs',    column: 'response_body', dataType: 'jsonb' },
  { table: 'api_logs',    column: 'request_headers', dataType: 'jsonb' },
  { table: 'users',       column: 'password_hash', dataType: 'text' },
  { table: 'api_keys',    column: 'key_hash',      dataType: 'text' },
  { table: 'api_auth_configs', column: 'api_key',  dataType: 'text' },
  { table: 'api_auth_configs', column: 'oauth_client_secret', dataType: 'text' },
]
