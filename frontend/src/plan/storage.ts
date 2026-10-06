import type { FloorPlan, PlanItem, PlanType } from '@/types'
import { defaultPlan } from './model'

/** 对接后端前的本地键。后端就绪后由 `VITE_USE_MOCK=false` 改走 `GET/PUT /floor-plans`。 */
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
    cols: Math.max(1, num(row.cols, 1)),
    rows: Math.max(1, num(row.rows, 1)),
  }
  if (typeof row.color === 'string' && row.color) item.color = row.color
  return item
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
