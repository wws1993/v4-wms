<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { floorApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import { PLAN_COLORS, PLAN_SWATCHES, contentFrame, defaultPlan, hostOf, isWarehouseItem } from '@/plan/model'
import type { FloorPlan, PlanItem, PlanType } from '@/types'

type Rect = { col: number; row: number; cols: number; rows: number }
type Mode = 'draw' | 'select'
type Gesture = 'idle' | 'drag' | 'scale'

const plan = reactive<FloorPlan>(defaultPlan())
const mode = ref<Mode>('draw')
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
const gridPxDraft = ref(24)
const menu = ref<{ x: number; y: number; kind: 'props' | 'actions'; lift: number; shift: number } | null>(null)
const menuEl = ref<HTMLElement | null>(null)
let menuToken = 0
const space = ref(false)
let history: string[] = []
let future: string[] = []
let action: {
  kind: 'draw' | 'marquee' | 'move' | 'resize' | 'pan'
  x: number
  y: number
  dir?: string
  vx: number
  vy: number
  box?: Rect
  origins: { id: string; col: number; row: number; cols: number; rows: number }[]
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

function point(event: { clientX: number; clientY: number }) {
  return canvas.value?.locate(event) || { x: 0, y: 0 }
}

function cellPx() {
  return Math.max(8, Number(plan.gridPx) || 24) * zoom.value
}

function remember() {
  history.push(JSON.stringify(plan.items))
  if (history.length > 40) history.shift()
  future = []
}

function undo() {
  const prev = history.pop()
  if (!prev) return
  future.push(JSON.stringify(plan.items))
  plan.items = JSON.parse(prev)
  clearPick()
  queueSave()
}

function redo() {
  const next = future.pop()
  if (!next) return
  history.push(JSON.stringify(plan.items))
  plan.items = JSON.parse(next)
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
  if (res.success && res.data?.items?.length) {
    Object.assign(plan, res.data)
    if (!plan.gridPx) plan.gridPx = 24
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
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const tag = (event.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    removeSelected()
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
  draft.value = null
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
  if (mode.value === 'select') {
    if (gesture.value === 'drag' && selectedIds.value.includes(item.id)) {
      beginMove(event)
      return
    }
    onBlank(event)
    return
  }
  if (selectedIds.value.length === 1 && item.id === selectedIds.value[0]) {
    beginMove(event)
    return
  }
  onBlank(event)
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
    origins: plan.items.filter((item) => selectedIds.value.includes(item.id)).map((item) => ({
      id: item.id, col: item.col, row: item.row, cols: item.cols, rows: item.rows,
    })),
  }
}

function menuNudge(anchor: number, size: number, boardSize: number) {
  const margin = 8
  const spaceAfter = boardSize - margin - anchor
  const spaceBefore = anchor - margin
  if (size <= spaceAfter || spaceBefore <= spaceAfter) return 0
  return Math.min(size, Math.max(0, spaceBefore))
}

function placeMenu(x: number, y: number, kind: 'props' | 'actions') {
  const token = ++menuToken
  const board = boardRef.value
  const guess = kind === 'props' ? { w: 248, h: 272 } : { w: 120, h: 136 }
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
    openSelectMenu(event)
    return
  }
  selectedIds.value = [item.id]
  gesture.value = 'idle'
  menuAt(event, 'props')
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
    origins: plan.items.filter((item) => selectedIds.value.includes(item.id)).map((item) => ({
      id: item.id, col: item.col, row: item.row, cols: item.cols, rows: item.rows,
    })),
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
  if (action.kind === 'draw') {
    const moved = Math.hypot(event.clientX - action.vx, event.clientY - action.vy) > 4
    if (!moved) return
    draft.value = { type: 'zone', ...snappedRect(action.x, action.y, p.x, p.y) }
    return
  }
  if (action.kind === 'marquee') {
    marquee.value = snappedRect(action.x, action.y, p.x, p.y)
    return
  }
  if (action.kind === 'move') {
    const dx = Math.round(p.x - action.x)
    const dy = Math.round(p.y - action.y)
    for (const origin of action.origins) {
      const item = plan.items.find((entry) => entry.id === origin.id)
      if (!item) continue
      item.col = origin.col + dx
      item.row = origin.row + dy
    }
    return
  }
  if (action.kind !== 'resize' || !action.box) return
  const box = action.box
  let left = box.col
  let top = box.row
  let right = box.col + box.cols
  let bottom = box.row + box.rows
  const gx = Math.round(p.x)
  const gy = Math.round(p.y)
  if (action.dir?.includes('e')) right = Math.max(left + 1, gx)
  if (action.dir?.includes('w')) left = Math.min(right - 1, gx)
  if (action.dir?.includes('s')) bottom = Math.max(top + 1, gy)
  if (action.dir?.includes('n')) top = Math.min(bottom - 1, gy)
  for (const origin of action.origins) {
    const item = plan.items.find((entry) => entry.id === origin.id)
    if (!item) continue
    if (action.origins.length === 1) {
      item.col = left
      item.row = top
      item.cols = Math.max(1, right - left)
      item.rows = Math.max(1, bottom - top)
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
}

function nextSlot(host: PlanItem) {
  const used = new Set(plan.items.filter((item) => item.type === 'stack' && hostOf(item, plan.items)?.id === host.id).map((item) => item.name))
  for (const letter of 'ABCDEFGH') {
    for (let index = 1; index <= 9; index += 1) {
      const name = `${letter}${index}`
      if (!used.has(name)) return name
    }
  }
  return 'A1'
}

function classify(item: PlanItem) {
  if (isWarehouseItem(item)) return
  const host = hostOf(item, plan.items)
  if (host) {
    item.type = 'stack'
    if (!item.name || item.name === '区块') item.name = nextSlot(host)
    if (!item.color) item.color = '#FFFFFF'
    return
  }
  if (item.type === 'stack') item.type = 'zone'
}

function setSpan(axis: 'cols' | 'rows', value: number | undefined) {
  const item = current.value
  if (!item || value == null || Number.isNaN(Number(value))) return
  const next = Math.max(1, Math.round(Number(value)))
  if (item[axis] === next) return
  remember()
  item[axis] = next
  classify(item)
  queueSave()
}

function pickColor(color: string) {
  const item = current.value
  if (!item || item.color?.toLowerCase() === color.toLowerCase()) return
  item.color = color
  queueSave()
}

function onUp() {
  if (action?.kind === 'draw' && draft.value) {
    remember()
    const item: PlanItem = {
      id: `fp-${Date.now()}`,
      type: 'zone',
      name: '',
      color: '#FFFFFF',
      col: draft.value.col,
      row: draft.value.row,
      cols: Math.max(1, draft.value.cols),
      rows: Math.max(1, draft.value.rows),
    }
    plan.items.push(item)
    classify(item)
    selectedIds.value = [item.id]
    draft.value = null
    const board = boardRef.value?.getBoundingClientRect()
    if (board && canvas.value) {
      const svg = canvas.value.el()
      if (svg) {
        const rect = svg.getBoundingClientRect()
        const x = rect.left + ((item.col + item.cols - view.x) / view.w) * rect.width
        const y = rect.top + ((item.row + item.rows - view.y) / view.h) * rect.height
        placeMenu(x - board.left, y - board.top, 'props')
      }
    }
    queueSave()
  } else if (action?.kind === 'marquee' && marquee.value) {
    const box = marquee.value
    selectedIds.value = plan.items.filter((item) => overlaps(item, box)).map((item) => item.id)
    gesture.value = 'idle'
    marquee.value = null
  } else if (action?.kind === 'move' || action?.kind === 'resize') {
    for (const origin of action.origins) {
      const item = plan.items.find((entry) => entry.id === origin.id)
      if (item) classify(item)
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

function removeSelected() {
  if (!selectedIds.value.length) return
  remember()
  const ids = new Set(selectedIds.value)
  plan.items = plan.items.filter((item) => !ids.has(item.id))
  clearPick()
  queueSave()
}

function setWarehouse(value: boolean) {
  const item = current.value
  if (!item) return
  remember()
  if (value) {
    item.type = 'warehouse'
    if (!item.name) item.name = '新仓'
    if (!item.color || item.color === '#FFFFFF') item.color = PLAN_COLORS.warehouse
  } else {
    item.type = 'zone'
    classify(item)
  }
  queueSave()
}

function queueSave() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => persist(false), 400)
}

async function persist(notify: boolean) {
  const res = await floorApi.save({ ...plan, items: plan.items.map((item) => ({ ...item })) })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  if (notify) ElMessage.success(res.message)
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
    <div class="modes">
      <button type="button" :class="{ on: mode === 'draw' }" @click="setMode('draw')">绘制</button>
      <button type="button" :class="{ on: mode === 'select' }" @click="setMode('select')">框选</button>
    </div>
    <div
      ref="boardRef"
      class="board"
      :class="{ draw: mode === 'draw' && !space, pan: space, select: mode === 'select' && !space }"
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
        :handles="gesture === 'scale' || menu?.kind === 'props' ? selectionBox : null"
        :view="view"
        @blank="onBlank"
        @item-down="onItemDown"
        @item-menu="openMenu"
        @handle-down="onHandleDown"
      />
      <div class="corner">
        <button type="button" @click="persist(true)">保存</button>
        <button type="button" @click="openSettings">设置</button>
        <button type="button" @click="helpOpen = true">帮助</button>
      </div>
      <div
        v-if="menu?.kind === 'actions'"
        ref="menuEl"
        class="prop menu"
        :style="menuStyle"
        @pointerdown.stop
      >
        <button type="button" @click="chooseDrag">拖拽</button>
        <button type="button" @click="chooseScale">缩放</button>
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
        <el-input v-model="current.name" size="small" @change="queueSave" />
        <div class="span">
          <el-input-number :model-value="current.cols" :min="1" :step="1" size="small" controls-position="right" @change="(value: number | undefined) => setSpan('cols', value)" />
          <span>×</span>
          <el-input-number :model-value="current.rows" :min="1" :step="1" size="small" controls-position="right" @change="(value: number | undefined) => setSpan('rows', value)" />
        </div>
        <label>背景色</label>
        <div class="swatches">
          <button
            v-for="color in PLAN_SWATCHES"
            :key="color"
            type="button"
            :class="{ on: current.color?.toLowerCase() === color.toLowerCase() }"
            :style="{ background: color }"
            @click="pickColor(color)"
          />
        </div>
        <label class="switch">
          <span>是否仓库</span>
          <el-switch v-model="warehouseOn" />
        </label>
        <button type="button" class="danger" @click="removeSelected">删除区块</button>
      </div>
    </div>

    <el-dialog v-model="settingsOpen" title="网格设置" width="420px" align-center>
      <el-form label-width="88px">
        <el-form-item label="网格 px">
          <el-input-number v-model="gridPxDraft" :min="8" :max="80" :step="1" />
        </el-form-item>
      </el-form>
      <p class="hint">每一格的屏幕像素边长。驾驶舱按同一像素显示，并把已绘制区域居中。</p>
      <template #footer>
        <el-button @click="settingsOpen = false">取消</el-button>
        <el-button type="primary" @click="applyGrid">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="helpOpen" title="绘制说明" width="520px" align-center>
      <ul class="help">
        <li>左侧选「绘制」：左键按下后须拖拽，松开才按网格生成区块；只点击不拖拽不会生成。右键可改名称、是否仓库，宽高在同一行按 x × y 填写，从 12 个色块里选背景色，并拖动角点缩放。鼠标靠近画板底部时弹窗向上展开，靠近右侧时向左展开。</li>
        <li>左侧选「框选」：左键拉框，松开后高亮相交区块。右键可选拖拽、缩放或删除。菜单靠近画板底部或右侧时同样改向展开。</li>
        <li>仓库名称显示在区块外底部居中。其他区块名称在左下角，并画在仓库之上。</li>
        <li>画在仓库内的区块记为堆位。保存后把所占网格同步到堆位管理，入库时按该网格圈选存放位置。</li>
        <li>滚轮缩放。按住空格拖拽可平移画板。Delete 删除当前区块，Ctrl+Z 撤销。</li>
      </ul>
      <template #footer>
        <el-button type="primary" @click="helpOpen = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.plan { min-height: 680px; display: flex; gap: 12px; }
.modes { display: flex; flex-direction: column; gap: 8px; }
.modes button {
  width: 64px;
  height: 36px;
  border: 1px solid #d8dee8;
  background: #fff;
  color: #1a2332;
  cursor: pointer;
}
.modes button.on { border-color: #1b4f8a; color: #1b4f8a; background: #e8eef4; }
.board {
  position: relative;
  flex: 1;
  height: 680px;
  border: 1px solid #D8DEE8;
  background: #F0F3F7;
  overflow: hidden;
  user-select: none;
}
.board :deep(input),
.board :deep(textarea) {
  user-select: text;
}
.board.draw, .board.select { cursor: crosshair; }
.board.pan { cursor: grab; }
.prop.menu { width: 120px; }
.prop.menu button { height: 32px; border: 1px solid #d8dee8; background: #fff; cursor: pointer; text-align: left; padding: 0 10px; }
.corner {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
}
.corner button, .danger {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d8dee8;
  background: #fff;
  color: #1a2332;
  cursor: pointer;
}
.corner button:hover, .danger:hover { border-color: #1b4f8a; color: #1b4f8a; }
.prop {
  position: absolute;
  z-index: 3;
  width: 248px;
  padding: 12px;
  background: #fff;
  border: 1px solid #d8dee8;
  box-shadow: 0 8px 24px rgba(16, 18, 23, .12);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prop label { color: #5a6a7e; font-size: 13px; }
.span { display: flex; align-items: center; gap: 8px; }
.span :deep(.el-input-number) { width: 92px; }
.span > span { color: #5a6a7e; line-height: 1; }
.swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.swatches button { height: 22px; padding: 0; border: 1px solid #d8dee8; cursor: pointer; }
.swatches button.on { outline: 2px solid #1b4f8a; outline-offset: 1px; }
.switch { display: flex; align-items: center; justify-content: space-between; }
.danger { color: #b42318; }
.hint, .help { color: #5a6a7e; font-size: 13px; line-height: 1.6; }
.help { margin: 0; padding-left: 18px; }
</style>
