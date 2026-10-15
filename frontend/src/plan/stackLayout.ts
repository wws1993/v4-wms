import { overlapArea, warehouseMark, type PlanRect } from '@/plan/model'

export interface StackSeed {
  id: string
  code: string
  capacity: number
}

export interface PlacedStack {
  stackId: string
  name: string
  col: number
  row: number
  cols: number
  rows: number
}

function largestOpen(blocked: boolean[][]) {
  const rows = blocked.length
  const cols = blocked[0]?.length || 0
  const height = Array(cols).fill(0)
  let best: { c: number; r: number; w: number; h: number } | null = null
  let bestArea = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) height[col] = blocked[row][col] ? 0 : height[col] + 1
    const stack = [-1]
    for (let col = 0; col <= cols; col += 1) {
      const bar = col === cols ? 0 : height[col]
      while (stack.length > 1 && height[stack[stack.length - 1]] >= bar) {
        const top = stack.pop() as number
        const hh = height[top]
        const width = col - stack[stack.length - 1] - 1
        const area = hh * width
        if (area > bestArea) {
          bestArea = area
          best = { c: stack[stack.length - 1] + 1, r: row - hh + 1, w: width, h: hh }
        }
      }
      stack.push(col)
    }
  }
  return best
}

function freeRectangles(blocked: boolean[][]) {
  const used = blocked.map((row) => row.slice())
  const rects: PlanRect[] = []
  while (true) {
    const found = largestOpen(used)
    if (!found || found.w < 1 || found.h < 1) break
    rects.push({ col: found.c, row: found.r, cols: found.w, rows: found.h })
    for (let row = found.r; row < found.r + found.h; row += 1) {
      for (let col = found.c; col < found.c + found.w; col += 1) used[row][col] = true
    }
  }
  return rects
}

function splitProportional(rect: PlanRect, weights: number[]): PlanRect[] {
  if (weights.length <= 1) return [{ ...rect }]
  const total = weights.reduce((sum, weight) => sum + weight, 0) || weights.length
  let acc = 0
  let splitAt = 1
  let best = Infinity
  for (let index = 1; index < weights.length; index += 1) {
    acc += weights[index - 1]
    const diff = Math.abs(acc / total - 0.5)
    if (diff < best) {
      best = diff
      splitAt = index
    }
  }
  const leftWeight = weights.slice(0, splitAt).reduce((sum, weight) => sum + weight, 0)
  const alongCols = rect.cols >= rect.rows
  const span = alongCols ? rect.cols : rect.rows
  if (span < 2) {
    return weights.map((_, index) => (index === 0 ? { ...rect } : { col: rect.col, row: rect.row, cols: 0, rows: 0 }))
  }
  let leftSpan = Math.round((span * leftWeight) / total)
  leftSpan = Math.max(1, Math.min(span - 1, leftSpan))
  const rightSpan = span - leftSpan
  const left: PlanRect = alongCols
    ? { col: rect.col, row: rect.row, cols: leftSpan, rows: rect.rows }
    : { col: rect.col, row: rect.row, cols: rect.cols, rows: leftSpan }
  const right: PlanRect = alongCols
    ? { col: rect.col + leftSpan, row: rect.row, cols: rightSpan, rows: rect.rows }
    : { col: rect.col, row: rect.row + leftSpan, cols: rect.cols, rows: rightSpan }
  return [
    ...splitProportional(left, weights.slice(0, splitAt)),
    ...splitProportional(right, weights.slice(splitAt)),
  ]
}

function slotName(code: string, hostName: string) {
  const mark = `${warehouseMark({ id: '', type: 'warehouse', name: hostName, col: 0, row: 0, cols: 1, rows: 1 })}#`
  if (code.startsWith(mark)) return code.slice(mark.length)
  const hash = code.indexOf('#')
  return (hash >= 0 ? code.slice(hash + 1) : code) || code
}

export interface ParkSeed {
  id: string
  code: string
  capacity: number
  area: number
  stacks: StackSeed[]
}

export interface PlacedWarehouse {
  warehouseId: string
  name: string
  capacity: number
  area: number
  col: number
  row: number
  cols: number
  rows: number
  stacks: PlacedStack[]
}

/** 仓库按库容占格时，画板留出的空白比例。 */
const PARK_BLANK = 0.3

function blockSize(cells: number, boardCols: number, boardRows: number) {
  const aspect = boardCols / Math.max(1, boardRows)
  const maxCols = Math.max(2, boardCols - 2)
  const maxRows = Math.max(2, boardRows - 2)
  let cols = Math.max(2, Math.round(Math.sqrt(Math.max(1, cells) * aspect)))
  cols = Math.min(cols, maxCols)
  let rows = Math.max(2, Math.ceil(Math.max(1, cells) / cols))
  rows = Math.min(rows, maxRows)
  return { cols, rows }
}

function flowPlace(
  sizes: { cols: number; rows: number }[],
  boardCols: number,
  boardRows: number,
  overflow: boolean,
) {
  const gap = 1
  let x = 1
  let y = 1
  let rowHeight = 0
  const placed: PlanRect[] = []
  for (const size of sizes) {
    if (x > 1 && x + size.cols > boardCols - 1) {
      x = 1
      y += rowHeight + gap
      rowHeight = 0
    }
    if (!overflow && y + size.rows > boardRows - 1) return null
    placed.push({ col: x, row: y, cols: size.cols, rows: size.rows })
    x += size.cols + gap
    rowHeight = Math.max(rowHeight, size.rows)
  }
  return placed
}

