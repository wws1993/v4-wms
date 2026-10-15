import axios, { type AxiosRequestConfig } from 'axios'

const TOKEN_KEY = 'wms_token'

export function readToken() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function writeToken(token: string) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
})

http.interceptors.request.use((config) => {
  const token = readToken()
  if (token) {
    const prefix = import.meta.env.VITE_TOKEN_PREFIX ?? 'Bearer '
    config.headers.Authorization = `${prefix}${token}`
  }
  return config
})

export interface RuoyiBody {
  code?: number
  msg?: string
  message?: string
  data?: unknown
  rows?: unknown[]
  total?: number
  token?: string
  img?: string
  uuid?: string
  captchaEnabled?: boolean
}

export interface RuoyiResult {
  ok: boolean
  message: string
  data: unknown
  rows: Record<string, unknown>[]
  total: number
  raw: RuoyiBody
}

function successCode(code: number | undefined) {
  return code === undefined || code === 200 || code === 0
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[]
}

export function parseBody(body: RuoyiBody, path: string): RuoyiResult {
  const code = body.code
  const message = body.msg || body.message || (successCode(code) ? 'ok' : '请求失败')
  if (code === 401 && path !== '/login' && path !== '/captchaImage' && path !== '/logout') {
    writeToken('')
    sessionStorage.removeItem('wms_auth')
    sessionStorage.removeItem('wms_session_at')
    if (!window.location.pathname.endsWith('/login')) window.location.assign('/login?reason=expired')
  }
  const rows = asRows(body.rows ?? (Array.isArray(body.data) ? body.data : undefined))
  return {
    ok: successCode(code),
    message,
    data: body.data,
    rows,
    total: Number(body.total ?? rows.length),
    raw: body,
  }
}

async function call(config: AxiosRequestConfig): Promise<RuoyiResult> {
  const path = String(config.url || '')
  try {
    const response = await http.request<RuoyiBody>(config)
    return parseBody(response.data || {}, path)
  } catch (error) {
    const response = axios.isAxiosError(error) ? error.response : undefined
    if (response?.data && typeof response.data === 'object') return parseBody(response.data as RuoyiBody, path)
    return { ok: false, message: '无法连接丰联服务', data: null, rows: [], total: 0, raw: {} }
  }
}

export function ruoyiGet(url: string, params?: Record<string, unknown>) {
  return call({ url, method: 'GET', params })
}

export function ruoyiSend(method: 'POST' | 'PUT' | 'DELETE', url: string, data?: unknown, params?: Record<string, unknown>) {
  return call({ url, method, data, params })
}

export function ruoyiBlob(url: string, params?: Record<string, unknown>) {
  return http.request<Blob>({ url, method: 'POST', params, responseType: 'blob' })
}
