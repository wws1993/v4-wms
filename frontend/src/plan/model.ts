import type { FloorPlan, PlanItem, PlanType } from '@/types'

/** 平面图填色。仓库 / 门 / 堆位取 UI 设计写明的色值，其余区域用第 2 节色板。 */
export const PLAN_COLORS: Record<PlanType, string> = {
  warehouse: '#F8E4C5',
  idle: '#E4E8EE',
  office: '#D6E4F2',
  zone: '#E5F2EA',
  line: '#D9E8F6',
  door: '#9EBCE9',
  stack: '#FFFFFF',
  road: '#D8DEE8',
  bush: '#2E7D4F',
}

export const PLAN_STROKE: Record<PlanType, string> = {
  warehouse: '#D8DEE8',
  idle: '#D8DEE8',
  office: '#1B4F8A',
  zone: '#2E7D4F',
  line: '#2F80C4',
  door: '#1B4F8A',
  stack: '#2F80C4',
  road: '#5A6A7E',
  bush: '#2E7D4F',
}

export const PLAN_TOOLS: { type: PlanType | 'select'; label: string }[] = [
  { type: 'select', label: '选择' },
  { type: 'warehouse', label: '仓库' },
  { type: 'idle', label: '停用仓库' },
  { type: 'office', label: '办公楼' },
  { type: 'zone', label: '功能区' },
  { type: 'line', label: '生产线' },
  { type: 'door', label: '门' },
  { type: 'stack', label: '堆位' },
  { type: 'road', label: '道路' },
  { type: 'bush', label: '灌木' },
]

const Z: Record<PlanType, number> = {
  bush: 0, road: 1, office: 2, idle: 2, warehouse: 2, zone: 2, line: 3, stack: 4, door: 5,
}

export function planFill(item: PlanItem) {
  if (item.type === 'stack') return '#ffffff'
  if (item.type === 'road' || item.type === 'bush') return `url(#plan-${item.type})`
  return item.color || PLAN_COLORS[item.type]
}

export function planStroke(item: PlanItem) {
  return PLAN_STROKE[item.type]
}

export interface PlanPaint {
  fill: string
  opacity: number
  stroke: string
  dash?: string
  label: string
}

/** 驾驶舱按 Figma「仓库堆位示意图」填色；平面图设置仍用第 2 节浅色。 */
export function planPaint(item: PlanItem, theme: 'editor' | 'cockpit'): PlanPaint {
  if (theme !== 'cockpit') {
    return {
      fill: planFill(item),
      opacity: item.type === 'warehouse' || item.type === 'idle' ? 0.94 : 1,
      stroke: PLAN_STROKE[item.type],
      dash: item.type === 'stack' ? '0.18 0.12' : undefined,
      label: item.type === 'idle' ? '#5A6A7E' : '#1A2332',
    }
  }
  if (item.type === 'road') return { fill: 'url(#plan-road-cockpit)', opacity: 1, stroke: 'none', label: '#ffffff' }
  if (item.type === 'bush') return { fill: 'url(#plan-bush-cockpit)', opacity: 1, stroke: 'none', label: '#ffffff' }
  if (item.type === 'line') {
    const hatch = item.name.includes('成品')
      ? 'url(#plan-hatch-gold)'
      : item.name.includes('筛') ? 'url(#plan-hatch-slate)' : 'url(#plan-hatch-mix)'
    return { fill: hatch, opacity: 1, stroke: 'none', label: '#ffffff' }
  }
  if (item.type === 'zone') {
    return {
      fill: item.name.includes('卫生') ? 'rgba(93,218,116,0.16)' : 'url(#plan-hatch-slate)',
      opacity: 1,
      stroke: 'none',
      label: '#ffffff',
    }
  }
  const dark: Partial<Record<PlanType, PlanPaint>> = {
    warehouse: { fill: '#373e52', opacity: 0.6, stroke: '#ffffff', label: '#ffffff' },
    idle: { fill: '#373e52', opacity: 0.35, stroke: 'rgba(255,255,255,0.4)', label: '#ffffff' },
    office: { fill: '#3d4c66', opacity: 0.72, stroke: 'rgba(255,255,255,0.55)', label: '#ffffff' },
    door: { fill: '#62646e', opacity: 0.5, stroke: 'none', label: '#ffffff' },
    stack: { fill: '#566286', opacity: 0.3, stroke: 'none', label: '#ffffff' },
  }
  return dark[item.type] || { fill: '#373e52', opacity: 0.5, stroke: 'rgba(255,255,255,0.35)', label: '#ffffff' }
}

export function cargoStyle(consignor: string, cargoType: string) {
  const standard = cargoType.includes('达标')
  if (cargoType.includes('混成')) return { fill: '#a88354', opacity: 0.7, stroke: 'none' }
  if (consignor.includes('五矿')) return { fill: '#c87348', opacity: 0.7, stroke: standard ? '#5aed95' : 'none' }
  if (consignor.includes('南国')) return { fill: '#2e80d9', opacity: 0.7, stroke: standard ? '#5aed95' : 'none' }
  if (consignor.includes('金川')) return { fill: '#30b0c7', opacity: standard ? 0.7 : 0.6, stroke: standard ? '#5aed95' : 'none' }
  return { fill: '#566286', opacity: 0.45, stroke: 'none' }
}