/**
 * 按库容把仓库铺进画板。仓库合计占用约 70% 格子，其余 30% 留白。
 * 每个仓库里的堆位再按库容平分该仓库。
 */
export function layoutPark(boardCols: number, boardRows: number, houses: ParkSeed[]): PlacedWarehouse[] {
  if (!houses.length) return []
  const cols = Math.max(4, Math.round(boardCols) || 4)
  const rows = Math.max(4, Math.round(boardRows) || 4)
  const ordered = houses
    .map((house, index) => ({ house, index, weight: Math.max(Number(house.capacity) || 0, 1) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  const total = ordered.reduce((sum, item) => sum + item.weight, 0)
  const usable = Math.max(ordered.length * 4, Math.floor(cols * rows * (1 - PARK_BLANK)))
  let positions: PlanRect[] | null = null
  let scale = 1
  for (let attempt = 0; attempt < 12 && !positions; attempt += 1) {
    const sizes = ordered.map((item) => blockSize(Math.max(4, Math.round((usable * item.weight * scale) / total)), cols, rows))
    positions = flowPlace(sizes, cols, rows, false)
    scale *= 0.82
  }
  const boxes = positions || flowPlace(ordered.map(() => ({ cols: 2, rows: 2 })), cols, rows, true) || []
  return ordered.map((item, index) => {
    const box = boxes[index] || { col: 1, row: 1 + index * 3, cols: 2, rows: 2 }
    return {
      warehouseId: item.house.id,
      name: item.house.code,
      capacity: Number(item.house.capacity) || 0,
      area: Number(item.house.area) || 0,
      col: box.col,
      row: box.row,
      cols: box.cols,
      rows: box.rows,
      stacks: layoutStacks(box, item.house.code, [], item.house.stacks),
    }
  })
}

/**
 * 在仓库内、障碍（过道、设备、门等）之外，按库容把堆位铺进剩余格子。
 * 返回的 col/row 是画板坐标。放不下的堆位不返回。
 */
export function layoutStacks(host: PlanRect, hostName: string, obstacles: PlanRect[], source: StackSeed[]): PlacedStack[] {
  if (!source.length) return []
  const stacks = source
    .map((stack, index) => ({ stack, index }))
    .sort((a, b) => (Number(b.stack.capacity) || 0) - (Number(a.stack.capacity) || 0) || a.index - b.index)
    .map((entry) => entry.stack)
  const originCol = Math.round(host.col)
  const originRow = Math.round(host.row)
  const cols = Math.max(1, Math.round(host.cols))
  const rows = Math.max(1, Math.round(host.rows))
  const blocked = Array.from({ length: rows }, () => Array(cols).fill(false))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = { col: originCol + col + 0.001, row: originRow + row + 0.001, cols: 0.998, rows: 0.998 }
      blocked[row][col] = obstacles.some((item) => overlapArea(item, cell) > 0)
    }
  }
  let rects = freeRectangles(blocked)
  const usable = rects.filter((rect) => rect.cols * rect.rows >= 2)
  if (usable.length && usable.reduce((sum, rect) => sum + rect.cols * rect.rows, 0) >= stacks.length) rects = usable
  const freeArea = rects.reduce((sum, rect) => sum + rect.cols * rect.rows, 0)
  if (!freeArea) return []

  const weights = stacks.map((stack) => (Number(stack.capacity) > 0 ? Number(stack.capacity) : 1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const groups: { rect: PlanRect; indexes: number[] }[] = []
  let cursor = 0
  rects.forEach((rect, rectIndex) => {
    const room = rect.cols * rect.rows
    const target = (totalWeight * room) / freeArea
    const indexes: number[] = []
    let used = 0
    const last = rectIndex === rects.length - 1
    while (cursor < stacks.length && indexes.length < room) {
      const next = weights[cursor]
      if (!last && indexes.length > 0 && used + next > target * 1.15) break
      indexes.push(cursor)
      used += next
      cursor += 1
    }
    if (indexes.length) groups.push({ rect, indexes })
  })
  while (cursor < stacks.length) {
    const group = groups.find((entry) => entry.indexes.length < entry.rect.cols * entry.rect.rows)
    if (!group) break
    group.indexes.push(cursor)
    cursor += 1
  }

  const placed: PlacedStack[] = []
  for (const group of groups) {
    const members = group.indexes.map((index) => ({ index, weight: weights[index] }))
    const total = members.reduce((sum, item) => sum + item.weight, 0) || 1
    const minor = members.filter((item) => item.weight / total < 0.05)
    const major = members.filter((item) => item.weight / total >= 0.05)
    const batches: { rect: PlanRect; items: typeof members }[] = []
    if (major.length && minor.length && group.rect.rows >= 2 && group.rect.cols >= minor.length) {
      batches.push({
        rect: { col: group.rect.col, row: group.rect.row, cols: group.rect.cols, rows: group.rect.rows - 1 },
        items: major,
      })
      batches.push({
        rect: { col: group.rect.col, row: group.rect.row + group.rect.rows - 1, cols: group.rect.cols, rows: 1 },
        items: minor,
      })
    } else {
      batches.push({ rect: group.rect, items: members })
    }
    for (const batch of batches) {
      const parts = splitProportional(batch.rect, batch.items.map((item) => item.weight))
      batch.items.forEach((item, partIndex) => {
        const part = parts[partIndex]
        if (!part || part.cols < 1 || part.rows < 1) return
        const stack = stacks[item.index]
        placed.push({
          stackId: stack.id,
          name: slotName(stack.code, hostName),
          col: originCol + part.col,
          row: originRow + part.row,
          cols: part.cols,
          rows: part.rows,
        })
      })
    }
  }
  return placed
}
