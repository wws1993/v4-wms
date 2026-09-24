import axios from 'axios'
import { handleMock } from '@/mock/handle'
import type { ApiResult } from '@/types'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 20000,
})

export async function request<T = unknown>(
  method: string,
  url: string,
  options?: { params?: Record<string, unknown>; body?: unknown },
): Promise<ApiResult<T>> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return handleMock(method, url, options?.body, options?.params) as ApiResult<T>
  }
  const response = await http.request<ApiResult<T>>({
    method,
    url,
    params: options?.params,
    data: options?.body,
  })
  return response.data
}
