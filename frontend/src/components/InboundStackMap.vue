<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { floorApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import { contentFrame, defaultPlan, hostOf, isWarehouseItem, stackCode } from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const props = defineProps<{ stacks: Record<string, unknown>[] }>()
const stackCodeModel = defineModel<string>('stackCode', { default: '' })
const cellsModel = defineModel<string>('cells', { default: '' })

const plan = reactive<FloorPlan>(defaultPlan())
const stageRef = ref<HTMLElement>()
const mapRef = ref<InstanceType<typeof PlanSvg>>()
const focusId = ref('')
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
const marquee = ref<{ col: number; row: number; cols: number; rows: number } | null>(null)
let fly = 0
let drag: { item: PlanItem; x: number; y: number } | null = null

const selectedKeys = computed(() => cellsModel.value.split(',').filter(Boolean))

onMounted(async () => {
  const res = await floorApi.get()
  if (res.success && res.data) Object.assign(plan, res.data)
  await nextTick()
  layout()
  const current = stackItem()
  if (current) {
    const host = hostOf(current, plan.items)
    if (host) {
      focusId.value = host.id
      applyFrame(frameOf(host))
    }
  }
  if (stageRef.value) new ResizeObserver(() => { if (!focusId.value) layout() }).observe(stageRef.value)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(fly)
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
})

function archiveOf(item: PlanItem) {
  const host = hostOf(item, plan.items)
  const slot = item.name.replace(/^\d+#/, '').trim() || item.name
  const code = host ? stackCode(host.name, slot) : item.name
  return props.stacks.find((row) => String(row.id) === item.stackId || String(row.code) === item.archiveCode || String(row.code) === code)
}

function gridSize(item: PlanItem) {
  const row = archiveOf(item)
  const cols = Number(row?.gridCols || 0)
  const rows = Number(row?.gridRows || 0)
  if (cols > 0 && rows > 0) return { cols, rows }
  const matched = String(row?.grid || '').match(/(\d+)\s*[×xX]\s*(\d+)/)
  if (matched) return { cols: Number(matched[1]), rows: Number(matched[2]) }
  return { cols: 0, rows: 0 }
}

function codeOf(item: PlanItem) {
  const row = archiveOf(item)
  if (row?.code) return String(row.code)
  if (item.archiveCode) return item.archiveCode
  const host = hostOf(item, plan.items)
  const slot = item.name.replace(/^\d+#/, '').trim() || item.name
  return host ? stackCode(host.name, slot) : item.name
}

function stackItem() {
  return plan.items.find((item) => item.type === 'stack' && codeOf(item) === stackCodeModel.value)
}

function stacksInView() {
  return plan.items.filter((item) => item.type === 'stack' && (!focusId.value || hostOf(item, plan.items)?.id === focusId.value))
}

function cellRect(item: PlanItem, key: string) {
  const size = gridSize(item)
  const [row, col] = key.split('-').map(Number)
  if (!size.cols || !size.rows || !row || !col) return null
  return {
    x: item.col + ((col - 1) * item.cols) / size.cols,
    y: item.row + ((row - 1) * item.rows) / size.rows,
    w: item.cols / size.cols,
    h: item.rows / size.rows,
  }
}

const guides = computed(() => {
  if (!focusId.value) return []
  const marks: { key: string; x: number; y: number; w: number; h: number; on: boolean }[] = []
  for (const item of stacksInView()) {
    const size = gridSize(item)
    const chosen = codeOf(item) === stackCodeModel.value ? selectedKeys.value : []
    for (let row = 1; row <= size.rows; row += 1) {
      for (let col = 1; col <= size.cols; col += 1) {
        const key = `${row}-${col}`
        const rect = cellRect(item, key)
        if (rect) marks.push({ key: `${item.id}-${key}`, ...rect, on: chosen.includes(key) })
      }
    }
  }
  return marks
})

function coverFrame(frame: { x: number; y: number; w: number; h: number }) {
  const el = stageRef.value
  const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : frame.w / frame.h
  let w = frame.w
  let h = frame.h
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  return { x: frame.x + frame.w / 2 - w / 2, y: frame.y + frame.h / 2 - h / 2, w, h }
}

function frameOf(item?: PlanItem) {
  if (!item) return coverFrame(contentFrame(plan))
  const padX = Math.max(0.6, item.cols * 0.12)
  const padY = Math.max(1.2, item.rows * 0.2)
  return coverFrame({ x: item.col - padX, y: item.row - padY, w: item.cols + padX * 2, h: item.rows + padY * 2 })
}

function applyFrame(frame: { x: number; y: number; w: number; h: number }) {
  view.x = frame.x
  view.y = frame.y
  view.w = frame.w
  view.h = frame.h
}

function layout() {
  applyFrame(contentFrame(plan))
}

function flyTo(next: { x: number; y: number; w: number; h: number }) {
  cancelAnimationFrame(fly)
  const from = { x: view.x, y: view.y, w: view.w, h: view.h }
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 420)
    const e = 1 - (1 - t) ** 3
    view.x = from.x + (next.x - from.x) * e
    view.y = from.y + (next.y - from.y) * e
    view.w = from.w + (next.w - from.w) * e
    view.h = from.h + (next.h - from.h) * e
    if (t < 1) fly = requestAnimationFrame(tick)
  }
  fly = requestAnimationFrame(tick)
}

function zoomOut() {
  focusId.value = ''
  marquee.value = null
  flyTo(frameOf())
}

function pointOf(event: PointerEvent) {
  return mapRef.value?.locate(event) || { x: 0, y: 0 }
}

function cellsInside(item: PlanItem, a: { x: number; y: number }, b: { x: number; y: number }) {
  const size = gridSize(item)
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  const keys: string[] = []
  for (let row = 1; row <= size.rows; row += 1) {
    for (let col = 1; col <= size.cols; col += 1) {
      const key = `${row}-${col}`
      const rect = cellRect(item, key)
      if (!rect) continue
      const hit = rect.x < right && rect.x + rect.w > left && rect.y < bottom && rect.y + rect.h > top
      if (hit) keys.push(key)
    }
  }
  return keys
}

function choose(item: PlanItem, keys: string[]) {
  stackCodeModel.value = codeOf(item)
  cellsModel.value = keys.join(',')
}

function onItem(event: PointerEvent, item: PlanItem) {
  if (!focusId.value) {
    const host = isWarehouseItem(item) ? item : item.type === 'stack' ? hostOf(item, plan.items) : undefined
    if (!host) return
    focusId.value = host.id
    flyTo(frameOf(host))
    return
  }
  if (item.type !== 'stack' || !gridSize(item).cols) {
    if (item.type === 'stack') choose(item, [])
    return
  }
  drag = { item, ...pointOf(event) }
  marquee.value = { col: drag.x, row: drag.y, cols: 0, rows: 0 }
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
}

function onDrag(event: PointerEvent) {
  if (!drag) return
  const spot = pointOf(event)
  marquee.value = {
    col: Math.min(drag.x, spot.x),
    row: Math.min(drag.y, spot.y),
    cols: Math.abs(spot.x - drag.x),
    rows: Math.abs(spot.y - drag.y),
  }
}

function endDrag(event: PointerEvent) {
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
  const current = drag
  drag = null
  marquee.value = null
  if (!current) return
  const spot = pointOf(event)
  const moved = Math.hypot(spot.x - current.x, spot.y - current.y) > 0.15
  if (!moved) {
    const key = cellsInside(current.item, current, { x: current.x + 0.01, y: current.y + 0.01 })[0]
    if (!key) return
    const same = stackCodeModel.value === codeOf(current.item)
    const next = new Set(same ? selectedKeys.value : [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    choose(current.item, [...next])
    return
  }
  choose(current.item, cellsInside(current.item, current, spot))
}
</script>

<template>
  <div class="pick">
    <div class="pick-bar">
      <span>{{ focusId ? '在堆位上拖拽框选格子，单击可加减一格' : '点击仓库放大' }}</span>
      <strong v-if="stackCodeModel">{{ stackCodeModel }}<template v-if="selectedKeys.length"> · {{ selectedKeys.length }} 格</template></strong>
      <button v-if="focusId" type="button" @click="zoomOut">返回总览</button>
    </div>
    <div ref="stageRef" class="stage">
      <PlanSvg
        ref="mapRef"
        :plan="plan"
        theme="cockpit"
        :view="view"
        :only-host-id="focusId"
        :marquee="marquee"
        @item-down="onItem"
      >
        <g class="cells">
          <rect
            v-for="mark in guides"
            :key="mark.key"
            :x="mark.x"
            :y="mark.y"
            :width="mark.w"
            :height="mark.h"
            :fill="mark.on ? 'rgba(209,192,64,.62)' : 'transparent'"
            :stroke="mark.on ? '#e7c98a' : 'rgba(255,255,255,.35)'"
            stroke-width="0.03"
          />
        </g>
      </PlanSvg>
    </div>
  </div>
</template>

<style scoped>
.pick { width: 100%; height: 100%; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.pick-bar { display: flex; align-items: center; gap: 12px; color: #5c5c5c; font-size: 13px; }
.pick-bar strong { color: #1a1a1a; }
.pick-bar button {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.stage { flex: 1; width: 100%; min-height: 280px; border-radius: 8px; overflow: hidden; background: #1c2126; }
.cells { pointer-events: none; }
</style>
