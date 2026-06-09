import { createId } from '@paralleldrive/cuid2'

export interface GeneratedField {
  id: string
  fieldName: string
  fieldPath: string
  fieldType: string
  sensitive: boolean
  description?: string
  required?: boolean
}

const SENSITIVE_KEYWORDS = [
  'password', 'secret', 'token', 'key', 'auth', 'credential',
  'ssn', 'credit', 'card', 'cvv', 'pin', 'private',
]

export function inferFieldType(value: unknown): string {
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'json'
  if (typeof value === 'string') {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email'
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) return 'datetime'
  }
  return 'string'
}

export function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase()
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export function flattenObject(
  obj: unknown,
  prefix: string = '$',
  results: GeneratedField[] = []
): GeneratedField[] {
  if (obj === null || obj === undefined) return results

  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      // Flatten first element as representative
      flattenObject(obj[0], `${prefix}[0]`, results)
    } else {
      const name = prefix.split('.').pop() || prefix
      results.push({
        id: createId(),
        fieldName: name.replace(/\[\d+\]$/, ''),
        fieldPath: prefix,
        fieldType: 'array',
        sensitive: isSensitiveField(name),
      })
    }
    return results
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix === '$' ? `$.${key}` : `${prefix}.${key}`

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        flattenObject(value, path, results)
      } else if (Array.isArray(value)) {
        flattenObject(value, path, results)
      } else {
        results.push({
          id: createId(),
          fieldName: key,
          fieldPath: path,
          fieldType: inferFieldType(value),
          sensitive: isSensitiveField(key),
        })
      }
    }
  }

  return results
}

export function generateFieldsFromJson(jsonSample: unknown): GeneratedField[] {
  const parsed = typeof jsonSample === 'string' ? JSON.parse(jsonSample) : jsonSample
  return flattenObject(parsed)
}
