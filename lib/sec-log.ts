/**
 * Lightweight structured security logger.
 * Writes JSON-serialisable objects to stderr so Vercel captures them
 * as structured log lines — no external services or new dependencies.
 */

type LogLevel = 'warn' | 'error'

interface SecurityEvent {
  event: string          // machine-readable slug, e.g. "ssrf_blocked"
  [key: string]: unknown // any extra context (ip, url, reason, …)
}

export function secLog(level: LogLevel, payload: SecurityEvent): void {
  const line = JSON.stringify({
    ts:    new Date().toISOString(),
    level,
    ...payload,
  })
  level === 'error' ? console.error(line) : console.warn(line)
}
