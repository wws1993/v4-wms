<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { floorApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import { PLAN_COLORS, PLAN_TOOLS, defaultPlan, presetSize } from '@/plan/model'
import type { FloorPlan, PlanItem, PlanType } from '@/types'

const tools = PLAN_TOOLS
const plan = reactive<FloorPlan>(defaultPlan())
const tool = ref<PlanType | 'select'>('select')
const selected = ref('')
const canvas = ref<InstanceType<typeof PlanSvg>>()
const boardRef = ref<HTMLElement>()
const view = reactive({ x: 0, y: 0, w: 42, h: 26 })
const draft = ref<{ type: PlanType; col: number; row: number; cols: number; rows: number } | null>(null)
let history: string[] = []
let future: string[] = []
let action: { kind: 'draw' | 'move' | 'resize' | 'pan'; id?: string; dir?: string; x: number; y: number; col: number; row: number; cols: number; rows: number; vx: number; vy: number } | null = null

const current = computed(() => plan.items.find((item) => item.id === selected.value))
const canColor = computed(() => current.value && !['stack', 'road', 'bush'].includes(current.value.type))

function resetView() {
  view.x = 0
  view.y = 0
  view.w = plan.gridCols
  view.h = plan.gridRows
}

function point(event: PointerEvent) {
  return canvas.value?.locate(event) || { x: 0, y: 0 }
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
  selected.value = ''
}

function redo() {
  const next = future.pop()
  if (!next) return
  history.push(JSON.stringify(plan.items))
  plan.items = JSON.parse(next)
}

onMounted(async () => {
  const res = await floorApi.get()
  if (res.success && res.data?.items?.length) Object.assign(plan, res.data)
  resetView()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onKey(event: KeyboardEvent) {
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

function capture(event: PointerEvent) {
  try { boardRef.value?.setPointerCapture(event.pointerId) } catch { /* 非按压中的指针不能捕获 */ }
}

function onBlank(event: PointerEvent) {
  capture(event)
  const p = point(event)
  if (tool.value === 'select') {
    selected.value = ''
    action = { kind: 'pan', x: event.clientX, y: event.clientY, col: 0, row: 0, cols: 0, rows: 0, vx: view.x, vy: view.y }
    return
  }
  remember()
  const startCol = Math.floor(p.x)
  const startRow = Math.floor(p.y)
  draft.value = { type: tool.value, col: startCol, row: startRow, cols: 1, rows: 1 }
  action = { kind: 'draw', x: p.x, y: p.y, col: startCol, row: startRow, cols: 1, rows: 1, vx: 0, vy: 0 }
}

function onItemDown(event: PointerEvent, item: PlanItem) {
  capture(event)
  selected.value = item.id
  if (tool.value !== 'select') {
    onBlank(event)
    return
  }
  remember()
  const p = point(event)
  action = { kind: 'move', id: item.id, x: p.x, y: p.y, col: item.col, row: item.row, cols: item.cols, rows: item.rows, vx: 0, vy: 0 }
}

function onHandleDown(event: PointerEvent, dir: string) {
  capture(event)
  const item = current.value
  if (!item) return
  remember()
  const p = point(event)
  action = { kind: 'resize', id: item.id, dir, x: p.x, y: p.y, col: item.col, row: item.row, cols: item.cols, rows: item.rows, vx: 0, vy: 0 }
}

function onMove(event: PointerEvent) {
  if (!action) return
  if (action.kind === 'pan') {
    const svg = canvas.value?.el()
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    view.x = action.vx - ((event.clientX - action.x) / rect.width) * view.w
    view.y = action.vy - ((event.clientY - action.y) / rect.height) * view.h
    return
  }
  const p = point(event)
  if (action.kind === 'draw' && draft.value) {
    const col = Math.min(action.col, Math.floor(p.x))
    const row = Math.min(action.row, Math.floor(p.y))
    draft.value = {
      type: draft.value.type,
      col,
      row,
      cols: Math.max(1, Math.abs(Math.floor(p.x) - action.col) + 1),
      rows: Math.max(1, Math.abs(Math.floor(p.y) - action.row) + 1),
    }
    return
  }
  const item = plan.items.find((entry) => entry.id === action?.id)
  if (!item) return
  if (action.kind === 'move') {
    item.col = clamp(Math.round(action.col + p.x - action.x), 0, plan.gridCols - item.cols)
    item.row = clamp(Math.round(action.row + p.y - action.y), 0, plan.gridRows - item.rows)
    return
  }
  if (action.kind === 'resize') {
    const east = action.dir?.includes('e')
    const south = action.dir?.includes('s')
    const x2 = east ? Math.round(p.x) : action.col
    const y2 = south ? Math.round(p.y) : action.row
    const x1 = east ? action.col : Math.round(p.x)
    const y1 = south ? action.row : Math.round(p.y)
    item.col = clamp(Math.min(x1, x2), 0, plan.gridCols - 1)
    item.row = clamp(Math.min(y1, y2), 0, plan.gridRows - 1)
    item.cols = clamp(Math.max(1, Math.abs(x2 - x1) || 1), 1, plan.gridCols - item.col)
    item.rows = clamp(Math.max(1, Math.abs(y2 - y1) || 1), 1, plan.gridRows - item.row)
  }
}

function onUp() {
  if (action?.kind === 'draw' && draft.value) {
    const size = Math.abs(draft.value.cols) < 1 && Math.abs(draft.value.rows) < 1
      ? presetSize(draft.value.type)
      : { cols: draft.value.cols, rows: draft.value.rows }
    const item: PlanItem = {
      id: `fp-${Date.now()}`,
      type: draft.value.type,
      name: tools.find((entry) => entry.type === draft.value.type)?.label || '',
      col: clamp(draft.value.col, 0, plan.gridCols - 1),
      row: clamp(draft.value.row, 0, plan.gridRows - 1),
      cols: size.cols,
      rows: size.rows,
    }
    if (item.type === 'warehouse' || item.type === 'idle') item.name = item.type === 'idle' ? '停用仓' : '新仓'
    if (item.type === 'door') item.name = '门'
    if (item.type === 'stack') item.name = 'A1'
    plan.items.push(item)
    selected.value = item.id
    draft.value = null
    tool.value = 'select'
  }
  action = null
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const p = point(event as unknown as PointerEvent)
  const next = clamp(view.w * (event.deltaY < 0 ? 0.9 : 1.12), plan.gridCols / 8, plan.gridCols)
  const k = next / view.w
  view.x = p.x - (p.x - view.x) * k
  view.y = p.y - (p.y - view.y) * k
  view.w = next
  view.h = next * (plan.gridRows / plan.gridCols)
}

function removeSelected() {
  if (!selected.value) return
  remember()
  plan.items = plan.items.filter((item) => item.id !== selected.value)
  selected.value = ''
}

async function save() {
  const res = await floorApi.save(plan)
  if (res.success) ElMessage.success(res.message)
  else ElMessage.error(res.message)
}

function setColor(value: string | null) {
  if (current.value && value) current.value.color = value
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
</script>

<template>
  <div class="plan">
    <div ref="boardRef" class="board" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp" @wheel.prevent="onWheel">
      <PlanSvg
        ref="canvas"
        :plan="plan"
        theme="editor"
        :selected-id="selected"
        :draft="draft"
        :view="view"
        @blank="onBlank"
        @item-down="onItemDown"
        @handle-down="onHandleDown"
      />
      <div class="zoom">
        <button type="button" @click="view.w = clamp(view.w * 1.15, plan.gridCols / 8, plan.gridCols); view.h = view.w * plan.gridRows / plan.gridCols">－</button>
        <button type="button" @click="resetView">1:1</button>
        <button type="button" @click="view.w = clamp(view.w * 0.87, plan.gridCols / 8, plan.gridCols); view.h = view.w * plan.gridRows / plan.gridCols">＋</button>
      </div>
    </div>
    <aside class="tools">
      <div class="row">
        <span>网格</span>
        <el-input-number v-model="plan.gridCols" :min="10" :max="80" size="small" @change="resetView" />
        <span>×</span>
        <el-input-number v-model="plan.gridRows" :min="8" :max="60" size="small" @change="resetView" />
      </div>
      <button
        v-for="item in tools"
        :key="item.type"
        type="button"
        class="tool"
        :class="{ on: tool === item.type }"
        @click="tool = item.type"
      >
        <i :style="{ background: item.type === 'select' ? '#1b4f8a' : PLAN_COLORS[item.type] }" />
        {{ item.label }}
      </button>
      <template v-if="current">
        <label>名称</label>
        <el-input v-model="current.name" />
        <template v-if="canColor">
          <label>填色</label>
          <el-color-picker :model-value="current.color || PLAN_COLORS[current.type]" @update:model-value="setColor" />
        </template>
      </template>
      <el-button :disabled="!selected" @click="removeSelected">删除</el-button>
      <el-button type="primary" @click="save">保存平面图</el-button>
      <p>按住拖拽绘制矩形。选择后拖动只改位置，四角改大小。仓库 #F8E4C5，门 #9EBCE9，堆位白底；办公楼、生产线、功能区用主色和强调色浅底。Ctrl+Z 撤销。</p>
    </aside>
  </div>
</template>

<style scoped>
.plan { display: grid; grid-template-columns: 1fr 240px; gap: 16px; min-height: 640px; }
.board { position: relative; border: 1px solid #D8DEE8; background: #F0F3F7; min-height: 640px; }
.zoom { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; }
.zoom button { border: 1px solid #d8dee8; background: #fff; color: #1a2332; height: 28px; min-width: 28px; cursor: pointer; }
.tools { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 6px; color: #5a6a7e; }
.tool {
  display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px;
  border: 1px solid #d8dee8; background: #fff; color: #1a2332; cursor: pointer; text-align: left;
}
.tool.on { border-color: #1b4f8a; color: #1b4f8a; }
.tool i { width: 14px; height: 14px; border: 1px solid rgba(26,35,50,.25); }
.tools p { margin: 0; color: #5a6a7e; font-size: 12px; line-height: 1.5; }
</style>
