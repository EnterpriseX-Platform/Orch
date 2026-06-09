// ==========================================
// Audit Logs - Receive audit events from orch-broker
// POST /api/audit - Create audit entry
// ==========================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth'

// GET /api/audit - List audit logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')
    const action = searchParams.get('action')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const skip = (page - 1) * limit

    const where: any = {}

    // Only add filters if they have valid values (not null, undefined, or 'undefined' string)
    if (entityType && entityType !== 'undefined' && entityType !== 'null') where.entityType = entityType
    if (entityId && entityId !== 'undefined' && entityId !== 'null') where.entityId = entityId
    if (action && action !== 'undefined' && action !== 'null') where.action = action
    // Timestamp range filter: from (gte) and/or to (lte) — supports the
    // audit Filters date-range "between" picker.
    const tsRange: { gte?: Date; lte?: Date } = {}
    if (from && from !== 'undefined' && from !== 'null') tsRange.gte = new Date(from)
    if (to && to !== 'undefined' && to !== 'null') tsRange.lte = new Date(to)
    if (tsRange.gte || tsRange.lte) where.timestamp = tsRange

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return NextResponse.json({
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    // Log detailed error for debugging
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack)
    }
    return NextResponse.json({ 
      error: 'Failed to fetch audit logs',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// POST /api/audit - Create audit log (from orch-broker)
//
// AUDIT POLICY (strict, write-only):
//   audit_logs records PERSISTED CHANGES to data — never reads. The
//   broker's audit node fires on every flow execution, but we only
//   persist the record when we can resolve it to a known write
//   MessageFormat (actionType ∈ SIGNOFF/SUBMIT/APPROVE/REJECT/CREATE
//   /UPDATE/DELETE/CLONE). Anything else (VIEW, EXPORT, API_CALL,
//   unrecognised) is dropped with a 204. Read traffic lives in
//   event_logs / api_logs instead.
//
// Resolution order for the action:
//   1. Explicit `body.action` already in WRITE_ACTIONS  → use it
//   2. Extract flowName from body.action (e.g. "POST_AUTO:_LOAD…") or
//      body.entityId → look up MessageFormat by discriminatorValue
//      → map its actionType to the enum
//   3. Give up → skip (204)

const WRITE_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'])

// Map MessageFormat.actionType → AuditAction enum value stored in DB.
// Keep workflow-ish types (SIGNOFF/SUBMIT/CLONE) as semantic aliases
// of their closest enum member.
const WRITE_ACTION_TYPE_MAP: Record<string, string> = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  SIGNOFF: 'UPDATE',   // SIGNOFF is a strong UPDATE
  SUBMIT: 'UPDATE',
  CLONE: 'CREATE',
}

function extractFlowName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // Broker sends things like "POST_AUTO:_LOADNEW_SCREEN01" or
  // "POST_AUTO:_SAVE_SCREEN02". Grab the trailing token.
  const m = raw.match(/_([A-Za-z][A-Za-z0-9_-]+)$/)
  return m ? m[1] : raw
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rawAction = (body.action || '').toString()

    // Fast path: broker sent a real enum value
    let resolvedAction = WRITE_ACTIONS.has(rawAction) ? rawAction : null

    // Slow path: look up MessageFormat by flowName / entityId / raw action
    if (!resolvedAction) {
      const candidates = [
        body.flowName,
        extractFlowName(rawAction),
        body.entityId,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0)

      for (const candidate of candidates) {
        // Case-insensitive match on discriminatorValue OR code
        const fmt = await prisma.messageFormat.findFirst({
          where: {
            OR: [
              { discriminatorValue: { equals: candidate, mode: 'insensitive' } },
              { code: { equals: candidate, mode: 'insensitive' } },
            ],
          },
          select: { actionType: true, code: true, name: true, screenCode: true },
        })
        if (fmt?.actionType && WRITE_ACTION_TYPE_MAP[fmt.actionType]) {
          resolvedAction = WRITE_ACTION_TYPE_MAP[fmt.actionType]
          break
        }
        // Found a format but it's a read/export → drop silently
        if (fmt && fmt.actionType) {
          // 204 must have an empty body — NextResponse.json(...) with
          // status 204 throws "Invalid response status code 204" because
          // it serialises a JSON body. Use 200 with the explanatory body.
          return NextResponse.json(
            { skipped: true, reason: `actionType ${fmt.actionType} is not a write op` },
            { status: 200 },
          )
        }
      }
    }

    // Still no write-class resolution → drop
    if (!resolvedAction) {
      // See note above re: 204 + JSON body.
      return NextResponse.json(
        { skipped: true, reason: 'no matching write MessageFormat' },
        { status: 200 },
      )
    }

    const description =
      body.description ||
      `${resolvedAction} · ${body.entityType || 'Service'}: ${body.entityId || ''}`

    // Resolve the acting user to a users-table FK. The broker sends `userId` =
    // the actor identity (from the MessageFormat usernameSource); it may be a
    // real Orch user id (gateway/JWT) OR a business-system username (an
    // upstream microflow, e.g. user1@example.com) that has no users-table row. The
    // broker's audit POST does NOT carry a separate `username`, so the actor
    // arrives in `userId`.
    const cleanActor = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() && v !== 'system' && v !== 'anonymous'
        ? v.trim()
        : null
    let userId: string | null = null
    if (cleanActor(body.username)) {
      const byName = await prisma.user.findFirst({
        where: { username: body.username as string },
        select: { id: true },
      })
      if (byName) userId = byName.id
    }
    // resolveUserId echoes a real user id and otherwise returns the system user
    // id, so a return value !== the input means body.userId was NOT a real user.
    let userIdWasRealUser = !!userId
    if (!userId) {
      const resolved = await resolveUserId(body.userId)
      userIdWasRealUser = resolved === body.userId
      userId = resolved
    }

    // Preserve the acting user's identity for DISPLAY. The FK above collapses
    // non-Orch actors onto the system user (why every row used to show
    // "admin"). Keep the raw actor string in changes.username so the UI shows
    // WHO actually acted: an explicit username, else the userId when it did NOT
    // resolve to a real Orch user (i.e. a business-system identity).
    const actorName = cleanActor(body.username) ?? (userIdWasRealUser ? null : cleanActor(body.userId))
    if (actorName) {
      body.changes = {
        ...(body.changes && typeof body.changes === 'object' ? body.changes : {}),
        username: actorName,
      }
    }

    // Populate OLD values by diffing against the most recent PRIOR audit of the
    // SAME record, so the Changes tab shows what actually changed since the last
    // save. "Same record" = same screen (changes.formatName) + same business
    // key. The key field(s) are CONFIG-DRIVEN: the format's ref_id_path
    // (comma-separated, e.g. "ORG_ID,ORDER_YEAR"). No ref_id_path → no diff
    // (old stays null). A microflow save only carries NEW values, so without
    // this every field shows old=null. Covers broker-node + gateway audits.
    // NOTE: screens with MANY records per entity/year (e.g. results / strategy
    // — parent/child indicators) should add a per-item id to ref_id_path
    // (e.g. "ORG_ID,ORDER_YEAR,line_item_id") for finer granularity.
    try {
      const fc = body.changes?.fieldChanges
      const nv = body.newValues
      const formatName = body.changes?.formatName
      if (fc && typeof fc === 'object' && nv && typeof nv === 'object' && !Array.isArray(nv)) {
        const nvObj = nv as Record<string, unknown>
        // Record-key fields come ENTIRELY from the format's ref_id_path config
        // (comma-separated, e.g. "ORG_ID,ORDER_YEAR"). Nothing about the
        // business key is hardcoded: a format with no ref_id_path gets no
        // old→new diff (old stays null) until an admin configures it.
        let keyFields: string[] = []
        if (formatName) {
          const f = await prisma.messageFormat.findFirst({
            where: { name: formatName as string },
            select: { refIdPath: true },
          })
          keyFields = f?.refIdPath?.split(',').map(s => s.trim().replace(/^\$\.?/, '')).filter(Boolean) ?? []
        }
        if (keyFields.length && keyFields.every(k => nvObj[k] !== undefined && nvObj[k] !== null)) {
          const conds: any[] = keyFields.map(k => ({ newValues: { path: [k], equals: nvObj[k] as any } }))
          if (formatName) conds.push({ changes: { path: ['formatName'], equals: formatName } })
          const prev = await prisma.auditLog.findFirst({
            where: { entityType: body.entityType || 'API', AND: conds },
            orderBy: { timestamp: 'desc' },
            select: { newValues: true },
          })
          const pn = prev?.newValues
          if (pn && typeof pn === 'object' && !Array.isArray(pn)) {
            const prevNew = pn as Record<string, unknown>
            for (const k of Object.keys(fc)) {
              const cell = (fc as Record<string, { old: unknown; new: unknown }>)[k]
              if (cell && typeof cell === 'object' && k in prevNew) cell.old = prevNew[k] ?? null
            }
            body.oldValues = prevNew
          }
        }
      }
    } catch (e) {
      console.warn('[Audit] diff-vs-previous (old values) failed:', e)
    }

    const log = await prisma.auditLog.create({
      data: {
        action: resolvedAction as any,
        entityType: body.entityType || 'API',
        entityId: body.entityId,
        userId: userId as string,
        userIp: body.userIp || body.clientIp,
        oldValues: body.oldValues,
        newValues: body.newValues,
        changes: body.changes,
        description,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      },
    })

    return NextResponse.json(log, { status: 201 })
  } catch (error) {
    console.error('Error creating audit log:', error)
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}
