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

/** 丰联 `passwordComplexity`：1 大写、2 小写、3 数字、4 特殊字符，逗号分隔 */
export function encodeComplexity(policy: Pick<SecurityPolicy, 'requireUpper' | 'requireLower' | 'requireDigit' | 'requireSpecial'>) {
  const codes: string[] = []
  if (policy.requireUpper) codes.push('1')
  if (policy.requireLower) codes.push('2')
  if (policy.requireDigit) codes.push('3')
  if (policy.requireSpecial) codes.push('4')
  return codes.join(',')
}

export function decodeComplexity(raw: unknown): Pick<SecurityPolicy, 'requireUpper' | 'requireLower' | 'requireDigit' | 'requireSpecial'> {
  if (raw == null) {
    return {
      requireUpper: DEFAULT_POLICY.requireUpper,
      requireLower: DEFAULT_POLICY.requireLower,
      requireDigit: DEFAULT_POLICY.requireDigit,
      requireSpecial: DEFAULT_POLICY.requireSpecial,
    }
  }
  const text = String(raw).trim()
  if (!text) {
    return { requireUpper: false, requireLower: false, requireDigit: false, requireSpecial: false }
  }
  const tokens = /[,|，\s]/.test(text)
    ? text.split(/[,|，\s]+/).map((item) => item.trim()).filter(Boolean)
    : text.split('')
  const set = new Set(tokens)
  return {
    requireUpper: set.has('1'),
    requireLower: set.has('2'),
    requireDigit: set.has('3'),
    requireSpecial: set.has('4'),
  }
}

export function policyFromParams(row: Partial<SecurityPolicy> & Record<string, unknown>): SecurityPolicy {
  const complexity = decodeComplexity(row.passwordComplexity)
  const flag = (key: keyof SecurityPolicy, fallback: boolean) => {
    const value = row[key]
    if (value == null) return fallback
    return value !== false && value !== '0' && value !== 0
  }
  return normalizePolicy({
    minLength: row.minLength ?? row.passwordLength as number | undefined,
    requireUpper: flag('requireUpper', complexity.requireUpper),
    requireLower: flag('requireLower', complexity.requireLower),
    requireDigit: flag('requireDigit', complexity.requireDigit),
    requireSpecial: flag('requireSpecial', complexity.requireSpecial),
    maxRetry: row.maxRetry ?? row.passwordErrorNum as number | undefined,
    lockMinutes: row.lockMinutes ?? row.accountLockTime as number | undefined,
    idleMinutes: row.idleMinutes ?? row.sessionFreeTime as number | undefined,
  })
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
