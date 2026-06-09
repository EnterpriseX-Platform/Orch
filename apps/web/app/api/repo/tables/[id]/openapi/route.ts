/**
 * /api/repo/tables/:id/openapi — auto-generated OpenAPI 3 spec for
 * the table's CRUD endpoints. Lets admins point Swagger UI / Postman
 * at this URL and immediately get a working API definition without
 * hand-writing YAML (spec).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { describe as routerDescribe } from '@/lib/repo-router'

const PG_TO_OPENAPI: Record<string, { type: string; format?: string }> = {
  text:                 { type: 'string' },
  varchar:              { type: 'string' },
  'character varying':  { type: 'string' },
  char:                 { type: 'string' },
  integer:              { type: 'integer', format: 'int32' },
  bigint:               { type: 'integer', format: 'int64' },
  numeric:              { type: 'number' },
  real:                 { type: 'number', format: 'float' },
  'double precision':   { type: 'number', format: 'double' },
  boolean:              { type: 'boolean' },
  date:                 { type: 'string', format: 'date' },
  timestamp:            { type: 'string', format: 'date-time' },
  'timestamp without time zone': { type: 'string', format: 'date-time' },
  'timestamp with time zone':    { type: 'string', format: 'date-time' },
  timestamptz:          { type: 'string', format: 'date-time' },
  json:                 { type: 'object' },
  jsonb:                { type: 'object' },
  uuid:                 { type: 'string', format: 'uuid' },
  bytea:                { type: 'string', format: 'byte' },
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await prisma.repoTable.findUnique({
    where: { id },
    include: { connection: true },
  })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Use the routed describe so external Oracle / MySQL tables work
  // too. The previous describePhysicalTable() validated names against
  // a lowercase IDENT regex and 500'd on uppercase Oracle names like
  // M_ITEM_EXPENDITURE.
  const cols = await routerDescribe(t as any).catch(() => [])

  const props: Record<string, unknown> = {}
  const required: string[] = []
  for (const c of cols) {
    const m = PG_TO_OPENAPI[c.type] ?? { type: 'string' }
    props[c.name] = c.encrypted
      ? { ...m, description: 'Encrypted at rest', writeOnly: true }
      : m
    if (!c.nullable && c.name !== 'id' && c.name !== 'created_at' && c.name !== 'updated_at') {
      required.push(c.name)
    }
  }

  const base = `/orch/api/repo/tables/${id}/rows`
  const rowSchema = { type: 'object', properties: props, required }

  const spec = {
    openapi: '3.0.3',
    info: {
      title: t.displayName ?? t.name,
      description: t.description ?? `Auto-generated CRUD API for repo_${t.name}`,
      version: '1.0.0',
    },
    paths: {
      [base]: {
        get: {
          summary: 'List rows',
          parameters: [
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Rows',
              content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: rowSchema } } } } },
            },
          },
        },
        post: {
          summary: 'Create row',
          requestBody: { required: true, content: { 'application/json': { schema: rowSchema } } },
          responses: { '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { data: rowSchema } } } } } },
        },
      },
      [`${base}/{rowId}`]: {
        parameters: [{ name: 'rowId', in: 'path', required: true, schema: { type: 'integer' } }],
        patch: {
          summary: 'Update row',
          requestBody: { required: true, content: { 'application/json': { schema: rowSchema } } },
          responses: { '200': { description: 'Updated' } },
        },
        delete: {
          summary: 'Delete row',
          responses: { '200': { description: 'Deleted' } },
        },
      },
    },
    components: { schemas: { [t.name]: rowSchema } },
  }

  return NextResponse.json(spec)
}
