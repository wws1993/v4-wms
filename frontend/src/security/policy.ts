const KEY = 'wms_security_policy'

export interface SecurityPolicy {
  minLength: number
  requireUpper: boolean
  requireLower: boolean
  requireDigit: boolean
  requireSpecial: boolean
  maxRetry: number
  lockMinutes: number
  idleMinutes: number
}

export const DEFAULT_POLICY: SecurityPolicy = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
  maxRetry: 5,
  lockMinutes: 10,
  idleMinutes: 30,
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

export function normalizePolicy(input: Partial<SecurityPolicy>): SecurityPolicy {
  return {
    minLength: clamp(input.minLength, 8, 32, DEFAULT_POLICY.minLength),
    requireUpper: input.requireUpper !== false,
    requireLower: input.requireLower !== false,
    requireDigit: input.requireDigit !== false,
    requireSpecial: input.requireSpecial !== false,
    maxRetry: clamp(input.maxRetry, 3, 10, DEFAULT_POLICY.maxRetry),
    lockMinutes: clamp(input.lockMinutes, 1, 120, DEFAULT_POLICY.lockMinutes),
    idleMinutes: clamp(input.idleMinutes, 5, 480, DEFAULT_POLICY.idleMinutes),
  }
}

export function loadPolicy(): SecurityPolicy {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<SecurityPolicy> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_POLICY }
    return normalizePolicy({ ...DEFAULT_POLICY, ...raw })
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

export function savePolicy(input: SecurityPolicy) {
  const policy = normalizePolicy(input)
  localStorage.setItem(KEY, JSON.stringify(policy))
  return policy
}

export function passwordRuleText(policy = loadPolicy()) {
  const kinds = [
    policy.requireUpper ? '大写字母' : '',
    policy.requireLower ? '小写字母' : '',
    policy.requireDigit ? '数字' : '',
    policy.requireSpecial ? '特殊字符' : '',
  ].filter(Boolean)
  const complexity = kinds.length ? `，并包含${kinds.join('、')}` : ''
  return `${policy.minLength}–32 位${complexity}`
}

export function passwordIssue(raw: unknown, policy = loadPolicy()) {
  const password = String(raw ?? '')
  if (!password) return ''
  const missing: string[] = []
  if (password.length < policy.minLength || password.length > 32) missing.push(`${policy.minLength}–32 位`)
  if (policy.requireUpper && !/[A-Z]/.test(password)) missing.push('大写字母')
  if (policy.requireLower && !/[a-z]/.test(password)) missing.push('小写字母')
  if (policy.requireDigit && !/\d/.test(password)) missing.push('数字')
  if (policy.requireSpecial && !/[^A-Za-z0-9\s]/.test(password)) missing.push('特殊字符')
  if (!missing.length) return ''
  const length = missing.find((item) => item.endsWith('位'))
  const kinds = missing.filter((item) => item !== length)
  if (length && kinds.length) return `密码须为 ${length}，并包含${kinds.join('、')}`
  if (length) return `密码须为 ${length}`
  return `密码须包含${kinds.join('、')}`
}
