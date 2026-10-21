import type { Route } from '@/api-map/types'
import { defaultPlan, hostOf, stackCode } from '@/plan/model'
import { loadFloorPlan, parseFloorPlan, saveFloorPlan } from '@/plan/storage'
import type { FloorPlan } from '@/types'
import { clearSessionList, loadSessionList, SESSION_LIST } from '@/api/catalogCache'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend, type RuoyiResult } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { text } from '@/controller/shared/coerce'

let floorRecordId = ''
let floorRead: Promise<{ success: boolean; message: string; plan: FloorPlan | null }> | null = null

function floorRows(result: RuoyiResult) {
  const data = result.data
  if (Array.isArray(data)) return data as Row[]
  if (result.rows.length) return result.rows
  if (!data || typeof data !== 'object') return []
  const row = data as Row
  if (Array.isArray(row.records)) return row.records as Row[]
  if (Array.isArray(row.list)) return row.list as Row[]
  if (Array.isArray(row.rows)) return row.rows as Row[]
  if ('jsonData' in row) return [row]
  return []
}

function parseStoredPlan(value: unknown) {
  let current = value
  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    try { current = JSON.parse(current) } catch { return null }
  }
  return parseFloorPlan(current)
}

function newestFloor(rows: Row[]) {
  if (!rows.length) return undefined
  return [...rows].sort((a, b) => text(a.updateTime || a.createTime || a.id).localeCompare(text(b.updateTime || b.createTime || b.id)))[rows.length - 1]
}

function rememberFloor(plan: FloorPlan) {
  try { saveFloorPlan(plan) } catch { /* 配额不足时仍以服务器上的 JSON 为准 */ }
}

async function fetchFloorRows() {
  const listed = await loadSessionList(SESSION_LIST.floorPlan, SESSION_LIST.floorPlan, async () => {
    const result = await ruoyiGet('/wms/floorPlan/listNoPage')
    if (!result.ok) return { ok: false, rows: [] as Row[] }
    return { ok: true, rows: floorRows(result) }
  })
  if (!listed.ok) return { ok: false as const, message: '平面图列表读取失败', rows: [] as Row[] }
  return { ok: true as const, message: '', rows: listed.rows }
}

function clearFloorCache() {
  clearSessionList(SESSION_LIST.floorPlan)
  floorRead = null
}

async function publishFloor(plan: FloorPlan) {
  const jsonData = JSON.stringify(plan)
  const result = floorRecordId
    ? await ruoyiSend('PUT', '/wms/floorPlan', { id: floorRecordId, jsonData })
    : await ruoyiSend('POST', '/wms/floorPlan', { jsonData })
  if (!result.ok) return result
  clearFloorCache()
  const created = result.data && typeof result.data === 'object' ? text((result.data as Row).id) : text(result.data)
  if (created && created !== '[object Object]') floorRecordId = created
  else if (!floorRecordId) {
    const listed = await fetchFloorRows()
    const row = listed.ok ? newestFloor(listed.rows) : undefined
    if (row) floorRecordId = text(row.id)
  }
  rememberFloor(plan)
  return result
}

async function readFloorOnce() {
  const listed = await fetchFloorRows()
  if (!listed.ok) return { success: false, message: listed.message, plan: null as FloorPlan | null }
  const row = newestFloor(listed.rows)
  if (!row) {
    floorRecordId = ''
    const local = loadFloorPlan()
    if (local?.items.length) {
      const posted = await publishFloor(local)
      if (!posted.ok) return { success: false, message: posted.message, plan: null }
      return { success: true, message: posted.message, plan: local }
    }
    return { success: true, message: listed.message, plan: defaultPlan() }
  }
  floorRecordId = text(row.id)
  let source: unknown = row.jsonData
  if ((source == null || source === '') && floorRecordId) {
    const detail = await ruoyiGet(`/wms/floorPlan/${floorRecordId}`)
    if (!detail.ok) return { success: false, message: detail.message, plan: null }
    const body = detail.data && typeof detail.data === 'object' ? detail.data as Row : {}
    source = body.jsonData
  }
  const plan = parseStoredPlan(source) || (text(source) ? null : defaultPlan())
  if (!plan) return { success: false, message: '平面图数据无法解析', plan: null }
  rememberFloor(plan)
  return { success: true, message: listed.message, plan }
}

function readFloor() {
  if (!floorRead) floorRead = readFloorOnce().finally(() => { floorRead = null })
  return floorRead
}

async function loadFloor() {
  const loaded = await readFloor()
  if (!loaded.success || !loaded.plan) return fail(loaded.message || '平面图读取失败')
  return ok(loaded.plan)
}

async function saveFloor(body: Row) {
  const plan = parseFloorPlan(body)
  if (!plan) return fail('平面图数据无效')
  if (!floorRecordId) {
    const listed = await fetchFloorRows()
    if (!listed.ok) return fail(listed.message)
    const row = newestFloor(listed.rows)
    if (row) floorRecordId = text(row.id)
  }
  const saved = await publishFloor(plan)
  return saved.ok ? ok(plan, '平面图已保存') : fail(saved.message)
}

async function gridsFromPlan() {
  const loaded = await readFloor()
  const plan = loaded.plan || loadFloorPlan()
  const map = new Map<string, { grid: string; gridCols: number; gridRows: number }>()
  if (!plan) return map
  for (const item of plan.items) {
    if (item.type !== 'stack') continue
    const host = hostOf(item, plan.items)
    if (!host) continue
    const cols = Math.max(1, Math.round(item.cols))
    const rows = Math.max(1, Math.round(item.rows))
    const grid = { grid: `${cols}×${rows}`, gridCols: cols, gridRows: rows }
    if (item.stackId) map.set(item.stackId, grid)
    if (item.archiveCode) map.set(item.archiveCode, grid)
    const slot = item.name.replace(/^\d+#/, '').trim()
    if (slot) map.set(stackCode(host.name, slot), grid)
  }
  return map
}

export { gridsFromPlan, loadFloor, saveFloor }

export const floorRoutes: Route[] = [
  { method: 'GET', match: '/floor-plans', handle: () => loadFloor() },
  { method: 'PUT', match: '/floor-plans', handle: ({ body }) => saveFloor(body) },
]
