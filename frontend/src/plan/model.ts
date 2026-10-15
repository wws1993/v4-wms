import type { FloorPlan, PlanItem, PlanType } from '@/types'

/** 平面图填色，与驾驶舱仓库堆位示意图一致。 */
export const PLAN_COLORS: Record<PlanType, string> = {
  warehouse: '#373E5299',
  idle: '#373e5259',
  office: '#3d4c66',
  zone: '#5662864D',
  line: 'url(#plan-hatch-mix)',
  door: '#2e80d999',
  stack: '#5662864D',
  road: '#2a3140',
  bush: '#1a2820',
}

/** 快捷填色。实色带 60% 透明度，仓库、空闲堆位、预约金沿用原来的透明度。 */
export const PLAN_SWATCHES: { id: string; value: string; preview: string }[] = [
  { id: 'house', value: '#373E5299', preview: '#373E5299' },
  { id: 'stack', value: '#5662864D', preview: '#5662864D' },
  { id: 'door', value: '#62646e99', preview: '#62646e99' },
  { id: 'wukuang', value: '#c8734899', preview: '#c8734899' },
  { id: 'nanguo', value: '#2e80d999', preview: '#2e80d999' },
  { id: 'jinchuan', value: '#30b0c799', preview: '#30b0c799' },
  { id: 'blend', value: '#a8835499', preview: '#a8835499' },
  { id: 'green', value: '#3c9a6299', preview: '#3c9a6299' },
  { id: 'reserve', value: '#d1c04099', preview: '#d1c04099' },
  { id: 'hatch-mix', value: 'url(#plan-hatch-mix)', preview: 'repeating-linear-gradient(32deg,#9c7c54 0 5px,#c4a27a 5px 8px)' },
  { id: 'hatch-gold', value: 'url(#plan-hatch-gold)', preview: 'repeating-linear-gradient(32deg,#a58136 0 5px,#d4bc7a 5px 8px)' },
  { id: 'hatch-slate', value: 'url(#plan-hatch-slate)', preview: 'repeating-linear-gradient(32deg,#585b72 0 5px,#8b90a4 5px 8px)' },
]

const CLEAR_SWATCH: Record<string, string> = {
  '#62646e': '#62646e99',
  '#c87348': '#c8734899',
  '#2e80d9': '#2e80d999',
  '#30b0c7': '#30b0c799',
  '#a88354': '#a8835499',
  '#3c9a62': '#3c9a6299',
  '#373e52': '#373E5299',
  '#566286': '#5662864D',
  '#d1c040': '#d1c04099',
}

const LEGACY_LIGHT = new Set([
  '#ffffff', '#f8e4c5', '#9ebce9', '#d6e4f2', '#d9e8f6', '#e5f2ea',
  '#e4e8ee', '#d8dee8', '#2e7d4f', '#f6c6d5', '#f8d7a8', '#e4d0f5',
  '#9c7c54b2', '#a58136b2', '#585b72b2', '#5dda7429',
])

