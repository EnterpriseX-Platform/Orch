'use client'

/**
 * Legacy URL — the real implementation lives in
 * `components/settings/SystemConfigPanel.tsx` and is also embedded inside
 * the Settings page as the "Environment" tab. This route is kept so that
 * bookmarks and direct links (e.g. `/orch/system-config`) still work.
 *
 * Consider adding a redirect to `/orch/settings?tab=env` if we ever drop
 * back-compat for the old URL.
 */
import { SystemConfigPanel } from '@/components/settings/SystemConfigPanel'

export default function SystemConfigPage() {
  return <SystemConfigPanel />
}
