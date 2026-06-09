// ==========================================
// Project Environment variable interpolation
// ==========================================
//
// Allows admins to write `${env.<key>}` placeholders in fields like
// Project.proxyTargetUrl / Project.apiKey / ApiRegistration.backendUrl
// and have them resolved at request time against the per-project
// SystemConfig rows (the "Environment" tab on the project page).
//
// This decouples DEV/SIT/UAT/PROD config: keep the same template
// values across environments, swap the env values per cluster.

import { prisma } from './prisma'

/** Load every project-scoped SystemConfig key/value as a flat map. */
export async function loadProjectEnvs(
  projectId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.systemConfig.findMany({
    where: { projectId },
    select: { key: true, value: true },
  })
  const map = new Map<string, string>()
  for (const r of rows) {
    const v = r.value as unknown
    // SystemConfig.value is Json; coerce non-string into a string so
    // template substitution always inserts something printable.
    map.set(r.key, typeof v === 'string' ? v : JSON.stringify(v))
  }
  return map
}

/**
 * Substitute `${env.<key>}` placeholders. Unknown keys are left as-is
 * (so admins notice a typo instead of silently inserting an empty
 * string and producing a broken backend URL). Pass-through for null /
 * undefined / empty inputs.
 */
export function interpolateEnv(
  template: string | null | undefined,
  envs: Map<string, string>,
): string {
  if (!template) return template ?? ''
  return template.replace(/\$\{env\.([\w.-]+)\}/g, (match, key) => {
    const v = envs.get(key)
    return v !== undefined ? v : match
  })
}

/** Convenience: interpolate every value of an object that's a string. */
export function interpolateEnvObject<T extends Record<string, unknown>>(
  obj: T,
  envs: Map<string, string>,
): T {
  const out: Record<string, unknown> = { ...obj }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = interpolateEnv(v, envs)
    }
  }
  return out as T
}
