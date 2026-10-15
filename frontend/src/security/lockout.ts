import { loadPolicy } from './policy'

const KEY = 'wms_login_lock'

interface LockEntry {
  fails: number
  until: number
}

function read(): Record<string, LockEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, LockEntry>
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function write(map: Record<string, LockEntry>) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

function nameOf(username: string) {
  return username.trim()
}

function current(username: string, now = Date.now()) {
  const name = nameOf(username)
  const map = read()
  const entry = name ? map[name] : undefined
  if (!entry || (entry.until > 0 && entry.until <= now)) return { map, name, entry: undefined as LockEntry | undefined }
  return { map, name, entry }
}

export function lockRemainMs(username: string, now = Date.now()) {
  const { entry } = current(username, now)
  if (!entry?.until || entry.until <= now) return 0
  return entry.until - now
}

export function lockHintText(username: string, now = Date.now()) {
  const remain = lockRemainMs(username, now)
  if (remain <= 0) return ''
  const total = Math.ceil(remain / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `账号已锁定，请 ${minutes} 分 ${seconds} 秒后再试`
}

export function noteLoginSuccess(username: string) {
  const { map, name } = current(username)
  if (!name || !map[name]) return
  delete map[name]
  write(map)
}

export function noteLoginFailure(username: string, serverMessage: string) {
  const name = nameOf(username)
  const message = serverMessage || '账号或密码不正确'
  if (!name || /验证码/.test(message) || /无法连接/.test(message)) return message
  const policy = loadPolicy()
  const { map, entry } = current(name)
  if (map[name] && !entry) delete map[name]
  if (/锁定/.test(message)) {
    const until = Date.now() + policy.lockMinutes * 60_000
    map[name] = { fails: policy.maxRetry, until: Math.max(entry?.until || 0, until) }
    write(map)
    return message
  }
  const fails = (entry?.fails || 0) + 1
  if (fails >= policy.maxRetry) {
    map[name] = { fails, until: Date.now() + policy.lockMinutes * 60_000 }
    write(map)
    return `连续登录失败已达 ${policy.maxRetry} 次，账号锁定 ${policy.lockMinutes} 分钟`
  }
  map[name] = { fails, until: 0 }
  write(map)
  return `${message}，还可尝试 ${policy.maxRetry - fails} 次`
}
