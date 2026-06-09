import { createId } from '@paralleldrive/cuid2'

export function generateCuid(): string {
  return createId()
}

export function generateCuidWithPrefix(prefix: string): string {
  return `${prefix}_${createId()}`
}
