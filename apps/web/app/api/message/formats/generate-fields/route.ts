import { NextRequest, NextResponse } from 'next/server'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

const generateFieldsSchema = z.object({
  jsonSample: z.string().or(z.record(z.string(), z.any())),
})

const SENSITIVE_KEYWORDS = [
  'password', 'secret', 'token', 'key', 'auth',
  'credential', 'ssn', 'credit', 'card', 'cvv', 'pin',
]

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

const MAX_DEPTH = 5

function inferFieldType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'string'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (typeof value === 'object') {
    return 'json'
  }

  if (typeof value === 'string') {
    if (EMAIL_REGEX.test(value)) {
      return 'email'
    }
    if (ISO_DATETIME_REGEX.test(value)) {
      return 'datetime'
    }
  }

  return 'string'
}

function isSensitive(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase()
  return SENSITIVE_KEYWORDS.some((keyword) => lowerName.includes(keyword))
}

function tryParseNestedJson(value: string): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // Not valid JSON
  }
  return null
}

export interface GeneratedField {
  id: string
  fieldName: string
  fieldPath: string
  fieldType: string
  sensitive: boolean
  isNestedJson?: boolean
  depth: number
  parentPath?: string
}

function flattenObject(
  obj: Record<string, unknown>,
  parentPath: string = '$',
  depth: number = 0,
  parentFieldPath?: string,
): GeneratedField[] {
  if (depth > MAX_DEPTH) return []

  const fields: GeneratedField[] = []

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = `${parentPath}.${key}`

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      fields.push(...flattenObject(value as Record<string, unknown>, currentPath, depth + 1, parentFieldPath))
    } else if (typeof value === 'string') {
      // Try to deep-parse nested JSON strings
      const nestedObj = tryParseNestedJson(value)
      if (nestedObj) {
        // Add the parent field itself as a "json" type with isNestedJson marker
        fields.push({
          id: createId(),
          fieldName: key,
          fieldPath: currentPath,
          fieldType: 'json',
          sensitive: isSensitive(key),
          isNestedJson: true,
          depth,
          parentPath: parentFieldPath,
        })
        // Recurse into the parsed nested JSON
        fields.push(...flattenObject(nestedObj, currentPath, depth + 1, currentPath))
      } else {
        // Regular string leaf
        fields.push({
          id: createId(),
          fieldName: key,
          fieldPath: currentPath,
          fieldType: inferFieldType(value),
          sensitive: isSensitive(key),
          depth,
          parentPath: parentFieldPath,
        })
      }
    } else {
      // Leaf node (number, boolean, array, null)
      fields.push({
        id: createId(),
        fieldName: key,
        fieldPath: currentPath,
        fieldType: inferFieldType(value),
        sensitive: isSensitive(key),
        depth,
        parentPath: parentFieldPath,
      })
    }
  }

  return fields
}

// POST /api/message/formats/generate-fields - Generate fields from JSON sample
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = generateFieldsSchema.parse(body)

    let jsonObj: Record<string, unknown>

    if (typeof validated.jsonSample === 'string') {
      try {
        jsonObj = JSON.parse(validated.jsonSample)
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON string' },
          { status: 400 }
        )
      }
    } else {
      jsonObj = validated.jsonSample
    }

    if (typeof jsonObj !== 'object' || jsonObj === null || Array.isArray(jsonObj)) {
      return NextResponse.json(
        { error: 'JSON sample must be an object' },
        { status: 400 }
      )
    }

    const fields = flattenObject(jsonObj)

    return NextResponse.json({ fields })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }

    console.error('Error generating fields:', error)
    return NextResponse.json({ error: 'Failed to generate fields' }, { status: 500 })
  }
}
