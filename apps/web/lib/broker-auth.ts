// Headers for web → Orch Broker admin calls (deploy, workers, metrics).
// The broker requires X-Internal-Token on its admin routes whenever
// INTERNAL_API_TOKEN is set; without it those routes were open to anyone
// who could reach the broker port (or the /deploy/ nginx location).
export function brokerAuthHeaders(): Record<string, string> {
  const tok = process.env.INTERNAL_API_TOKEN
  return tok ? { 'X-Internal-Token': tok } : {}
}
