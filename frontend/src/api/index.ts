import { request } from './http'
import type { AuthUser, FloorPlan, PageResult } from '@/types'

type Q = Record<string, unknown>
type B = Record<string, unknown>
type Page = ApiPage
interface ApiPage extends PageResult<Record<string, unknown>> {}
interface FilePayload { filename: string; content: string }

export const authApi = {
  login: (body: B) => request<AuthUser>('POST', '/auth/login', { body }),
  logout: () => request('POST', '/auth/logout'),
  users: (params: Q) => request<Page>('GET', '/auth/users', { params }),
  createUser: (body: B) => request('POST', '/auth/users', { body }),
  updateUser: (id: string, body: B) => request('PUT', `/auth/users/${id}`, { body }),
  permissions: () => request<Record<string, string[]>>('GET', '/roles/permissions'),
  savePermissions: (role: string, pages: string[]) => request('PUT', `/roles/${role}/permissions`, { body: { pages } }),
}

export const settingsApi = {
  get: () => request<Record<string, unknown>>('GET', '/settings/params'),
  save: (body: B) => request('PUT', '/settings/params', { body }),
}

export const warehouseApi = {
  list: (params: Q) => request<Page>('GET', '/warehouses', { params }),
  create: (body: B) => request('POST', '/warehouses', { body }),
  update: (id: string, body: B) => request('PUT', `/warehouses/${id}`, { body }),
  stacks: (params: Q) => request<Page>('GET', '/warehouses/stacks', { params }),
  createStack: (body: B) => request('POST', '/warehouses/stacks', { body }),
  updateStack: (id: string, body: B) => request('PUT', `/warehouses/stacks/${id}`, { body }),
}

export const materialApi = {
  list: (params: Q) => request<Page>('GET', '/materials', { params }),
  create: (body: B) => request('POST', '/materials', { body }),
  update: (id: string, body: B) => request('PUT', `/materials/${id}`, { body }),
  exportRows: () => request<FilePayload>('GET', '/materials/export'),
  filings: (params: Q) => request<Page>('GET', '/material-sources/filings', { params }),
  createFiling: (body: B) => request('POST', '/material-sources/filings', { body }),
  exportFilings: () => request<FilePayload>('GET', '/material-sources/filings/export'),
  lots: (code: string) => request<Record<string, unknown>[]>('GET', `/material-sources/filings/${encodeURIComponent(code)}/lots`),
  exportLots: (code: string) => request<FilePayload>('GET', `/material-sources/filings/${encodeURIComponent(code)}/lots/export`),
}

export const partnerApi = {
  list: (params: Q) => request<Page>('GET', '/partners', { params }),
  create: (body: B) => request('POST', '/partners', { body }),
  update: (id: string, body: B) => request('PUT', `/partners/${id}`, { body }),
  consignors: () => request<string[]>('GET', '/partners/consignors'),
}

export const bondedApi = {
  list: (params: Q) => request<Page>('GET', '/bonded-books', { params }),
  create: (body: B) => request('POST', '/bonded-books', { body }),
  update: (id: string, body: B) => request('PUT', `/bonded-books/${id}`, { body }),
  lots: (code: string) => request<Record<string, unknown>[]>('GET', `/bonded-books/${encodeURIComponent(code)}/lots`),
  exportLots: (code: string) => request<FilePayload>('GET', `/bonded-books/${encodeURIComponent(code)}/lots/export`),
}

export const floorApi = {
  get: () => request<FloorPlan>('GET', '/floor-plans'),
  save: (body: FloorPlan) => request('PUT', '/floor-plans', { body }),
}

export const dashboardApi = {
  cockpit: () => request<Record<string, unknown>>('GET', '/dashboard/cockpit'),
}

export const inboundApi = {
  list: (params: Q) => request<Page>('GET', '/inbound', { params }),
  create: (body: B) => request('POST', '/inbound', { body }),
  update: (id: string, body: B) => request('PUT', `/inbound/${id}`, { body }),
}

export const transferApi = {
  list: (params: Q) => request<Page>('GET', '/transfers', { params }),
  create: (body: B) => request('POST', '/transfers', { body }),
  batch: (body: B) => request<{ count: number }>('POST', '/transfers/batch', { body }),
}

export const inventoryApi = {
  list: (params: Q) => request<Page>('GET', '/inventory', { params }),
  detail: (batchNo: string) => request<Record<string, unknown>>('GET', `/inventory/batches/${encodeURIComponent(batchNo)}`),
  alerts: (params: Q) => request<Page>('GET', '/inventory/alerts', { params }),
}

export const stocktakeApi = {
  list: (params: Q) => request<Page>('GET', '/stocktakes', { params }),
  create: (body: B) => request('POST', '/stocktakes', { body }),
  exportMonth: (month: string) => request<FilePayload>('GET', '/stocktakes/onhand-export', { params: { month } }),
}

export const productionApi = {
  list: (params: Q) => request<Page>('GET', '/production', { params }),
  create: (body: B) => request('POST', '/production', { body }),
  detail: (batchNo: string) => request<Record<string, unknown>>('GET', `/production/${encodeURIComponent(batchNo)}`),
  complete: (id: string, stackCode: string) => request('POST', `/production/${id}/complete`, { body: { stackCode } }),
  inspect: (id: string) => request('POST', `/production/${id}/inspect`),
}

export const outboundApi = {
  list: (params: Q) => request<Page>('GET', '/outbound', { params }),
  create: (body: B) => request('POST', '/outbound', { body }),
  update: (id: string, body: B) => request('PUT', `/outbound/${id}`, { body }),
  approve: (id: string) => request('POST', `/outbound/${id}/approve`),
}

export const customsApi = {
  list: (params: Q) => request<Page>('GET', '/customs/reconcile', { params }),
  details: (id: string) => request<Record<string, unknown>[]>('GET', `/customs/reconcile/${id}/details`),
  declare: () => request('POST', '/customs/declarations', { body: {} }),
  writeOff: () => request('POST', '/customs/bonded-books/write-off', { body: {} }),
}

export const ocrApi = {
  list: (params: Q) => request<Page>('GET', '/ocr/tasks', { params }),
  recognize: (body: B) => request('POST', '/ocr/recognize', { body }),
  update: (id: string, body: B) => request('PUT', `/ocr/tasks/${id}`, { body }),
}

export const auditApi = {
  list: (params: Q) => request<Page>('GET', '/audit-logs', { params }),
  detail: (id: string) => request<Record<string, unknown>>('GET', `/audit-logs/${id}`),
}