export function chosenFill(item: PlanItem) {
  const color = item.color?.trim() || ''
  if (!color || color.startsWith('url(')) return color.startsWith('url(') ? color : ''
  if (LEGACY_LIGHT.has(color.toLowerCase())) return ''
  return CLEAR_SWATCH[color.toLowerCase()] || color
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
  const chosen = chosenFill(item)
  if (chosen) return chosen
  if (item.type === 'road') return 'url(#plan-road-cockpit)'
  if (item.type === 'bush') return 'url(#plan-bush-cockpit)'
  if (item.type === 'line') {
    if (item.name.includes('成品')) return 'url(#plan-hatch-gold)'
    if (item.name.includes('设备') || item.name.includes('筛')) return 'url(#plan-hatch-slate)'
    return 'url(#plan-hatch-mix)'
  }
  if (item.type === 'zone' && item.name.includes('卫生')) return '#3c9a62'
  return PLAN_COLORS[item.type]
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

/** 驾驶舱与平面图设置共用区块填色。区块上有快捷色时两边一致，没有时驾驶舱按名称使用默认暗色。 */
export function planPaint(item: PlanItem, theme: 'editor' | 'cockpit'): PlanPaint {
  const chosen = chosenFill(item)
  if (theme !== 'cockpit' || chosen) {
    return {
      fill: chosen || planFill(item),
      opacity: 1,
      stroke: 'none',
      label: '#ffffff',
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
    warehouse: { fill: '#373E5299', opacity: 1, stroke: '#ffffff', label: '#ffffff' },
    idle: { fill: '#373e52', opacity: 0.35, stroke: 'rgba(255,255,255,0.4)', label: '#ffffff' },
    office: { fill: '#3d4c66', opacity: 0.72, stroke: 'rgba(255,255,255,0.55)', label: '#ffffff' },
    door: { fill: '#62646e', opacity: 0.5, stroke: 'none', label: '#ffffff' },
    stack: { fill: '#5662864D', opacity: 1, stroke: 'none', label: '#ffffff' },
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

export interface DoorLabel {
  vertical: boolean
  size: number
  x: number
  y: number
  step: number
  chars: string[]
  /** 名称里的回车。有换行时按行横排，不再逐字拆开。 */
  lines?: string[]
}

/** 汉字渲染高度大约是字号的 1.35 倍，竖排间距按这个算，避免字叠字。 */
const LABEL_PITCH = 1.35

/** 带换行的名称按行横排，整段在块内居中。 */
function fitBrokenLines(item: PlanItem, lines: string[], maxSize: number): DoorLabel | null {
  if (!lines.some((line) => line.trim())) return null
  const longest = Math.max(1, ...lines.map((line) => Array.from(line).length))
  const width = Math.max(0.05, item.cols)
  const height = Math.max(0.05, item.rows)
  const size = Math.min(maxSize, (width * 0.9) / longest, (height * 0.86) / (lines.length * LABEL_PITCH))
  const step = size * LABEL_PITCH
  return {
    vertical: false,
    size,
    x: item.col + item.cols / 2,
    y: item.row + item.rows / 2 - ((lines.length - 1) * step) / 2,
    step,
    chars: [],
    lines,
  }
}

/** 名称在块内居中。有回车时按行横排；否则扁块横排，窄块逐字竖排。 */
export function fitLabelLayout(item: PlanItem, text: string, maxSize = 1.2): DoorLabel | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 1) return fitBrokenLines(item, lines, maxSize)
  const chars = Array.from((lines[0] || '').trim())
  if (!chars.length) return null
  const vertical = item.rows > item.cols
  const length = Math.max(0.05, vertical ? item.rows : item.cols)
  const thick = Math.max(0.05, vertical ? item.cols : item.rows)
  const along = vertical ? chars.length * LABEL_PITCH : chars.length
  const fitted = Math.min(thick * 0.72, (length * 0.9) / along)
  const size = Math.min(maxSize, fitted)
  const step = size * LABEL_PITCH
  return {
    vertical,
    size,
    x: item.col + item.cols / 2,
    y: vertical
      ? item.row + item.rows / 2 - ((chars.length - 1) * step) / 2
      : item.row + item.rows / 2,
    step,
    chars,
  }
}

/** 门名顺着长边，字号略小于普通区块。 */
export function doorLabelLayout(item: PlanItem, text: string) {
  return fitLabelLayout(item, text, 0.72)
}

function clipRect(host: PlanRect, other: PlanRect): PlanRect | null {
  const col = Math.max(host.col, other.col)
  const row = Math.max(host.row, other.row)
  const right = Math.min(host.col + host.cols, other.col + other.cols)
  const bottom = Math.min(host.row + host.rows, other.row + other.rows)
  if (right - col <= 0.02 || bottom - row <= 0.02) return null
  return { col, row, cols: right - col, rows: bottom - row }
}

/** 从矩形里挖掉障碍，留下上、下、左、右四块可放文字的区域。 */
function subtractRect(rect: PlanRect, hole: PlanRect): PlanRect[] {
  const out: PlanRect[] = []
  const top = hole.row - rect.row
  const bottom = rect.row + rect.rows - (hole.row + hole.rows)
  const left = hole.col - rect.col
  const right = rect.col + rect.cols - (hole.col + hole.cols)
  if (top > 0.05) out.push({ col: rect.col, row: rect.row, cols: rect.cols, rows: top })
  if (bottom > 0.05) out.push({ col: rect.col, row: hole.row + hole.rows, cols: rect.cols, rows: bottom })
  if (left > 0.05) out.push({ col: rect.col, row: hole.row, cols: left, rows: hole.rows })
  if (right > 0.05) out.push({ col: hole.col + hole.cols, row: hole.row, cols: right, rows: hole.rows })
  return out
}

function openRects(host: PlanRect, holes: PlanRect[]): PlanRect[] {
  let rects: PlanRect[] = [host]
  holes.forEach((hole) => {
    const next: PlanRect[] = []
    rects.forEach((rect) => {
      const clipped = clipRect(rect, hole)
      if (!clipped) next.push(rect)
      else next.push(...subtractRect(rect, clipped))
    })
    rects = next.filter((rect) => rect.cols > 0.2 && rect.rows > 0.2)
  })
  return rects
}

/**
 * 名称仍在本区块内。和其他区块重叠时，把文字放到重叠区之外，
 * 例如中控室的字避开压在上面的卫生间。
 */
export function labelClearOf(item: PlanItem, text: string, others: PlanItem[], maxSize = 1.2): DoorLabel | null {
  const holes = others
    .filter((other) => other.id !== item.id && !isWarehouseItem(other) && overlapArea(item, other) > 0)
    .map((other) => clipRect(item, other))
    .filter((hole): hole is PlanRect => !!hole)
  const plain = fitLabelLayout(item, text, maxSize)
  if (!holes.length) return plain
  let best: DoorLabel | null = null
  openRects(item, holes).forEach((box) => {
    const layout = fitLabelLayout({ ...item, col: box.col, row: box.row, cols: box.cols, rows: box.rows }, text, maxSize)
    if (!layout || layout.size < 0.22) return
    if (!best || layout.size > best.size + 0.02) best = layout
  })
  return best || plain
}

export function warehouseMark(item: PlanItem) {
  const matched = item.name.match(/(\d+|码头)/)
  if (!matched) return item.name
  return matched[1] === '码头' ? '码头' : `${matched[1]}#`
}

export function warehouseCodeOf(name: string) {
  const flat = name.replace(/[\r\n]+/g, '')
  if (flat.includes('码头')) return '码头仓库'
  const matched = flat.match(/(\d+)/)
  return matched ? `${matched[1]}仓` : flat
}

/** 堆位编码：1#A1、码头#A1。仓库标号本身已带 # 时不再重复。 */
export function stackCode(hostName: string, slot: string) {
  const mark = warehouseMark({ id: '', type: 'warehouse', name: hostName, col: 0, row: 0, cols: 1, rows: 1 })
  const prefix = mark.endsWith('#') ? mark : `${mark}#`
  return `${prefix}${slot}`
}

export interface PlanRect {
  col: number
  row: number
  cols: number
  rows: number
}

export function overlapArea(a: PlanRect, b: PlanRect) {
  const cols = Math.min(a.col + a.cols, b.col + b.cols) - Math.max(a.col, b.col)
  const rows = Math.min(a.row + a.rows, b.row + b.rows) - Math.max(a.row, b.row)
  if (cols <= 0 || rows <= 0) return 0
  return cols * rows
}

/** 门可伸出仓库自身宽高。优先取相交面积最大的仓库，否则取中心落在该外扩范围内的仓库。 */
export function attachedWarehouse(item: PlanItem, items: PlanItem[]) {
  const houses = items.filter(isWarehouseItem)
  let best: PlanItem | undefined
  let bestArea = 0
  for (const host of houses) {
    const area = overlapArea(item, host)
    if (area > bestArea) {
      best = host
      bestArea = area
    }
  }
  if (best) return best
  const cx = item.col + item.cols / 2
  const cy = item.row + item.rows / 2
  return houses.find((host) => (
    cx >= host.col - item.cols && cx <= host.col + host.cols + item.cols
    && cy >= host.row - item.rows && cy <= host.row + host.rows + item.rows
  ))
}

/** 门的长边为一格，短边为三分之一格。 */
export const DOOR_LONG = 1
export const DOOR_SHORT = 1 / 3

/** 按拖拽方向放一扇固定大小的门。单击为横放，左缘在落点，短边居中。 */
export function doorStamp(x0: number, y0: number, x1: number, y1: number): PlanRect {
  const dx = x1 - x0
  const dy = y1 - y0
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const cols = horizontal ? DOOR_LONG : DOOR_SHORT
  const rows = horizontal ? DOOR_SHORT : DOOR_LONG
  const col = horizontal ? (dx < 0 ? x0 - cols : x0) : x0 - cols / 2
  const row = horizontal ? y0 - rows / 2 : (dy < 0 ? y0 - rows : y0)
  return {
    col: Math.round(col * 100) / 100,
    row: Math.round(row * 100) / 100,
    cols,
    rows,
  }
}

/** 普通区域不强制吸附网格，范围就是拖拽起止。 */
export function freeRect(x0: number, y0: number, x1: number, y1: number): PlanRect {
  const col = Math.min(x0, x1)
  const row = Math.min(y0, y1)
  return {
    col: Math.round(col * 100) / 100,
    row: Math.round(row * 100) / 100,
    cols: Math.round(Math.abs(x1 - x0) * 100) / 100,
    rows: Math.round(Math.abs(y1 - y0) * 100) / 100,
  }
}

/** 边线距整数网格不超过 slack（格）时贴到该网格线。 */
export function magnetEdge(value: number, slack: number) {
  const nearest = Math.round(value)
  return Math.abs(value - nearest) <= slack ? nearest : value
}

/** 普通区域四边各自贴线。贴完后宽或高小于最小值时，只保留更近的那条边。 */
export function magnetRect(rect: PlanRect, slack: number, minSize = 0): PlanRect {
  const x = snapSpan(rect.col, rect.cols, slack, minSize)
  const y = snapSpan(rect.row, rect.rows, slack, minSize)
  return { col: x.start, row: y.start, cols: x.size, rows: y.size }
}

function snapSpan(start: number, size: number, slack: number, minSize: number) {
  const end = start + size
  const left = magnetEdge(start, slack)
  const right = magnetEdge(end, slack)
  if (right - left >= minSize) return { start: left, size: right - left }
  const d0 = Math.abs(start - Math.round(start))
  const d1 = Math.abs(end - Math.round(end))
  let nextStart = start
  let nextEnd = end
  if (d0 <= slack && (d0 <= d1 || d1 > slack)) {
    nextStart = Math.round(start)
    nextEnd = end
  } else if (d1 <= slack) {
    nextEnd = Math.round(end)
    nextStart = start
  }
  if (nextEnd - nextStart < minSize) nextEnd = nextStart + minSize
  return { start: nextStart, size: nextEnd - nextStart }
}

/** 门大小不变，只平移到最近的一条网格线。 */
export function magnetShift(start: number, size: number, slack: number) {
  const end = start + size
  const d0 = Math.abs(start - Math.round(start))
  const d1 = Math.abs(end - Math.round(end))
  if (d0 <= slack && d0 <= d1) return Math.round(start) - start
  if (d1 <= slack) return Math.round(end) - end
  return 0
}

/** 一起移动的普通区域和门共用同一次平移，避免各自贴线后互相错开。 */
export function magnetGroupShift(rects: PlanRect[], slack: number) {
  let dx = 0
  let bestX = slack + 1
  let dy = 0
  let bestY = slack + 1
  for (const rect of rects) {
    for (const edge of [rect.col, rect.col + rect.cols]) {
      const dist = Math.abs(edge - Math.round(edge))
      if (dist <= slack && dist < bestX) {
        bestX = dist
        dx = Math.round(edge) - edge
      }
    }
    for (const edge of [rect.row, rect.row + rect.rows]) {
      const dist = Math.abs(edge - Math.round(edge))
      if (dist <= slack && dist < bestY) {
        bestY = dist
        dy = Math.round(edge) - edge
      }
    }
  }
  return { dx, dy }
}

/** 把门限制在所属仓库外扩一个门宽、一个门高的范围内。 */
export function clampDoor(item: PlanItem, host: PlanItem) {
  const minCol = host.col - item.cols
  const maxCol = host.col + host.cols
  const minRow = host.row - item.rows
  const maxRow = host.row + host.rows
  item.col = Math.min(maxCol, Math.max(minCol, item.col))
  item.row = Math.min(maxRow, Math.max(minRow, item.row))
}

export function sortPlanItems(items: PlanItem[]) {
  return items.slice().sort((a, b) => Z[a.type] - Z[b.type] || (isWarehouseItem(a) ? -1 : 1))
}

export function isWarehouseItem(item: PlanItem) {
  return item.type === 'warehouse' || item.type === 'idle'
}

/** 绘制内容的外接范围，驾驶舱按此居中，而不是铺满整张空网格。 */
export function contentFrame(plan: FloorPlan, pad = 1.2) {
  if (!plan.items.length) return { x: 0, y: 0, w: plan.gridCols || 42, h: plan.gridRows || 26 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of plan.items) {
    minX = Math.min(minX, item.col)
    minY = Math.min(minY, item.row)
    maxX = Math.max(maxX, item.col + item.cols)
    const labelPad = isWarehouseItem(item) ? 1.1 : 0
    maxY = Math.max(maxY, item.row + item.rows + labelPad)
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(4, maxX - minX + pad * 2),
    h: Math.max(4, maxY - minY + pad * 2),
  }
}

export function hostOf(item: PlanItem, items: PlanItem[]) {
  if (item.type === 'door') return attachedWarehouse(item, items)
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

/** 空白画板。没有保存过、或保存后没有任何区块时都用这一张，不再回填示例园区。 */
export function defaultPlan(): FloorPlan {
  return { id: 'park', gridPx: 24, gridCols: 42, gridRows: 26, items: [] }
}

export function presetSize(type: PlanType) {
  if (type === 'door') return { cols: DOOR_LONG, rows: DOOR_SHORT }
  if (type === 'road') return { cols: 8, rows: 1 }
  if (type === 'bush') return { cols: 4, rows: 1 }
  if (type === 'line') return { cols: 6, rows: 1 }
  if (type === 'stack') return { cols: 3, rows: 3 }
  if (type === 'warehouse' || type === 'idle') return { cols: 8, rows: 6 }
  return { cols: 4, rows: 3 }
}
