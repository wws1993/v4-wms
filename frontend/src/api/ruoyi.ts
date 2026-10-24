import axios, { type AxiosRequestConfig } from 'axios'

/** sessionStorage 中存放登录 token 的键名 */
const TOKEN_KEY = 'wms_token'

/** 读取当前登录 token。 */
export function readToken() {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

/** 写入或清空登录 token。 */
export function writeToken(token: string) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

/** 雪花 id 超过 JS 安全整数。只给 JSON 数值加引号，字符串里的编号（如逗号拼接的账册 id）保持原样。 */
function quoteBigInts(data: string) {
  let out = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < data.length; index += 1) {
    const char = data[index]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      let end = index
      if (data[end] === '-') end += 1
      const digitsAt = end
      while (end < data.length && data[end] >= '0' && data[end] <= '9') end += 1
      const digits = end - digitsAt
      const next = data[end] || ''
      let prev = index - 1
      while (prev >= 0 && /\s/.test(data[prev])) prev -= 1
      const boundary = prev < 0 ? '' : data[prev]
      const value = boundary === ':' || boundary === '[' || boundary === ','
      if (value && digits >= 16 && next !== '.' && next.toLowerCase() !== 'e') out += `"${data.slice(index, end)}"`
      else out += data.slice(index, end)
      index = end - 1
      continue
    }
    out += char
  }
  return out
}

/** 解析响应体 JSON，并对超长整数做安全处理。 */
function parseJson(data: unknown) {
  if (typeof data !== 'string' || !data) return data
  try {
    return JSON.parse(quoteBigInts(data))
  } catch {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
}

/** 丰联/若依 axios 实例 */
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
  transformResponse: [parseJson],
})

http.interceptors.request.use((config) => {
  const token = readToken()
  if (token) {
    const prefix = import.meta.env.VITE_TOKEN_PREFIX ?? 'Bearer '
    config.headers.Authorization = `${prefix}${token}`
  }
  return config
})

/** 若依原始响应体结构 */
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

/**
 * 解析后的若依请求结果。
 * @typeParam TRow 列表行类型（通常为 OpenAPI *Vo）
 * @typeParam TData data 字段类型
 */
export interface RuoyiResult<TRow = Record<string, unknown>, TData = unknown> {
  ok: boolean
  message: string
  data: TData
  rows: TRow[]
  total: number
  raw: RuoyiBody
}

/** 判断业务 code 是否表示成功。 */
function successCode(code: number | undefined) {
  return code === undefined || code === 200 || code === 0
}

/** 将未知值过滤为对象行数组。 */
function asRows<TRow>(value: unknown): TRow[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object') as TRow[]
}

/**
 * 将若依原始 body 解析为统一结果；401 时清会话并跳转登录。
 * @typeParam TRow 列表行类型
 * @typeParam TData data 字段类型
 */
export function parseBody<TRow = Record<string, unknown>, TData = unknown>(
  body: RuoyiBody,
  path: string,
): RuoyiResult<TRow, TData> {
  const code = body.code
  const message = body.msg || body.message || (successCode(code) ? 'ok' : '请求失败')
  if (code === 401 && path !== '/login' && path !== '/captchaImage' && path !== '/logout') {
    writeToken('')
    sessionStorage.removeItem('wms_auth')
    sessionStorage.removeItem('wms_session_at')
    if (!window.location.pathname.endsWith('/login')) window.location.assign('/login?reason=expired')
  }
  const nested = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
    ? body.data as { rows?: unknown; records?: unknown; list?: unknown }
    : undefined
  const rows = asRows<TRow>(body.rows ?? (Array.isArray(body.data) ? body.data : undefined) ?? nested?.rows ?? nested?.records ?? nested?.list)
  return {
    ok: successCode(code),
    message,
    data: body.data as TData,
    rows,
    total: Number(body.total ?? rows.length),
    raw: body,
  }
}

/** 发起一次若依 HTTP 请求并解析结果。 */
async function call<TRow = Record<string, unknown>, TData = unknown>(
  config: AxiosRequestConfig,
): Promise<RuoyiResult<TRow, TData>> {
  const path = String(config.url || '')
  try {
    const response = await http.request<RuoyiBody>(config)
    return parseBody<TRow, TData>(response.data || {}, path)
  } catch (error) {
    const response = axios.isAxiosError(error) ? error.response : undefined
    if (response?.data && typeof response.data === 'object') {
      return parseBody<TRow, TData>(response.data as RuoyiBody, path)
    }
    return { ok: false, message: '无法连接丰联服务', data: null as TData, rows: [], total: 0, raw: {} }
  }
}

/**
 * 若依 GET 请求。
 * @typeParam TRow 列表行类型（OpenAPI *Vo）
 * @typeParam TData data 字段类型
 */
export function ruoyiGet<TRow = Record<string, unknown>, TData = unknown>(
  url: string,
  params?: Record<string, unknown>,
) {
  return call<TRow, TData>({ url, method: 'GET', params })
}

/**
 * 若依 POST / PUT / DELETE 请求。
 * @typeParam TRow 列表行类型
 * @typeParam TData data 字段类型
 */
export function ruoyiSend<TRow = Record<string, unknown>, TData = unknown>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
  params?: Record<string, unknown>,
) {
  return call<TRow, TData>({ url, method, data, params })
}

/** 以 blob 形式 POST 下载文件。 */
export function ruoyiBlob(url: string, params?: Record<string, unknown>) {
  return http.request<Blob>({ url, method: 'POST', params, responseType: 'blob' })
}
