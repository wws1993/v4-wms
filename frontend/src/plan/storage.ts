import type { FloorPlan, PlanItem, PlanType } from '@/types'
import { defaultPlan } from './model'

/** 未放行丰联时的本地键。放行后服务器是来源，这里只缓存最近一次读回或上传成功的图。 */
export const FLOOR_PLAN_STORAGE_KEY = 'wws.floor-plan'

const TYPES = new Set<PlanType>(['warehouse', 'idle', 'office', 'zone', 'line', 'door', 'stack', 'road', 'bush'])

function num(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function itemOf(raw: unknown): PlanItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id || !TYPES.has(row.type as PlanType)) return null
  const item: PlanItem = {
    id: row.id,
    type: row.type as PlanType,
    name: typeof row.name === 'string' ? row.name : '',
    col: num(row.col, 0),
    row: num(row.row, 0),
    cols: Math.max(0.05, num(row.cols, 1)),
    rows: Math.max(0.05, num(row.rows, 1)),
  }
  if (typeof row.color === 'string' && row.color) item.color = row.color
  const stackId = idText(row.stackId)
  const warehouseId = idText(row.warehouseId)
  if (stackId) item.stackId = stackId
  if (warehouseId) item.warehouseId = warehouseId
  if (typeof row.archiveCode === 'string' && row.archiveCode) item.archiveCode = row.archiveCode
  if (typeof row.areaLabel === 'string' && row.areaLabel) item.areaLabel = row.areaLabel
  if (typeof row.status === 'string' && row.status) item.status = row.status
  if (row.archive === true) item.archive = true
  const capacity = num(row.capacity, Number.NaN)
  const area = num(row.area, Number.NaN)
  if (Number.isFinite(capacity)) item.capacity = capacity
  if (Number.isFinite(area)) item.area = area
  return item
}

function idText(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function texts(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(idText).filter(Boolean)
}

/** 校验保存体或本地信封，非法则返回空。 */
export function parseFloorPlan(raw: unknown): FloorPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  const source = body.plan && typeof body.plan === 'object' ? body.plan as Record<string, unknown> : body
  if (!Array.isArray(source.items)) return null
  const base = defaultPlan()
  return {
    id: typeof source.id === 'string' && source.id ? source.id : 'park',
    gridPx: Math.max(8, Math.min(80, num(source.gridPx, base.gridPx))),
    gridCols: Math.max(1, Math.round(num(source.gridCols, base.gridCols))),
    gridRows: Math.max(1, Math.round(num(source.gridRows, base.gridRows))),
    items: source.items.map(itemOf).filter((item): item is PlanItem => item !== null),
    removedWarehouseIds: texts(source.removedWarehouseIds),
    removedWarehouseCodes: texts(source.removedWarehouseCodes),
    removedStackIds: texts(source.removedStackIds),
    removedStackCodes: texts(source.removedStackCodes),
  }
}

export function loadFloorPlan(): FloorPlan | null {
  try {
    const text = localStorage.getItem(FLOOR_PLAN_STORAGE_KEY)
    if (!text) return null
    return parseFloorPlan(JSON.parse(text))
  } catch {
    return null
  }
}

export function saveFloorPlan(raw: unknown): FloorPlan {
  const plan = parseFloorPlan(raw)
  if (!plan) throw new Error('平面图数据无效')
  localStorage.setItem(FLOOR_PLAN_STORAGE_KEY, JSON.stringify({
    savedAt: new Date().toISOString(),
    plan,
  }))
  return plan
}
