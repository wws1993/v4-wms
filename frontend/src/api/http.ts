import { fail } from '@/api/result'
import type { ApiResult } from '@/types'
import { dispatch } from '@/api-map'

export async function request<T = unknown>(
  method: string,
  url: string,
  options?: { params?: Record<string, unknown>; body?: unknown },
): Promise<ApiResult<T>> {
  const live = await dispatch(method, url, options?.body, options?.params)
  if (live) return live as ApiResult<T>
  return fail('接口未提供') as ApiResult<T>
}
