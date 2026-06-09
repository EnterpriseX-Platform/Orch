import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  // upsert via raw
  await p.$executeRaw`
    INSERT INTO system_configs (id, key, value, value_type, category, description, project_id, created_at, updated_at)
    VALUES (gen_random_uuid()::text, 'audit.retentionDays', '365', 'number', 'audit',
            'Audit log retention in days (default 365)', NULL, NOW(), NOW())
    ON CONFLICT (key, project_id) DO UPDATE SET
      value = '365',
      description = EXCLUDED.description,
      updated_at = NOW()
  `
  console.log('✓ audit.retentionDays = 365')
  const r = await p.$queryRaw<{ key: string; value: string }[]>`
    SELECT key, value FROM system_configs WHERE key LIKE '%retentionDays' ORDER BY key
  `
  for (const row of r) console.log(`  ${row.key} = ${row.value}`)
}
main().catch(console.error).finally(() => p.$disconnect())
