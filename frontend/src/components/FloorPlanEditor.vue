<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { floorApi, warehouseApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import YardMapLoading from '@/components/YardMapLoading.vue'
import {
  PLAN_COLORS, PLAN_SWATCHES, attachedWarehouse, clampDoor, contentFrame, defaultPlan, doorStamp, freeRect, hostOf, isWarehouseItem,
  magnetEdge, magnetGroupShift, magnetRect, magnetShift,
  overlapArea, stackCode, warehouseCodeOf,
} from '@/plan/model'
import { layoutPark, layoutStacks } from '@/plan/stackLayout'
import type { FloorPlan, PlanItem, PlanType } from '@/types'

type Rect = { col: number; row: number; cols: number; rows: number }
type Mode = 'draw' | 'select'
type Brush = 'warehouse' | 'stack' | 'zone' | 'door'
type Gesture = 'idle' | 'drag' | 'scale'

const plan = reactive<FloorPlan>(defaultPlan())
const planReady = ref(false)
const mode = ref<Mode>('draw')
const brush = ref<Brush>('warehouse')
const selectedIds = ref<string[]>([])
const gesture = ref<Gesture>('idle')
const canvas = ref<InstanceType<typeof PlanSvg>>()
const boardRef = ref<HTMLElement>()
const view = reactive({ x: 0, y: 0, w: 42, h: 26 })
const zoom = ref(1)
const draft = ref<{ type: PlanType; col: number; row: number; cols: number; rows: number } | null>(null)
const marquee = ref<Rect | null>(null)
const settingsOpen = ref(false)
const helpOpen = ref(false)
const initBusy = ref(false)
const saveBusy = ref(false)
const saving = ref(false)
const houseOpen = ref(false)
const houseForm = reactive<{ capacity: number | null; area: number | null }>({ capacity: null, area: null })
const removedWarehouses = ref<string[]>([])
const removedWarehouseCodes = ref<string[]>([])
const removedStacks = ref<string[]>([])
const removedStackCodes = ref<string[]>([])
const gridPxDraft = ref(24)
let houseTargetId = ''
let houseAccepted = false
const menu = ref<{ x: number; y: number; kind: 'props' | 'actions'; lift: number; shift: number } | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const nameInput = ref<{ focus: () => void } | null>(null)
let menuToken = 0
const space = ref(false)
let history: string[] = []
let future: string[] = []
let action: {
  kind: 'draw' | 'marquee' | 'move' | 'resize' | 'pan' | 'pick'
  x: number
  y: number
  dir?: string
  vx: number
  vy: number
  box?: Rect
  itemId?: string
  origins: { id: string; col: number; row: number; cols: number; rows: number; hostId?: string }[]
} | null = null
let saveTimer = 0

const current = computed(() => selectedIds.value.length === 1
  ? plan.items.find((item) => item.id === selectedIds.value[0])
  : undefined)
const menuStyle = computed(() => {
  if (!menu.value) return undefined
  const x = menu.value.shift ? `-${menu.value.shift}px` : '0px'
  const y = menu.value.lift ? `-${menu.value.lift}px` : '0px'
  return {
    left: `${menu.value.x}px`,
    top: `${menu.value.y}px`,
    transform: menu.value.shift || menu.value.lift ? `translate(${x}, ${y})` : 'none',
  }
})
const selectionBox = computed(() => boundsOf(selectedIds.value))
const warehouseOn = computed({
  get: () => Boolean(current.value && isWarehouseItem(current.value)),
  set: (value: boolean) => setWarehouse(value),
})
const stackOn = computed({
  get: () => current.value?.type === 'stack',
  set: (value: boolean) => setBlockKind(value ? 'stack' : 'zone'),
})
const doorOn = computed({
  get: () => current.value?.type === 'door',
  set: (value: boolean) => setBlockKind(value ? 'door' : 'zone'),
})
const pickedWarehouse = computed(() => {
  if (selectedIds.value.length !== 1) return undefined
  const item = plan.items.find((entry) => entry.id === selectedIds.value[0])
  return item && isWarehouseItem(item) ? item : undefined
})
const kindLocked = computed(() => {
  const item = current.value
  return !!item && (isWarehouseItem(item) || item.type === 'stack')
})
const resizeBox = computed(() => {
  if (gesture.value !== 'scale' && menu.value?.kind !== 'props') return null
  if (selectedIds.value.length === 1 && current.value?.type === 'door') return null
  return selectionBox.value
})

function point(event: { clientX: number; clientY: number }) {
  return canvas.value?.locate(event) || { x: 0, y: 0 }
}

function cellPx() {
  return Math.max(8, Number(plan.gridPx) || 24) * zoom.value
}

/** 边线距网格线不超过 2 屏幕像素时贴上。 */
function gridSlack() {
  return 2 / cellPx()
}

function historySnap() {
  return JSON.stringify({
    items: plan.items,
    removedWarehouses: removedWarehouses.value,
    removedWarehouseCodes: removedWarehouseCodes.value,
    removedStacks: removedStacks.value,
    removedStackCodes: removedStackCodes.value,
  })
}

function applySnap(raw: string) {
  const data = JSON.parse(raw) as PlanItem[] | {
    items: PlanItem[]
    removedWarehouses?: string[]
    removedWarehouseCodes?: string[]
    removedStacks?: string[]
    removedStackCodes?: string[]
  }
  if (Array.isArray(data)) {
    plan.items = data
    return
  }
  plan.items = data.items
  removedWarehouses.value = data.removedWarehouses || []
  removedWarehouseCodes.value = data.removedWarehouseCodes || []
  removedStacks.value = data.removedStacks || []
  removedStackCodes.value = data.removedStackCodes || []
}

function remember() {
  history.push(historySnap())
  if (history.length > 40) history.shift()
  future = []
}

function undo() {
  const prev = history.pop()
  if (!prev) return
  future.push(historySnap())
  applySnap(prev)
  clearPick()
  queueSave()
}

function redo() {
  const next = future.pop()
  if (!next) return
  history.push(historySnap())
  applySnap(next)
  queueSave()
}

function layout(anchor?: { x: number; y: number; sx: number; sy: number }) {
  const board = boardRef.value
  if (!board) return
  const width = board.clientWidth || 800
  const height = board.clientHeight || 640
  const px = cellPx()
  const focus = anchor || {
    x: view.x + view.w / 2,
    y: view.y + view.h / 2,
    sx: width / 2,
    sy: height / 2,
  }
  view.w = width / px
  view.h = height / px
  view.x = focus.x - (focus.sx / width) * view.w
  view.y = focus.y - (focus.sy / height) * view.h
}

function centerContent() {
  const frame = contentFrame(plan, 2)
  view.x = frame.x
  view.y = frame.y
  view.w = frame.w
  view.h = frame.h
  const board = boardRef.value
  if (!board) return
  const width = board.clientWidth || 800
  const height = board.clientHeight || 640
  const fit = Math.min(width / frame.w, height / frame.h)
  zoom.value = fit / Math.max(8, Number(plan.gridPx) || 24)
  zoom.value = Math.max(0.35, Math.min(4, zoom.value))
  layout()
}

onMounted(async () => {
  const res = await floorApi.get()
  if (res.success && res.data) {
    Object.assign(plan, res.data)
    if (!plan.gridPx) plan.gridPx = 24
    removedWarehouses.value = [...(plan.removedWarehouseIds || [])]
    removedWarehouseCodes.value = [...(plan.removedWarehouseCodes || [])]
    removedStacks.value = [...(plan.removedStackIds || [])]
    removedStackCodes.value = [...(plan.removedStackCodes || [])]
    planReady.value = true
    noteLoadedArchives()
  } else {
    ElMessage.error(res.message || '平面图读取失败')
  }
  gridPxDraft.value = plan.gridPx
  centerContent()
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  boardRef.value && new ResizeObserver(() => layout()).observe(boardRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.clearTimeout(saveTimer)
})

function onKey(event: KeyboardEvent) {
  if (event.code === 'Space') {
    const tag = (event.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    space.value = true
    event.preventDefault()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
  if (event.key === 'Delete') {
    event.preventDefault()
    void removeSelected()
    return
  }
  if (event.key === 'Backspace') {
    const tag = (event.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    event.preventDefault()
    void removeSelected()
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') space.value = false
}

function keepCanvasClear(event: Event) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea')) return
  event.preventDefault()
  window.getSelection()?.removeAllRanges()
}

function capture(event: PointerEvent) {
  try { boardRef.value?.setPointerCapture(event.pointerId) } catch { /* 指针已释放 */ }
}

function snappedRect(x0: number, y0: number, x1: number, y1: number) {
  const col = Math.floor(Math.min(x0, x1))
  const row = Math.floor(Math.min(y0, y1))
  const cols = Math.max(1, Math.ceil(Math.max(x0, x1)) - col)
  const rows = Math.max(1, Math.ceil(Math.max(y0, y1)) - row)
  return { col, row, cols, rows }
}

function clearPick() {
  selectedIds.value = []
  gesture.value = 'idle'
  menu.value = null
  marquee.value = null
}

function setMode(next: Mode) {
  mode.value = next
  clearPick()
  draft.value = null
}

function setBrush(next: Brush) {
  brush.value = next
  mode.value = 'draw'
  clearPick()
  draft.value = null
}

function draftAt(x0: number, y0: number, x1: number, y1: number) {
  const slack = gridSlack()
  if (brush.value === 'door') {
    const stamp = doorStamp(x0, y0, x1, y1)
    return {
      type: 'door' as const,
      col: stamp.col + magnetShift(stamp.col, stamp.cols, slack),
      row: stamp.row + magnetShift(stamp.row, stamp.rows, slack),
      cols: stamp.cols,
      rows: stamp.rows,
    }
  }
  if (brush.value === 'zone') return { type: 'zone' as const, ...magnetRect(freeRect(x0, y0, x1, y1), slack, 0.08) }
  const type = brush.value === 'warehouse' ? 'warehouse' as const : 'stack' as const
  return { type, ...snappedRect(x0, y0, x1, y1) }
}

function boundsOf(ids: string[]) {
  const picked = plan.items.filter((item) => ids.includes(item.id))
  if (!picked.length) return null
  const col = Math.min(...picked.map((item) => item.col))
  const row = Math.min(...picked.map((item) => item.row))
  const right = Math.max(...picked.map((item) => item.col + item.cols))
  const bottom = Math.max(...picked.map((item) => item.row + item.rows))
  return { col, row, cols: right - col, rows: bottom - row }
}

function overlaps(item: PlanItem, box: Rect) {
  return item.col < box.col + box.cols && item.col + item.cols > box.col
    && item.row < box.row + box.rows && item.row + item.rows > box.row
}

function onBlank(event: PointerEvent) {
  if (event.button === 1 || space.value || (mode.value === 'draw' && event.button === 2)) {
    capture(event)
    action = { kind: 'pan', x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, origins: [] }
    return
  }
  if (event.button === 2) {
    openSelectMenu(event)
    return
  }
  if (event.button !== 0) return
  capture(event)
  menu.value = null
  const p = point(event)
  if (mode.value === 'select') {
    gesture.value = 'idle'
    marquee.value = snappedRect(p.x, p.y, p.x, p.y)
    action = { kind: 'marquee', x: p.x, y: p.y, vx: 0, vy: 0, origins: [] }
    return
  }
  selectedIds.value = []
  draft.value = brush.value === 'door' ? draftAt(p.x, p.y, p.x, p.y) : null
  action = { kind: 'draw', x: p.x, y: p.y, vx: event.clientX, vy: event.clientY, origins: [] }
}

function onItemDown(event: PointerEvent, item: PlanItem) {
  if (event.button === 2) {
    openMenu(event, item)
    return
  }
  if (event.button !== 0) return
  if (space.value) {
    onBlank(event)
    return
  }
  capture(event)
  const p = point(event)
  action = {
    kind: 'pick',
    x: p.x,
    y: p.y,
    vx: event.clientX,
    vy: event.clientY,
    itemId: item.id,
    origins: [],
  }
}

function snapshot(item: PlanItem) {
  return {
    id: item.id,
    col: item.col,
    row: item.row,
    cols: item.cols,
    rows: item.rows,
    hostId: item.type === 'door'
      ? attachedWarehouse(item, plan.items)?.id
      : item.type === 'stack'
        ? hostOf(item, plan.items)?.id
        : undefined,
  }
}

function blockHost(item: PlanItem) {
  if (isWarehouseItem(item)) return item
  return item.type === 'door' ? attachedWarehouse(item, plan.items) : hostOf(item, plan.items)
}

function hostsSelection(itemId: string) {
  if (selectedIds.value.includes(itemId)) return true
  const hit = plan.items.find((entry) => entry.id === itemId)
  if (!hit) return false
  const host = blockHost(hit)
  return !!host && isWarehouseItem(host) && selectedIds.value.includes(host.id)
}

function dragIds() {
  const ids = new Set(selectedIds.value)
  plan.items.forEach((child) => {
    if (ids.has(child.id) || isWarehouseItem(child)) return
    const host = blockHost(child)
    if (host && ids.has(host.id) && isWarehouseItem(host)) ids.add(child.id)
  })
  return [...ids]
}

function beginMove(event: PointerEvent) {
  capture(event)
  remember()
  const p = point(event)
  action = {
    kind: 'move',
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    origins: plan.items.filter((item) => dragIds().includes(item.id)).map(snapshot),
  }
}

function menuNudge(anchor: number, size: number, boardSize: number) {
  const margin = 8
  const spaceAfter = boardSize - margin - anchor
  const spaceBefore = anchor - margin
  if (size <= spaceAfter || spaceBefore <= spaceAfter) return 0
  return Math.min(size, Math.max(0, spaceBefore))
}

function screenBox(item: PlanItem) {
  const board = boardRef.value?.getBoundingClientRect()
  const svg = canvas.value?.el()?.getBoundingClientRect()
  if (!board || !svg || svg.width <= 0 || svg.height <= 0) return null
  const left = svg.left - board.left + ((item.col - view.x) / view.w) * svg.width
  const top = svg.top - board.top + ((item.row - view.y) / view.h) * svg.height
  const width = (item.cols / view.w) * svg.width
  const height = (item.rows / view.h) * svg.height
  return { left, top, right: left + width, bottom: top + height }
}

function boxesOverlap(x: number, y: number, w: number, h: number, box: { left: number; top: number; right: number; bottom: number }) {
  return x < box.right && x + w > box.left && y < box.bottom && y + h > box.top
}

function besidePoint(box: { left: number; top: number; right: number; bottom: number }, menuW: number, menuH: number) {
  const board = boardRef.value
  const gap = 10
  const margin = 8
  const bw = board?.clientWidth ?? 0
  const bh = board?.clientHeight ?? 0
  const spots = [
    { x: box.right + gap, y: box.top },
    { x: box.left - gap - menuW, y: box.top },
    { x: box.left, y: box.bottom + gap },
    { x: box.left, y: box.top - gap - menuH },
  ]
  const fit = spots.find((spot) => (
    spot.x >= margin && spot.y >= margin
    && spot.x + menuW <= bw - margin
    && spot.y + menuH <= bh - margin
    && !boxesOverlap(spot.x, spot.y, menuW, menuH, box)
  ))
  if (fit) return fit
  let x = box.right + gap
  let y = box.top
  if (x + menuW > bw - margin) x = box.left - gap - menuW
  x = Math.min(Math.max(margin, x), Math.max(margin, bw - margin - menuW))
  y = Math.min(Math.max(margin, y), Math.max(margin, bh - margin - menuH))
  if (boxesOverlap(x, y, menuW, menuH, box)) {
    const below = box.bottom + gap
    y = below + menuH <= bh - margin ? below : Math.max(margin, box.top - gap - menuH)
  }
  return { x, y }
}

function focusName(token: number) {
  nextTick(() => {
    if (token !== menuToken) return
    nameInput.value?.focus()
  })
}

function placeBeside(item: PlanItem, focus: boolean) {
  const box = screenBox(item)
  if (!box) return
  const token = ++menuToken
  const guess = { w: 248, h: 420 }
  const spot = besidePoint(box, guess.w, guess.h)
  menu.value = { x: spot.x, y: spot.y, kind: 'props', lift: 0, shift: 0 }
  nextTick(() => {
    if (token !== menuToken || !menu.value || !menuEl.value) return
    const next = besidePoint(box, menuEl.value.offsetWidth, menuEl.value.offsetHeight)
    if (next.x !== menu.value.x || next.y !== menu.value.y) menu.value = { ...menu.value, x: next.x, y: next.y }
    if (focus) nameInput.value?.focus()
  })
  if (focus) focusName(token)
}

function placeMenu(x: number, y: number, kind: 'props' | 'actions') {
  const token = ++menuToken
  const board = boardRef.value
  const guess = kind === 'props' ? { w: 248, h: 420 } : { w: 132, h: 168 }
  menu.value = {
    x,
    y,
    kind,
    lift: menuNudge(y, guess.h, board?.clientHeight ?? 0),
    shift: menuNudge(x, guess.w, board?.clientWidth ?? 0),
  }
  nextTick(() => {
    if (token !== menuToken || !menu.value || !menuEl.value) return
    const lift = menuNudge(menu.value.y, menuEl.value.offsetHeight, boardRef.value?.clientHeight ?? 0)
    const shift = menuNudge(menu.value.x, menuEl.value.offsetWidth, boardRef.value?.clientWidth ?? 0)
    if (lift !== menu.value.lift || shift !== menu.value.shift) menu.value = { ...menu.value, lift, shift }
  })
}

function menuAt(event: PointerEvent, kind: 'props' | 'actions') {
  const board = boardRef.value?.getBoundingClientRect()
  placeMenu(event.clientX - (board?.left || 0), event.clientY - (board?.top || 0), kind)
}

function openMenu(event: PointerEvent, item: PlanItem) {
  if (mode.value === 'select') {
    if (!selectedIds.value.includes(item.id)) selectedIds.value = [item.id]
    openSelectMenu(event)
    return
  }
  selectedIds.value = [item.id]
  gesture.value = 'idle'
  placeBeside(item, false)
}

function openSelectMenu(event: PointerEvent) {
  if (!selectedIds.value.length) return
  menuAt(event, 'actions')
}

function chooseDrag() {
  gesture.value = 'drag'
  menu.value = null
}

function chooseScale() {
  gesture.value = 'scale'
  menu.value = null
}

function onHandleDown(event: PointerEvent, dir: string) {
  const sizing = gesture.value === 'scale' || menu.value?.kind === 'props'
  if (!sizing || !selectionBox.value) return
  if (selectedIds.value.length === 1 && current.value?.type === 'door') return
  capture(event)
  remember()
  const box = selectionBox.value
  action = {
    kind: 'resize',
    x: 0,
    y: 0,
    dir,
    vx: 0,
    vy: 0,
    box: { ...box },
    origins: plan.items.filter((item) => selectedIds.value.includes(item.id)).map(snapshot),
  }
}

function mapEdge(value: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number) {
  if (fromEnd === fromStart) return toStart
  return Math.round(toStart + ((value - fromStart) / (fromEnd - fromStart)) * (toEnd - toStart))
}

function onMove(event: PointerEvent) {
  if (!action) return
  if (action.kind === 'pan') {
    const px = cellPx()
    view.x = action.vx - (event.clientX - action.x) / px
    view.y = action.vy - (event.clientY - action.y) / px
    return
  }
  const p = point(event)
  if (action.kind === 'pick') {
    const moved = Math.hypot(event.clientX - action.vx, event.clientY - action.vy) > 4
    if (!moved) return
    const itemId = action.itemId || ''
    if (hostsSelection(itemId)) {
      beginMove(event)
      return
    }
    if (mode.value === 'select') {
      gesture.value = 'idle'
      marquee.value = snappedRect(action.x, action.y, p.x, p.y)
      action = { kind: 'marquee', x: action.x, y: action.y, vx: 0, vy: 0, origins: [] }
      return
    }
    menu.value = null
    selectedIds.value = []
    draft.value = draftAt(action.x, action.y, p.x, p.y)
    action = { kind: 'draw', x: action.x, y: action.y, vx: action.vx, vy: action.vy, origins: [] }
    return
  }
  if (action.kind === 'draw') {
    if (brush.value !== 'door') {
      const moved = Math.hypot(event.clientX - action.vx, event.clientY - action.vy) > 4
      if (!moved) return
    }
    draft.value = draftAt(action.x, action.y, p.x, p.y)
    return
  }
  if (action.kind === 'marquee') {
    marquee.value = snappedRect(action.x, action.y, p.x, p.y)
    return
  }
  if (action.kind === 'move') {
    const doors = action.origins.every((origin) => {
      const item = plan.items.find((entry) => entry.id === origin.id)
      return item?.type === 'door' || item?.type === 'zone'
    })
    const dx = doors ? p.x - action.x : Math.round(p.x - action.x)
    const dy = doors ? p.y - action.y : Math.round(p.y - action.y)
    for (const origin of action.origins) {
      const item = plan.items.find((entry) => entry.id === origin.id)
      if (!item) continue
      item.col = origin.col + dx
      item.row = origin.row + dy
    }
    if (doors) {
      const placed = action.origins.flatMap((origin) => {
        const item = plan.items.find((entry) => entry.id === origin.id)
        return item ? [{ col: item.col, row: item.row, cols: item.cols, rows: item.rows }] : []
      })
      const shift = magnetGroupShift(placed, gridSlack())
      for (const origin of action.origins) {
        const item = plan.items.find((entry) => entry.id === origin.id)
        if (!item) continue
        item.col += shift.dx
        item.row += shift.dy
      }
    }
    for (const origin of action.origins) {
      const item = plan.items.find((entry) => entry.id === origin.id)
      if (item) holdDoor(item, origin.hostId)
    }
    return
  }
  if (action.kind !== 'resize' || !action.box) return
  const box = action.box
  let left = box.col
  let top = box.row
  let right = box.col + box.cols
  let bottom = box.row + box.rows
  const resizingFree = action.origins.length === 1
    && plan.items.find((entry) => entry.id === action?.origins[0].id)?.type === 'zone'
  const minSize = resizingFree ? 0.08 : 1
  const gx = resizingFree ? magnetEdge(p.x, gridSlack()) : Math.round(p.x)
  const gy = resizingFree ? magnetEdge(p.y, gridSlack()) : Math.round(p.y)
  if (action.dir?.includes('e')) right = Math.max(left + minSize, gx)
  if (action.dir?.includes('w')) left = Math.min(right - minSize, gx)
  if (action.dir?.includes('s')) bottom = Math.max(top + minSize, gy)
  if (action.dir?.includes('n')) top = Math.min(bottom - minSize, gy)
  for (const origin of action.origins) {
    const item = plan.items.find((entry) => entry.id === origin.id)
    if (!item || item.type === 'door') continue
    if (action.origins.length === 1) {
      item.col = left
      item.row = top
      item.cols = Math.max(minSize, right - left)
      item.rows = Math.max(minSize, bottom - top)
      holdDoor(item, origin.hostId)
      continue
    }
    const col = mapEdge(origin.col, box.col, box.col + box.cols, left, right)
    const edge = mapEdge(origin.col + origin.cols, box.col, box.col + box.cols, left, right)
    const row = mapEdge(origin.row, box.row, box.row + box.rows, top, bottom)
    const base = mapEdge(origin.row + origin.rows, box.row, box.row + box.rows, top, bottom)
    item.col = Math.min(col, edge - 1)
    item.row = Math.min(row, base - 1)
    item.cols = Math.max(1, Math.abs(edge - col))
    item.rows = Math.max(1, Math.abs(base - row))
  }
  syncResizeCapacity()
}

function nextDoorName() {
  const used = new Set(plan.items.filter((item) => item.type === 'door').map((item) => item.name.trim()))
  for (let index = 1; index < 500; index += 1) {
    const name = `${index}号门`
    if (!used.has(name)) return name
  }
  return `${used.size + 1}号门`
}

function nextSlot(host: PlanItem) {
  const used = new Set(plan.items.filter((item) => item.type === 'stack' && capacityHost(item)?.id === host.id).map((item) => item.name))
  for (const letter of 'ABCDEFGH') {
    for (let index = 1; index <= 9; index += 1) {
      const name = `${letter}${index}`
      if (!used.has(name)) return name
    }
  }
  return 'A1'
}

function holdDoor(item: PlanItem, hostId?: string) {
  if (item.type !== 'door') return
  const host = hostId
    ? plan.items.find((entry) => entry.id === hostId)
    : attachedWarehouse(item, plan.items)
  if (host && isWarehouseItem(host)) clampDoor(item, host)
}

function rotateDoor() {
  const item = current.value
  if (!item || item.type !== 'door') return
  remember()
  const cx = item.col + item.cols / 2
  const cy = item.row + item.rows / 2
  const cols = item.rows
  const rows = item.cols
  item.cols = cols
  item.rows = rows
  item.col = cx - cols / 2
  item.row = cy - rows / 2
  const slack = gridSlack()
  item.col += magnetShift(item.col, item.cols, slack)
  item.row += magnetShift(item.row, item.rows, slack)
  tidyDoor(item)
  holdDoor(item)
  queueSave()
  placeBeside(item, false)
}

function tidyDoor(item: PlanItem) {
  item.col = Math.round(item.col * 100) / 100
  item.row = Math.round(item.row * 100) / 100
}

function tidyFree(item: PlanItem) {
  item.col = Math.round(item.col * 100) / 100
  item.row = Math.round(item.row * 100) / 100
  item.cols = Math.max(0.08, Math.round(item.cols * 100) / 100)
  item.rows = Math.max(0.08, Math.round(item.rows * 100) / 100)
}

function snapBlock(item: PlanItem) {
  item.col = Math.round(item.col)
  item.row = Math.round(item.row)
  item.cols = Math.max(1, Math.round(item.cols))
  item.rows = Math.max(1, Math.round(item.rows))
}

function setSpan(axis: 'cols' | 'rows', value: number | undefined) {
  const item = current.value
  if (!item || item.type === 'door' || value == null || Number.isNaN(Number(value))) return
  const free = item.type === 'zone'
  const next = free
    ? Math.max(0.08, Math.round(Number(value) * 100) / 100)
    : Math.max(1, Math.round(Number(value)))
  if (item[axis] === next) {
    if (item.type === 'stack') applyStackCapacity(item)
    else if (isWarehouseItem(item)) refreshHostStacks(item)
    return
  }
  remember()
  item[axis] = next
  if (free) tidyFree(item)
  if (item.type === 'stack') applyStackCapacity(item)
  else if (isWarehouseItem(item)) refreshHostStacks(item)
  markArchive(item)
  queueSave()
}

function sameSwatch(current: string | undefined, value: string) {
  const color = (current || '').toLowerCase()
  const next = value.toLowerCase()
  return color === next || `${color}99` === next || `${color}4d` === next
}

function pickColor(color: string) {
  const item = current.value
  if (!item || item.color?.toLowerCase() === color.toLowerCase()) return
  item.color = color
  queueSave()
}

function onUp() {
  if (action?.kind === 'pick') {
    const item = plan.items.find((entry) => entry.id === action?.itemId)
    action = null
    if (!item) return
    selectedIds.value = [item.id]
    gesture.value = 'idle'
    placeBeside(item, true)
    return
  }
  if (action?.kind === 'draw' && draft.value) {
    const drawn = draft.value
    draft.value = null
    if (drawn.type === 'zone' && drawn.cols < 0.08 && drawn.rows < 0.08) {
      action = null
      return
    }
    const item: PlanItem = {
      id: `fp-${Date.now()}`,
      type: drawn.type === 'door' ? 'door' : drawn.type === 'warehouse' ? 'warehouse' : 'zone',
      name: '',
      color: drawn.type === 'door' ? PLAN_COLORS.door : drawn.type === 'warehouse' ? PLAN_COLORS.warehouse : PLAN_COLORS.zone,
      col: drawn.col,
      row: drawn.row,
      cols: drawn.type === 'zone' ? Math.max(0.08, drawn.cols) : drawn.cols,
      rows: drawn.type === 'zone' ? Math.max(0.08, drawn.rows) : drawn.rows,
    }
    if (drawn.type === 'stack') {
      plan.items.push(item)
      adoptStack(item)
      plan.items.pop()
      if (item.type !== 'stack') {
        selectedIds.value = []
        ElMessage.warning('堆位需要画在仓库内，且小于所在仓库')
        action = null
        return
      }
    }
    remember()
    plan.items.push(item)
    selectedIds.value = [item.id]
    if (drawn.type === 'warehouse') {
      item.archive = true
      item.name = '新仓'
      snapBlock(item)
      markArchive(item)
      beginHouse(item)
      placeBeside(item, false)
    } else if (drawn.type === 'stack') {
      markArchive(item)
      placeBeside(item, true)
      queueSave()
    } else if (drawn.type === 'door') {
      item.name = nextDoorName()
      tidyDoor(item)
      holdDoor(item)
      placeBeside(item, true)
      queueSave()
    } else {
      tidyFree(item)
      placeBeside(item, true)
      queueSave()
    }
  } else if (action?.kind === 'marquee' && marquee.value) {
    const box = marquee.value
    selectedIds.value = plan.items.filter((item) => overlaps(item, box)).map((item) => item.id)
    gesture.value = 'idle'
    marquee.value = null
  } else if (action?.kind === 'move' || action?.kind === 'resize') {
    for (const origin of action.origins) {
      const item = plan.items.find((entry) => entry.id === origin.id)
      if (!item) continue
      if (item.type === 'door') {
        tidyDoor(item)
        holdDoor(item, origin.hostId)
      } else if (item.type === 'zone') tidyFree(item)
      else if (item.type === 'stack' && hostOf(item, plan.items)?.id !== origin.hostId) markArchive(item)
    }
    if (action.kind === 'resize') {
      syncResizeCapacity()
      for (const origin of action.origins) {
        const item = plan.items.find((entry) => entry.id === origin.id)
        if (item && (item.cols !== origin.cols || item.rows !== origin.rows)) markArchive(item)
      }
    }
    queueSave()
  }
  action = null
}

function onWheel(event: WheelEvent) {
  const board = boardRef.value
  if (!board) return
  const rect = board.getBoundingClientRect()
  const world = point(event)
  zoom.value = Math.max(0.35, Math.min(4, zoom.value * (event.deltaY < 0 ? 1.12 : 0.89)))
  layout({
    x: world.x,
    y: world.y,
    sx: event.clientX - rect.left,
    sy: event.clientY - rect.top,
  })
}

function pushId(bucket: typeof removedWarehouses, id?: string) {
  if (id && !bucket.value.includes(id)) bucket.value.push(id)
}

function stageItem(item: PlanItem) {
  if (isWarehouseItem(item) && item.warehouseId) {
    pushId(removedWarehouses, item.warehouseId)
    const code = item.name.trim()
    if (code) pushId(removedWarehouseCodes, code)
  }
  if (item.type !== 'stack') return
  if (item.stackId) pushId(removedStacks, item.stackId)
  const code = (item.archiveCode || '').trim()
  if (code) pushId(removedStackCodes, code)
}

/** 与堆位相交面积最大的仓库。中心点落在仓外、但大部分格子仍在仓内时也算这个仓。 */
function capacityHost(item: PlanItem) {
  let best: PlanItem | undefined
  let bestArea = 0
  for (const host of plan.items) {
    if (!isWarehouseItem(host) || host.id === item.id) continue
    const area = overlapArea(item, host)
    if (area > bestArea) {
      best = host
      bestArea = area
    }
  }
  return best
}

function stacksInside(host: PlanItem) {
  return plan.items.filter((item) => item.type === 'stack' && capacityHost(item)?.id === host.id)
}

function refreshHostStacks(host: PlanItem) {
  for (const stack of stacksInside(host)) applyStackCapacity(stack)
}

function syncResizeCapacity() {
  if (action?.kind !== 'resize') return
  const seen = new Set<string>()
  for (const origin of action.origins) {
    const item = plan.items.find((entry) => entry.id === origin.id)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    if (item.type === 'stack') applyStackCapacity(item)
    else if (isWarehouseItem(item)) refreshHostStacks(item)
  }
}

/** 新画的区块大部分落在仓库内时，直接当成堆位并按占格计算库容。 */
function adoptStack(item: PlanItem) {
  const host = capacityHost(item)
  const own = item.cols * item.rows
  if (!host || own <= 0 || overlapArea(item, host) / own < 0.5 || own >= host.cols * host.rows) return
  item.type = 'stack'
  item.archive = true
  if (!item.name) item.name = nextSlot(host)
  if (!item.color || item.color === PLAN_COLORS.door || item.color === PLAN_COLORS.warehouse || item.color === '#FFFFFF') item.color = PLAN_COLORS.stack
  snapBlock(item)
  if (host.capacity == null) ElMessage.warning('所在仓库还没有库容，无法计算堆位库容')
  else applyStackCapacity(item)
}

let deleteAsking = false

async function removeSelected() {
  if (!selectedIds.value.length || deleteAsking) return
  const ids = new Set(selectedIds.value)
  const houses = plan.items.filter((item) => ids.has(item.id) && isWarehouseItem(item))
  const stacks = plan.items.filter((item) => ids.has(item.id) && item.type === 'stack')
  if (houses.length || stacks.length) {
    const houseText = houses.length === 1 ? `仓库「${houses[0].name || '未命名'}」` : `${houses.length} 个仓库`
    const stackText = stacks.length === 1 ? `堆位「${stacks[0].name || '未命名'}」` : `${stacks.length} 个堆位`
    const what = [houses.length ? houseText : '', stacks.length ? stackText : ''].filter(Boolean).join('和')
    const extra = houses.length ? '仓内堆位会一并去掉。' : ''
    deleteAsking = true
    try {
      await ElMessageBox.confirm(`确定删除${what}？${extra}保存后才会从档案中去掉。`, '删除', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
    } catch {
      return
    } finally {
      deleteAsking = false
    }
    if (!selectedIds.value.length) return
  }
  remember()
  const picked = new Set(selectedIds.value)
  const inner = new Set<string>()
  for (const host of plan.items.filter((item) => picked.has(item.id) && isWarehouseItem(item))) {
    stageItem(host)
    for (const stack of stacksInside(host)) {
      stageItem(stack)
      inner.add(stack.id)
    }
  }
  for (const item of plan.items) {
    if (picked.has(item.id)) stageItem(item)
  }
  plan.items = plan.items.filter((item) => !picked.has(item.id) && !inner.has(item.id))
  clearPick()
  queueSave()
}

function setWarehouse(value: boolean) {
  const item = current.value
  if (!item || !value || isWarehouseItem(item) || item.type === 'stack') return
  remember()
  item.type = 'warehouse'
  item.archive = true
  markArchive(item)
  if (!item.name) item.name = '新仓'
  if (!item.color || item.color === '#FFFFFF' || item.color === PLAN_COLORS.stack || item.color === PLAN_COLORS.door) item.color = PLAN_COLORS.warehouse
  snapBlock(item)
  if (item.capacity == null || item.area == null) {
    beginHouse(item)
    return
  }
  queueSave()
}

function beginHouse(item: PlanItem) {
  houseTargetId = item.id
  houseForm.capacity = item.capacity ?? null
  houseForm.area = item.area ?? null
  houseAccepted = false
  houseOpen.value = true
}

function confirmHouse() {
  const item = plan.items.find((entry) => entry.id === houseTargetId)
  const capacity = houseForm.capacity
  const area = houseForm.area
  if (!item || capacity == null || area == null || Number.isNaN(Number(capacity)) || Number.isNaN(Number(area))) {
    ElMessage.warning('请填写库容和面积')
    return
  }
  item.capacity = Number(capacity)
  item.area = Number(area)
  item.archive = true
  markArchive(item)
  refreshHostStacks(item)
  houseAccepted = true
  houseOpen.value = false
  queueSave()
}

function onHouseClosed() {
  if (houseAccepted) {
    houseAccepted = false
    return
  }
  const item = plan.items.find((entry) => entry.id === houseTargetId)
  if (!item || (item.capacity != null && item.area != null)) return
  item.type = 'zone'
  item.archive = false
  pendingArchives.delete(item.id)
  queueSave()
}

function setMetric(key: 'capacity' | 'area', value: number | undefined) {
  const item = current.value
  if (!item || value == null || Number.isNaN(Number(value))) return
  const next = Number(value)
  const same = item[key] === next
  item[key] = next
  if (isWarehouseItem(item) || item.type === 'stack') {
    item.archive = true
    if (!same) markArchive(item)
  }
  if (key === 'capacity' && isWarehouseItem(item)) {
    refreshHostStacks(item)
    queueSave()
    return
  }
  if (!same) queueSave()
}

/** 堆位库容 = 仓库库容 × 堆位占仓格数占比，结果向下取整。 */
function applyStackCapacity(item: PlanItem) {
  if (item.type !== 'stack') return
  const host = capacityHost(item)
  if (!host || host.capacity == null) return
  const hostArea = host.cols * host.rows
  if (hostArea <= 0) return
    const share = Math.min(hostArea, Math.max(0, overlapArea(item, host)))
  const next = Math.floor((Number(host.capacity) * share) / hostArea)
  if (item.capacity === next && item.archive) return
  item.capacity = next
  item.archive = true
  markArchive(item)
}

function setBlockKind(type: 'stack' | 'door' | 'zone') {
  const item = current.value
  if (!item || isWarehouseItem(item) || item.type === 'stack' || item.type === type) return
  remember()
  item.type = type
  if (type === 'stack') {
    item.archive = true
    markArchive(item)
    const host = capacityHost(item)
    if (!item.name) item.name = host ? nextSlot(host) : 'A1'
    if (!item.color || item.color === PLAN_COLORS.door || item.color === PLAN_COLORS.warehouse || item.color === '#FFFFFF') item.color = PLAN_COLORS.stack
    snapBlock(item)
    if (!host) ElMessage.warning('堆位需要画在仓库内，才会同步到堆位管理')
    else if (host.capacity == null) ElMessage.warning('所在仓库还没有库容，无法计算堆位库容')
    else applyStackCapacity(item)
  } else if (type === 'door') {
    const horizontal = item.cols >= item.rows
    item.cols = horizontal ? 1 : 1 / 3
    item.rows = horizontal ? 1 / 3 : 1
    if (!item.name.trim()) item.name = nextDoorName()
    if (!item.color || item.color === '#FFFFFF' || item.color === '#62646e' || item.color === PLAN_COLORS.stack || item.color === PLAN_COLORS.warehouse) item.color = PLAN_COLORS.door
    tidyDoor(item)
    holdDoor(item)
  } else {
    tidyFree(item)
  }
  queueSave()
}

async function initStacks() {
  const host = pickedWarehouse.value
  if (!host || initBusy.value) return
  const warehouse = warehouseCodeOf(host.name)
  initBusy.value = true
  try {
    const res = await warehouseApi.stacks({ page: 1, pageSize: 500, warehouse })
    if (!res.success || !res.data) {
      ElMessage.error(res.message || '读取堆位失败')
      return
    }
    const stacks = res.data.list.filter((row) => warehouseCodeOf(String(row.warehouse || '')) === warehouse)
    if (!stacks.length) {
      ElMessage.warning(`${warehouse}没有堆位档案，请先在堆位管理维护`)
      return
    }
    const obstacles = plan.items.filter((item) => item.id !== host.id && item.type !== 'stack' && overlaps(item, host))
    const placed = layoutStacks(host, host.name, obstacles, stacks.map((row) => ({
      id: String(row.id),
      code: String(row.code || ''),
      capacity: Number(row.capacity) || 0,
    })))
    if (!placed.length) {
      ElMessage.warning('仓库里没有可分配的空位，请先调整过道、设备等占用')
      return
    }
    remember()
    const removeIds = new Set(
      plan.items.filter((item) => item.type === 'stack' && hostOf(item, plan.items)?.id === host.id).map((item) => item.id),
    )
    plan.items = plan.items.filter((item) => !removeIds.has(item.id))
    const byId = new Map(stacks.map((row) => [String(row.id), row]))
    for (const block of placed) {
      const source = byId.get(block.stackId)
      plan.items.push({
        id: `fp-stack-${block.stackId}`,
        type: 'stack',
        name: block.name,
        color: PLAN_COLORS.stack,
        stackId: block.stackId,
        archiveCode: String(source?.code || ''),
        capacity: Number(source?.capacity) || 0,
        areaLabel: String(source?.areaLabel || '原料区'),
        status: String(source?.status || '启用'),
        archive: true,
        col: block.col,
        row: block.row,
        cols: block.cols,
        rows: block.rows,
      })
    }
    menu.value = null
    noteLoadedArchives()
    queueSave()
    const missed = stacks.length - placed.length
    ElMessage.success(missed > 0
      ? `已按库容绘制 ${placed.length} 个堆位，还有 ${missed} 个放不下`
      : `已按库容绘制 ${placed.length} 个堆位`)
  } finally {
    initBusy.value = false
  }
}

function onNameCommit() {
  const item = current.value
  if (item) markArchive(item)
  queueSave()
}

function queueSave() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => persist(false), 400)
}

type ArchiveRow = Record<string, unknown>

function textOf(value: unknown) {
  return value == null ? '' : String(value)
}

function metric(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function idFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('id' in data)) return ''
  const id = (data as { id?: unknown }).id
  return id == null || id === true ? '' : String(id)
}

function sameHouse(stack: ArchiveRow, house: ArchiveRow) {
  const code = textOf(house.code)
  const id = textOf(house.id)
  const warehouse = textOf(stack.warehouse)
  const warehouseId = textOf(stack.warehouseId)
  if (warehouseId && id && warehouseId === id) return true
  if (warehouse && code && warehouse === code) return true
  return warehouseCodeOf(warehouse) === warehouseCodeOf(code) && Boolean(code)
}

async function loadRows(kind: 'warehouses' | 'stacks') {
  const pageSize = 200
  const rows: ArchiveRow[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= 20; page += 1) {
    const res = kind === 'warehouses'
      ? await warehouseApi.list({ page, pageSize })
      : await warehouseApi.stacks({ page, pageSize })
    if (!res.success || !res.data) return { ok: false as const, message: res.message || '读取失败', rows }
    const fresh = (res.data.list as ArchiveRow[]).filter((row) => {
      const id = textOf(row.id)
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (!fresh.length) break
    rows.push(...fresh)
    if (rows.length >= Number(res.data.total || rows.length)) break
  }
  return { ok: true as const, message: '', rows }
}

function stackCodeOf(item: PlanItem, host: PlanItem) {
  const slot = item.name.replace(/[\r\n]+/g, '').trim()
  if (item.archiveCode) {
    const hash = item.archiveCode.indexOf('#')
    const prev = hash >= 0 ? item.archiveCode.slice(hash + 1) : item.archiveCode
    if (prev === slot) return item.archiveCode
  }
  return stackCode(host.name, slot)
}

function alreadyGone(message: string) {
  return message.includes('不存在') || message.includes('未找到')
}

/** 上次成功写入档案的内容。保存时用来跳过没改过的仓库和堆位。 */
const archiveNotes = new Map<string, string>()
/** 这次打开页面后画过或改过的仓库、堆位。刷新后是空的，避免把旧图再提交一遍。 */
const pendingArchives = new Set<string>()

function markArchive(item: PlanItem) {
  if (isWarehouseItem(item) || item.type === 'stack') pendingArchives.add(item.id)
}

function archiveKey(item: PlanItem) {
  if (isWarehouseItem(item) && item.warehouseId) return `house:${item.warehouseId}`
  if (item.type === 'stack' && item.stackId) return `stack:${item.stackId}`
  return ''
}

function housePayload(item: PlanItem) {
  return {
    code: item.name.replace(/[\r\n]+/g, '').trim(),
    capacity: Number(item.capacity),
    area: Number(item.area),
    status: item.status || '启用',
  }
}

function stackPayload(item: PlanItem, host: PlanItem) {
  return {
    code: stackCodeOf(item, host),
    warehouse: host.name.trim(),
    warehouseId: host.warehouseId || '',
    areaLabel: item.areaLabel || '原料区',
    capacity: Number(item.capacity ?? 0),
    status: item.status || '启用',
  }
}

function noteArchive(item: PlanItem, body: Record<string, unknown>) {
  const key = archiveKey(item)
  if (key) archiveNotes.set(key, JSON.stringify(body))
}

function archiveChanged(item: PlanItem, body: Record<string, unknown>) {
  const key = archiveKey(item)
  if (!key) return true
  return archiveNotes.get(key) !== JSON.stringify(body)
}

function noteLoadedArchives() {
  archiveNotes.clear()
  for (const item of plan.items) {
    if (isWarehouseItem(item) && item.warehouseId && item.name.trim() && item.capacity != null && item.area != null) {
      noteArchive(item, housePayload(item))
      continue
    }
    if (item.type !== 'stack' || !item.stackId) continue
    const host = hostOf(item, plan.items)
    if (!host?.warehouseId || !item.name.trim()) continue
    noteArchive(item, stackPayload(item, host))
  }
}

async function syncArchives() {
  const errors: string[] = []
  const goneStacks = new Set<string>()
  const goneHouses = new Set<string>()

  for (const id of removedStacks.value) {
    if (!id) continue
    const res = await warehouseApi.removeStack(id)
    if (res.success || alreadyGone(res.message)) {
      goneStacks.add(id)
      archiveNotes.delete(`stack:${id}`)
    } else errors.push(res.message || '删除堆位失败')
  }
  removedStacks.value = removedStacks.value.filter((id) => !goneStacks.has(id))
  if (!removedStacks.value.length) removedStackCodes.value = []

  if (!removedStacks.value.length) {
    for (const id of removedWarehouses.value) {
      if (!id) continue
      const res = await warehouseApi.remove(id)
      if (res.success || alreadyGone(res.message)) {
        goneHouses.add(id)
        archiveNotes.delete(`house:${id}`)
      } else errors.push(res.message || '删除仓库失败')
    }
  }
  removedWarehouses.value = removedWarehouses.value.filter((id) => !goneHouses.has(id))
  if (!removedWarehouses.value.length) removedWarehouseCodes.value = []

  for (const item of plan.items.filter((entry) => isWarehouseItem(entry))) {
    if (item.warehouseId && goneHouses.has(item.warehouseId)) {
      delete item.warehouseId
      item.archive = false
      pendingArchives.delete(item.id)
      continue
    }
    if (!pendingArchives.has(item.id)) continue
    const code = item.name.trim()
    if (!item.warehouseId && !item.archive) continue
    if (!code) {
      errors.push('仓库名称不能为空')
      continue
    }
    if (item.capacity == null || item.area == null) {
      if (!item.warehouseId) errors.push(`${code}未填写库容或面积`)
      continue
    }
    const body = housePayload(item)
    if (item.warehouseId) {
      if (!archiveChanged(item, body)) {
        pendingArchives.delete(item.id)
        continue
      }
      const res = await warehouseApi.update(item.warehouseId, body)
      if (!res.success) errors.push(res.message || `${code}保存失败`)
      else {
        noteArchive(item, body)
        pendingArchives.delete(item.id)
      }
    } else if (item.archive) {
      const res = await warehouseApi.create(body)
      if (!res.success) errors.push(res.message || `${code}创建失败`)
      else {
        const id = idFrom(res.data)
        if (id) {
          item.warehouseId = id
          noteArchive(item, body)
          pendingArchives.delete(item.id)
        } else errors.push(`${code}已创建但没有取到编号`)
      }
    }
  }

  for (const item of plan.items.filter((entry) => entry.type === 'stack')) {
    if (item.stackId && goneStacks.has(item.stackId)) {
      delete item.stackId
      item.archive = false
      pendingArchives.delete(item.id)
      continue
    }
    if (!pendingArchives.has(item.id)) continue
    if (!item.stackId && !item.archive) continue
    const host = hostOf(item, plan.items)
    const slot = item.name.trim()
    if (!host) {
      errors.push(`堆位${slot || ''}不在仓库内`)
      continue
    }
    if (!slot) {
      errors.push('堆位名称不能为空')
      continue
    }
    if (!host.warehouseId) {
      errors.push(`${slot}所在仓库还没有档案`)
      continue
    }
    const body = stackPayload(item, host)
    if (item.stackId) {
      if (!archiveChanged(item, body)) {
        pendingArchives.delete(item.id)
        continue
      }
      const res = await warehouseApi.updateStack(item.stackId, body)
      if (!res.success) errors.push(res.message || `${body.code}保存失败`)
      else {
        item.archiveCode = body.code
        noteArchive(item, body)
        pendingArchives.delete(item.id)
      }
    } else if (item.archive) {
      const res = await warehouseApi.createStack(body)
      if (!res.success) errors.push(res.message || `${body.code}创建失败`)
      else {
        const id = idFrom(res.data)
        if (id) {
          item.stackId = id
          item.archiveCode = body.code
          noteArchive(item, body)
          pendingArchives.delete(item.id)
        } else errors.push(`${body.code}已创建但没有取到编号`)
      }
    }
  }
  return errors
}

async function initPark() {
  if (initBusy.value || saveBusy.value) return
  if (plan.items.length) {
    try {
      await ElMessageBox.confirm('将清空平面图，只按当前仓库和堆位档案重新绘制。', '初始化', {
        type: 'warning',
        confirmButtonText: '初始化',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
  initBusy.value = true
  try {
    const houses = await loadRows('warehouses')
    if (!houses.ok) {
      ElMessage.error(houses.message)
      return
    }
    const stacks = await loadRows('stacks')
    if (!stacks.ok) {
      ElMessage.error(stacks.message)
      return
    }
    if (!houses.rows.length) {
      remember()
      plan.items = []
      removedWarehouses.value = []
      removedWarehouseCodes.value = []
      removedStacks.value = []
      removedStackCodes.value = []
      noteLoadedArchives()
      clearPick()
      queueSave()
      centerContent()
      ElMessage.warning('没有仓库档案，平面图已清空')
      return
    }
    const grouped = new Map<string, ArchiveRow[]>()
    for (const house of houses.rows) grouped.set(textOf(house.id), [])
    const usedStacks = new Set<string>()
    for (const stack of stacks.rows) {
      const id = textOf(stack.id)
      if (!id || usedStacks.has(id)) continue
      const byId = houses.rows.find((house) => textOf(stack.warehouseId) && textOf(stack.warehouseId) === textOf(house.id))
      const house = byId || houses.rows.find((item) => sameHouse(stack, item))
      if (!house) continue
      usedStacks.add(id)
      grouped.get(textOf(house.id))?.push(stack)
    }
    const seeds = houses.rows.map((house) => ({
      id: textOf(house.id),
      code: textOf(house.code) || '仓库',
      capacity: Number(house.capacity) || 0,
      area: Number(house.area) || 0,
      stacks: (grouped.get(textOf(house.id)) || []).map((stack) => ({
        id: textOf(stack.id),
        code: textOf(stack.code),
        capacity: Number(stack.capacity) || 0,
      })),
    }))
    const placed = layoutPark(plan.gridCols, plan.gridRows, seeds)
    const stackMeta = new Map(stacks.rows.map((stack) => [textOf(stack.id), stack]))
    const houseMeta = new Map(houses.rows.map((house) => [textOf(house.id), house]))
    remember()
    plan.items = []
    let stackCount = 0
    let missed = 0
    for (const house of placed) {
      const meta = houseMeta.get(house.warehouseId)
      plan.items.push({
        id: `fp-wh-${house.warehouseId}`,
        type: 'warehouse',
        name: house.name,
        color: PLAN_COLORS.warehouse,
        warehouseId: house.warehouseId,
        capacity: metric(meta?.capacity),
        area: metric(meta?.area),
        status: textOf(meta?.status) || '启用',
        archive: true,
        col: house.col,
        row: house.row,
        cols: house.cols,
        rows: house.rows,
      })
      const expected = seeds.find((seed) => seed.id === house.warehouseId)?.stacks.length || 0
      missed += Math.max(0, expected - house.stacks.length)
      for (const block of house.stacks) {
        const source = stackMeta.get(block.stackId)
        plan.items.push({
          id: `fp-stack-${block.stackId}`,
          type: 'stack',
          name: block.name,
          color: PLAN_COLORS.stack,
          stackId: block.stackId,
          archiveCode: textOf(source?.code),
          capacity: Number(source?.capacity) || 0,
          areaLabel: textOf(source?.areaLabel) || '原料区',
          status: textOf(source?.status) || '启用',
          archive: true,
          col: block.col,
          row: block.row,
          cols: block.cols,
          rows: block.rows,
        })
        stackCount += 1
      }
    }
    removedWarehouses.value = []
    removedWarehouseCodes.value = []
    removedStacks.value = []
    removedStackCodes.value = []
    noteLoadedArchives()
    clearPick()
    queueSave()
    centerContent()
    ElMessage.success(missed > 0
      ? `已绘制 ${placed.length} 个仓库、${stackCount} 个堆位，还有 ${missed} 个堆位没有铺下`
      : `已绘制 ${placed.length} 个仓库、${stackCount} 个堆位`)
  } finally {
    initBusy.value = false
  }
}

async function persist(notify: boolean) {
  if (notify && saving.value) return
  if (!planReady.value) {
    if (notify) ElMessage.error('平面图尚未从服务器读回，不能保存')
    return
  }
  const started = Date.now()
  if (notify) saving.value = true
  let errors: string[] = []
  let failed = ''
  try {
    if (notify) {
      saveBusy.value = true
      try {
        errors = await syncArchives()
      } finally {
        saveBusy.value = false
      }
    }
    plan.removedWarehouseIds = [...removedWarehouses.value]
    plan.removedWarehouseCodes = [...removedWarehouseCodes.value]
    plan.removedStackIds = [...removedStacks.value]
    plan.removedStackCodes = [...removedStackCodes.value]
    const res = await floorApi.save({ ...plan, items: plan.items.map((item) => ({ ...item })) })
    if (!res.success || !res.data) {
      if (!res.success) failed = res.message || '平面图保存失败'
    } else {
      for (const saved of res.data.items || []) {
        const item = plan.items.find((entry) => entry.id === saved.id)
        if (!item) continue
        if (saved.stackId) item.stackId = saved.stackId
        if (saved.warehouseId) item.warehouseId = saved.warehouseId
        if (saved.archiveCode) item.archiveCode = saved.archiveCode
      }
    }
  } catch (error) {
    failed = error instanceof Error ? error.message : '平面图保存失败'
  } finally {
    if (notify) {
      const wait = Math.max(0, 2000 - (Date.now() - started))
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
      saving.value = false
    }
  }
  if (!notify) {
    if (failed) ElMessage.error(failed)
    return
  }
  if (failed) {
    ElMessage.error(failed)
    return
  }
  if (errors.length) ElMessage.error(errors.slice(0, 3).join('；'))
  else ElMessage.success('平面图已保存，仓库和堆位已同步')
}

function applyGrid() {
  plan.gridPx = Math.max(8, Math.min(80, Number(gridPxDraft.value) || 24))
  gridPxDraft.value = plan.gridPx
  settingsOpen.value = false
  layout()
  queueSave()
}

function openSettings() {
  gridPxDraft.value = plan.gridPx || 24
  settingsOpen.value = true
}
</script>

<template>
  <div class="plan">
    <div class="toolbar">
      <div class="modes">
        <el-tooltip content="仓库" placement="bottom" :show-after="300">
          <button type="button" aria-label="仓库" :class="{ on: mode === 'draw' && brush === 'warehouse' }" @click="setBrush('warehouse')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7" /><path d="M6 10.5V20h12v-9.5" /><path d="M10 20v-5h4v5" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="堆位" placement="bottom" :show-after="300">
          <button type="button" aria-label="堆位" :class="{ on: mode === 'draw' && brush === 'stack' }" @click="setBrush('stack')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="普通区域" placement="bottom" :show-after="300">
          <button type="button" aria-label="普通区域" :class="{ on: mode === 'draw' && brush === 'zone' }" @click="setBrush('zone')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="12" rx="1.5" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="门" placement="bottom" :show-after="300">
          <button type="button" aria-label="门" :class="{ on: mode === 'draw' && brush === 'door' }" @click="setBrush('door')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v16" /><path d="M8 4h9" /><path d="M8 20a9 9 0 0 0 9-9" /></svg>
          </button>
        </el-tooltip>
        <span class="mode-split" />
        <el-tooltip content="框选" placement="bottom" :show-after="300">
          <button type="button" aria-label="框选" :class="{ on: mode === 'select' }" @click="setMode('select')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
          </button>
        </el-tooltip>
      </div>
      <div class="actions">
        <el-tooltip content="初始化" placement="bottom" :show-after="300">
          <button type="button" aria-label="初始化" :disabled="initBusy || saveBusy || saving" @click="initPark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.2-5.5" /><path d="M20 4v5h-5" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="设置" placement="bottom" :show-after="300">
          <button type="button" aria-label="设置" @click="openSettings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3V21M3.5 12h2.2M18.3 12H21M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="帮助" placement="bottom" :show-after="300">
          <button type="button" aria-label="帮助" @click="helpOpen = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></svg>
          </button>
        </el-tooltip>
        <el-tooltip content="保存" placement="bottom" :show-after="300">
          <button type="button" class="primary" aria-label="保存" :disabled="saveBusy || saving" @click="persist(true)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><path d="M8 20v-6h8v6" /></svg>
          </button>
        </el-tooltip>
      </div>
    </div>
    <div
      ref="boardRef"
      class="board"
      :class="{ draw: mode === 'draw' && !space && !saving, pan: space, select: mode === 'select' && !space && !saving, 'is-saving': saving }"
      @pointermove="onMove"
      @pointerup="onUp"
      @selectstart="keepCanvasClear"
      @contextmenu.prevent
      @wheel.prevent="onWheel"
    >
      <PlanSvg
        ref="canvas"
        :plan="plan"
        theme="editor"
        :selected-ids="selectedIds"
        :draft="draft"
        :marquee="marquee"
        :handles="resizeBox"
        :view="view"
        @blank="onBlank"
        @item-down="onItemDown"
        @item-menu="openMenu"
        @handle-down="onHandleDown"
      />
      <YardMapLoading
        v-if="saving"
        tone="cockpit"
        kicker="SYS // FLOOR-PLAN"
        title="平面图保存中"
        hint="同步仓库与堆位档案"
      />
      <div
        v-if="menu?.kind === 'actions'"
        ref="menuEl"
        class="prop menu"
        :style="menuStyle"
        @pointerdown.stop
      >
        <button type="button" @click="chooseDrag">拖拽</button>
        <button type="button" @click="chooseScale">缩放</button>
        <button v-if="pickedWarehouse" type="button" :disabled="initBusy" @click="initStacks">初始化堆位</button>
        <button type="button" class="danger" @click="removeSelected">删除</button>
      </div>
      <div
        v-else-if="current && menu?.kind === 'props'"
        ref="menuEl"
        class="prop"
        :style="menuStyle"
        @pointerdown.stop
      >
        <label>名称</label>
        <el-input ref="nameInput" v-model="current.name" class="name-box" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" size="small" @change="onNameCommit" @keydown.enter.stop />
        <div v-if="current.type !== 'door'" class="span">
          <el-input-number :model-value="current.cols" :min="current.type === 'zone' ? 0.08 : 1" :step="current.type === 'zone' ? 0.1 : 1" :precision="current.type === 'zone' ? 2 : 0" size="small" controls-position="right" @update:model-value="(value: number | undefined) => setSpan('cols', value)" @change="(value: number | undefined) => setSpan('cols', value)" />
          <span>×</span>
          <el-input-number :model-value="current.rows" :min="current.type === 'zone' ? 0.08 : 1" :step="current.type === 'zone' ? 0.1 : 1" :precision="current.type === 'zone' ? 2 : 0" size="small" controls-position="right" @update:model-value="(value: number | undefined) => setSpan('rows', value)" @change="(value: number | undefined) => setSpan('rows', value)" />
        </div>
        <button v-if="current.type === 'door'" type="button" @click="rotateDoor">旋转</button>
        <template v-if="current.type === 'stack'">
          <label>库容(吨)</label>
          <el-input-number :model-value="current.capacity" :min="0" size="small" :controls="false" readonly />
        </template>
        <label>背景色</label>
        <div class="swatches">
          <button
            v-for="swatch in PLAN_SWATCHES"
            :key="swatch.id"
            type="button"
            :title="swatch.id"
            :class="{ on: sameSwatch(current.color, swatch.value) }"
            :style="{ background: swatch.preview }"
            @click="pickColor(swatch.value)"
          />
        </div>
        <template v-if="!kindLocked">
          <label class="switch">
            <span>是否仓库</span>
            <el-switch v-model="warehouseOn" />
          </label>
          <template v-if="warehouseOn && current">
            <label>库容(吨)</label>
            <el-input-number :model-value="current.capacity" :min="0" size="small" controls-position="right" @update:model-value="(value: number | undefined) => setMetric('capacity', value)" @change="(value: number | undefined) => setMetric('capacity', value)" />
            <label>面积(㎡)</label>
            <el-input-number :model-value="current.area" :min="0" size="small" controls-position="right" @change="(value: number | undefined) => setMetric('area', value)" />
          </template>
          <label class="switch">
            <span>是否堆位</span>
            <el-switch v-model="stackOn" :disabled="warehouseOn" />
          </label>
          <label class="switch">
            <span>门</span>
            <el-switch v-model="doorOn" :disabled="warehouseOn" />
          </label>
        </template>
        <template v-else-if="warehouseOn && current">
          <label>库容(吨)</label>
          <el-input-number :model-value="current.capacity" :min="0" size="small" controls-position="right" @update:model-value="(value: number | undefined) => setMetric('capacity', value)" @change="(value: number | undefined) => setMetric('capacity', value)" />
          <label>面积(㎡)</label>
          <el-input-number :model-value="current.area" :min="0" size="small" controls-position="right" @change="(value: number | undefined) => setMetric('area', value)" />
        </template>
        <button v-if="warehouseOn" type="button" :disabled="initBusy" @click="initStacks">初始化堆位</button>
        <button type="button" class="danger" @click="removeSelected">删除区块</button>
      </div>
    </div>

    <el-dialog v-model="houseOpen" title="仓库库容与面积" width="420px" align-center :close-on-click-modal="false" @closed="onHouseClosed">
      <el-form label-width="88px">
        <el-form-item label="库容(吨)">
          <el-input-number v-model="houseForm.capacity" :min="0" :step="1" />
        </el-form-item>
        <el-form-item label="面积(㎡)">
          <el-input-number v-model="houseForm.area" :min="0" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="houseOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmHouse">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settingsOpen" title="网格设置" width="420px" align-center>
      <el-form label-width="88px">
        <el-form-item label="网格 px">
          <el-input-number v-model="gridPxDraft" :min="8" :max="80" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsOpen = false">取消</el-button>
        <el-button type="primary" @click="applyGrid">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="helpOpen" class="help-dialog" title="绘制说明" width="720px" align-center>
      <div class="help">
        <section>
          <h3>绘制</h3>
          <ul>
            <li>先点左侧图标：仓库、堆位、普通区域或门。框选在分隔线右边。</li>
            <li>仓库和堆位：左键拖拽，松开后按网格生成。</li>
            <li>普通区域和门不强制吸附网格，位置可以是小数。边线距离网格线 2 像素以内时自动贴上。</li>
            <li>单击区块即选中。设置出现在外侧，并聚焦名称。</li>
            <li>选中后再拖动是移动。拖动仓库时，仓内区块一起移动。</li>
            <li>画布与驾驶舱同一套暗色。背景色快捷项取驾驶舱里的实色和斜纹。</li>
            <li>选中区块后四角出现金色折角，拖动折角可改大小。</li>
            <li>右键也能打开设置。仓库、堆位、普通区域可改宽高和背景色。</li>
            <li>设置里的网格 px 是每一格的屏幕像素边长。驾驶舱按同一像素显示，并把已绘制区域居中。</li>
          </ul>
        </section>
        <section>
          <h3>仓库与堆位</h3>
          <ul>
            <li>用仓库画笔绘制后填写库容和面积。仓库不能改成普通区域或门。</li>
            <li>用堆位画笔在仓库里绘制、大部分格子落在仓内、且小于仓库时，直接标为堆位。库容按所占格子百分比向下取整，以小字水印标在堆位右下角。堆位不能改成普通区域或门。</li>
            <li>改堆位大小、角点，或改仓库库容和大小，都会重算。</li>
            <li>保存时播放扫描动画。刷新后直接保存只提交平面图。这次改过或删过的仓库、堆位才提交档案。门、过道、设备、生产线不写入。删除后先删堆位档案，再删仓库档案。</li>
          </ul>
        </section>
        <section>
          <h3>门</h3>
          <ul>
            <li>固定一格长、三分之一格宽。横向拖为横门，纵向拖为竖门，单击为横门。设置里点旋转，绕中心转 90 度。</li>
            <li>默认名称按 1号门、2号门 顺延。</li>
            <li>不强制吸附网格。靠近网格线 2 像素时自动贴上。靠在仓库上时，允许溢出一个门宽。</li>
            <li>名称写在门内。扁门横排，窄门竖排，字号随宽高缩小。</li>
          </ul>
        </section>
        <section>
          <h3>初始化</h3>
          <ul>
            <li>工具条「初始化」先清空平面图，再按库容铺仓库，留白 30%，堆位平分所在仓库。</li>
            <li>右键某个仓库点「初始化堆位」，只重排该仓，并避开过道和设备。</li>
          </ul>
        </section>
        <section>
          <h3>框选</h3>
          <ul>
            <li>左键拉框，松开后高亮相交区块。</li>
            <li>右键可选拖拽、缩放或删除。选中仓库时也可初始化堆位。</li>
            <li>Del 删除选中区块。删除仓库或堆位前会再确认一次。</li>
            <li>菜单靠近底部或右侧时，改向展开。</li>
          </ul>
        </section>
        <section>
          <h3>名称</h3>
          <ul>
            <li>名称可按回车换行，画布上按行显示。</li>
            <li>仓库名称在区块外底部居中。</li>
            <li>堆位名称在左下角。</li>
            <li>其他区块名称在块内居中，窄块竖排，并画在仓库之上。</li>
          </ul>
        </section>
        <section class="keys">
          <h3>快捷键</h3>
          <p>
            <span><kbd>滚轮</kbd>缩放</span>
            <span><kbd>空格</kbd>拖拽平移</span>
            <span><kbd>Delete</kbd>删除区块</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd>撤销</span>
          </p>
        </section>
      </div>
      <template #footer>
        <el-button type="primary" @click="helpOpen = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.plan {
  height: 100%;
  min-height: 680px;
  display: flex;
  flex-direction: column;
  border: 1px solid #2a3140;
  border-radius: 10px;
  background: #14181d;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-bottom: 1px solid #2a3140;
  background: #1c2126;
}
.modes {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: #2c313a;
}
.modes button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #c8cdd6;
  cursor: pointer;
}
.modes button:hover { background: rgba(255, 255, 255, .08); color: #fff; }
.modes button.on {
  background: var(--el-color-primary);
  color: #fff;
}
.modes svg { width: 18px; height: 18px; display: block; }
.mode-split {
  width: 1px;
  align-self: stretch;
  margin: 6px 4px;
  background: rgba(255, 255, 255, .18);
}
.actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: #2c313a;
}
.actions button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #c8cdd6;
  cursor: pointer;
}
.actions button:hover { background: rgba(255, 255, 255, .08); color: #fff; }
.actions button.primary {
  background: var(--el-color-primary);
  color: #fff;
}
.actions button.primary:hover { background: var(--el-color-primary-dark-2); }
.actions button:disabled { cursor: wait; opacity: 0.55; }
.actions svg { width: 18px; height: 18px; display: block; }
.board {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  border: 0;
  background: #1c2126;
  overflow: hidden;
  user-select: none;
}
.board :deep(input),
.board :deep(textarea) {
  user-select: text;
}
.board.draw, .board.select { cursor: crosshair; }
.board.is-saving { cursor: default; }
.board.pan { cursor: grab; }
.prop.menu { width: 132px; }
.prop > button,
.prop.menu button {
  height: 32px;
  border: 1px solid #3a4254;
  border-radius: 6px;
  background: #2a3140;
  color: #e8edf5;
  cursor: pointer;
  text-align: left;
  padding: 0 10px;
}
.prop > button:hover,
.prop.menu button:hover { border-color: #e7c98a; color: #e7c98a; }
.prop > button:disabled,
.prop.menu button:disabled { cursor: wait; color: #8a97a8; }
.prop {
  position: absolute;
  z-index: 3;
  width: 248px;
  padding: 12px;
  background: #1e2430;
  border: 1px solid #3a4254;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prop label { color: #9aa6b8; font-size: 13px; }
.name-box :deep(textarea) { resize: none; }
.span { display: flex; align-items: center; gap: 8px; }
.span :deep(.el-input-number) { width: 92px; }
.span > span { color: #9aa6b8; line-height: 1; }
.swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.swatches button { height: 22px; padding: 0; border: 1px solid #3a4254; border-radius: 4px; cursor: pointer; }
.swatches button.on { outline: 2px solid #e7c98a; outline-offset: 1px; }
.danger { color: #b42318; border-color: #e7c4c0; }
.danger:hover { color: #b42318; border-color: #b42318; }
.switch { display: flex; align-items: center; justify-content: space-between; }
.help {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  max-height: min(68vh, 640px);
  overflow: auto;
}
.help section {
  margin: 0;
  padding: 12px 14px 10px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
}
.help h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary-dark-2);
}
.help ul {
  margin: 0;
  padding-left: 18px;
  color: #1a2332;
  font-size: 13px;
  line-height: 1.7;
}
.help li + li { margin-top: 4px; }
.help .keys { grid-column: 1 / -1; }
.help .keys p { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0; color: #1a2332; font-size: 13px; }
.help .keys kbd + kbd { margin-left: 2px; }
.help kbd {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 4px;
  background: #fff;
  color: var(--el-color-primary-dark-2);
  font-family: inherit;
  font-size: 12px;
  line-height: 22px;
}
@media (max-width: 720px) {
  .help { grid-template-columns: 1fr; }
}
</style>