export function planLabel(item: PlanItem) {
  if (item.type === 'warehouse' || item.type === 'idle') return ''
  return item.name.replace(/^\d+#/, '')
}

export function warehouseMark(item: PlanItem) {
  const matched = item.name.match(/(\d+|码头)/)
  if (!matched) return item.name
  return matched[1] === '码头' ? '码头' : `${matched[1]}#`
}

export function sortPlanItems(items: PlanItem[]) {
  return items.slice().sort((a, b) => Z[a.type] - Z[b.type])
}

export function hostOf(item: PlanItem, items: PlanItem[]) {
  const cx = item.col + item.cols / 2
  const cy = item.row + item.rows / 2
  return items.find((host) => (
    (host.type === 'warehouse' || host.type === 'idle')
    && cx >= host.col && cx <= host.col + host.cols
    && cy >= host.row && cy <= host.row + host.rows
  ))
}

export function cargoColor(consignor: string, cargoType: string) {
  return cargoStyle(consignor, cargoType).fill
}

export interface CargoLot {
  stackText: string
  warehouse: string
  consignor: string
  cargoType: string
  wet: number
  status: string
}

export function lotsOnStack(item: PlanItem, items: PlanItem[], lots: CargoLot[]) {
  const host = hostOf(item, items)
  if (!host || item.type !== 'stack') return []
  const key = `${host.name.replace(/仓库|仓/g, '')}#${item.name.replace(/^\d+#/, '')}`
  return lots.filter((lot) => lot.status === '在库' && lot.stackText === key)
}

function block(type: PlanType, name: string, col: number, row: number, cols: number, rows: number): PlanItem {
  return { id: `fp-${type}-${name}-${col}-${row}`, type, name, col, row, cols, rows }
}

export function defaultPlan(): FloorPlan {
  const items: PlanItem[] = [
    block('bush', '灌木', 0, 0, 42, 1),
    block('office', '办公楼', 1, 1, 8, 4),
    block('bush', '灌木', 10, 2, 20, 2),
    block('idle', '3仓', 33, 1, 8, 4),
    block('road', '主干道', 0, 6, 42, 2),
    block('warehouse', '1仓', 1, 9, 8, 8),
    block('warehouse', '2仓', 11, 9, 8, 8),
    block('warehouse', '4仓', 22, 9, 19, 8),
    block('road', '次干道', 0, 17, 42, 1),
    block('warehouse', '5仓', 1, 18, 17, 7),
    block('warehouse', '6仓', 22, 18, 19, 7),
    block('road', '南北干道', 20, 6, 2, 19),
    block('line', '混矿线', 23, 10, 16, 1),
    block('line', '筛分线', 2, 19, 14, 1),
    block('line', '成品线', 23, 19, 16, 1),
    block('stack', 'A1', 2, 11, 3, 3),
    block('stack', 'A2', 5, 11, 3, 3),
    block('stack', 'B1', 2, 15, 3, 2),
    block('stack', 'B2', 5, 15, 3, 2),
    block('stack', 'A1', 12, 11, 3, 3),
    block('stack', 'A2', 15, 11, 3, 3),
    block('stack', 'B1', 12, 15, 3, 2),
    block('stack', 'B2', 15, 15, 3, 2),
    block('stack', 'A1', 23, 12, 4, 3),
    block('stack', 'B1', 28, 12, 4, 3),
    block('stack', 'A1', 2, 21, 4, 3),
    block('stack', 'A1', 23, 21, 4, 3),
    block('door', '1号门', 2, 9, 2, 1),
    block('door', '2号门', 5, 9, 2, 1),
    block('door', '1号门', 12, 9, 2, 1),
    block('door', '2号门', 15, 9, 2, 1),
    block('door', '1号门', 24, 9, 2, 1),
    block('door', '2号门', 28, 9, 2, 1),
    block('door', '3号门', 34, 9, 2, 1),
    block('door', '1号门', 3, 18, 2, 1),
    block('door', '2号门', 8, 18, 2, 1),
    block('door', '1号门', 24, 18, 2, 1),
    block('door', '2号门', 30, 18, 2, 1),
  ]
  return { id: 'park', gridCols: 42, gridRows: 26, items }
}

export function presetSize(type: PlanType) {
  if (type === 'door') return { cols: 2, rows: 1 }
  if (type === 'road') return { cols: 8, rows: 1 }
  if (type === 'bush') return { cols: 4, rows: 1 }
  if (type === 'line') return { cols: 6, rows: 1 }
  if (type === 'stack') return { cols: 3, rows: 3 }
  if (type === 'warehouse' || type === 'idle') return { cols: 8, rows: 6 }
  return { cols: 4, rows: 3 }
}
