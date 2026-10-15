import { loadPolicy } from './policy'

const KEY = 'wms_session_at'

export const SESSION_WARN_MS = 60_000

export function touchSession() {
  sessionStorage.setItem(KEY, String(Date.now()))
}

export function clearSessionClock() {
  sessionStorage.removeItem(KEY)
}

export function sessionRemainMs(now = Date.now()) {
  const at = Number(sessionStorage.getItem(KEY) || 0)
  const idle = loadPolicy().idleMinutes * 60_000
  if (!at) return idle
  return idle - (now - at)
}

export function sessionExpired(now = Date.now()) {
  const at = Number(sessionStorage.getItem(KEY) || 0)
  if (!at) return false
  return sessionRemainMs(now) <= 0
}
