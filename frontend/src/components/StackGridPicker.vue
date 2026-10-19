<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { floorApi, inventoryApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import { archiveForStack, cargoStyle, contentFrame, defaultPlan, hostOf, isWarehouseItem, lotsOnStack, stackCellAt, stackCellGrid, stackCellRect, stackCode, type CargoLot } from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const props = defineProps<{ stacks: Record<string, unknown>[] }>()
const stackCodeModel = defineModel<string>('stackCode', { default: '' })
const areaIdModel = defineModel<string>('areaId', { default: '' })
const cellsModel = defineModel<string>('cells', { default: '' })

const plan = reactive<FloorPlan>(defaultPlan())
const lots = ref<CargoLot[]>([])
const stageRef = ref<HTMLElement>()
const mapRef = ref<InstanceType<typeof PlanSvg>>()
const focusId = ref('')
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
const rubber = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const preview = ref<{ code: string; keys: string[] } | null>(null)
const tip = ref<{ title: string; line: string; x: number; y: number } | null>(null)
let fly = 0
let drag: { item: PlanItem; x: number; y: number; px: number; py: number } | null = null

const selectedKeys = computed(() => cellsModel.value.split(',').filter(Boolean))

onMounted(async () => {
  const [res, homeRes] = await Promise.all([floorApi.get(), inventoryApi.home()])
  if (res.success && res.data) Object.assign(plan, res.data)
  if (homeRes.success && Array.isArray(homeRes.data)) lots.value = homeRes.data
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
  listenDrag(false)
})

function slotName(name: string) {
  const flat = name.replace(/[\r\n]+/g, '').trim()
  return flat.replace(/^\d+#/, '').trim() || flat
}

function archiveOf(item: PlanItem) {
  return archiveForStack(item, plan.items, props.stacks)
}

function gridSize(item: PlanItem) {
  return stackCellGrid(item, archiveOf(item))
}

function codeOf(item: PlanItem) {
  const row = archiveOf(item)
  if (row?.code) return String(row.code)
  if (item.archiveCode) return item.archiveCode
  const host = hostOf(item, plan.items)
  const slot = slotName(item.name)
  return host ? stackCode(host.name, slot) : item.name
}

function stackItem() {
  return plan.items.find((item) => item.type === 'stack' && codeOf(item) === stackCodeModel.value)
}

function stacksInView() {
  return plan.items.filter((item) => item.type === 'stack' && (!focusId.value || hostOf(item, plan.items)?.id === focusId.value))
}

function cellRect(item: PlanItem, key: string) {
  return stackCellRect(item, key, gridSize(item))
}

function lotsHere(item: PlanItem) {
  return lotsOnStack(item, plan.items, lots.value)
}

function lotsOnCell(item: PlanItem, key: string) {
  const rows = lotsHere(item)
  const placed = rows.filter((lot) => lot.cells?.length)
  if (placed.length) return placed.filter((lot) => lot.cells?.includes(key))
  return rows
}

const guides = computed(() => {
  if (!focusId.value) return []
  const marks: { key: string; x: number; y: number; w: number; h: number; on: boolean; busy: boolean }[] = []
  for (const item of stacksInView()) {
    const size = gridSize(item)
    const chosen = preview.value?.code === codeOf(item)
      ? preview.value.keys
      : codeOf(item) === stackCodeModel.value ? selectedKeys.value : []
    for (let row = 1; row <= size.rows; row += 1) {
      for (let col = 1; col <= size.cols; col += 1) {
        const key = `${row}-${col}`
        const rect = cellRect(item, key)
        if (rect) marks.push({ key: `${item.id}-${key}`, ...rect, on: chosen.includes(key), busy: lotsHere(item).some((lot) => lot.cells?.includes(key)) })
      }
    }
  }
  return marks
})

const owners = computed(() => {
  if (!focusId.value) return []
  const names = new Set<string>()
  for (const item of stacksInView()) {
    for (const lot of lotsHere(item)) {
      if (lot.consignor) names.add(lot.consignor)
    }
  }
  return [...names]
})

const occupyText = computed(() => {
  if (!focusId.value) return ''
  const names = new Set<string>()
  const cells = new Set<string>()
  let tickets = 0
  for (const item of stacksInView()) {
    for (const lot of lotsHere(item)) {
      tickets += 1
      if (lot.consignor) names.add(lot.consignor)
      for (const key of lot.cells || []) cells.add(`${item.id}:${key}`)
    }
  }
  if (!tickets) return ''
  const where = cells.size ? `在库 ${cells.size} 格` : `在库 ${tickets} 票`
  return [where, [...names].join('、')].filter(Boolean).join(' · ')
})

const clashText = computed(() => {
  const item = stackItem()
  if (!item || !selectedKeys.value.length) return ''
  const rows = lotsHere(item)
  const placed = rows.filter((lot) => lot.cells?.length)
  if (!placed.length) {
    if (!rows.length) return ''
    const names = [...new Set(rows.map((lot) => lot.consignor).filter(Boolean))]
    return names.length ? `该堆已有 ${names.join('、')}` : '该堆已有在库票货'
  }
  const used = new Set(placed.flatMap((lot) => lot.cells || []))
  const hit = selectedKeys.value.filter((key) => used.has(key))
  if (!hit.length) return ''
  const names = [...new Set(placed.filter((lot) => lot.cells?.some((key) => hit.includes(key))).map((lot) => lot.consignor).filter(Boolean))]
  return `所选 ${hit.length} 格已有${names.join('、') || '在库货'}`
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
  rubber.value = null
  preview.value = null
  tip.value = null
  flyTo(frameOf())
}

function pointOf(event: PointerEvent) {
  return mapRef.value?.locate(event) || { x: 0, y: 0 }
}

function showCellTip(event: PointerEvent, item: PlanItem) {
  if (!focusId.value || item.type !== 'stack') {
    tip.value = null
    return
  }
  const key = stackCellAt(item, pointOf(event), gridSize(item))
  if (!key) {
    tip.value = null
    return
  }
  const rows = lotsOnCell(item, key)
  if (!rows.length) {
    tip.value = null
    return
  }
  const placed = lotsHere(item).some((lot) => lot.cells?.length)
  const [row, col] = key.split('-')
  const names = [...new Set(rows.map((lot) => lot.consignor).filter(Boolean))]
  const tons = Math.round(rows.reduce((sum, lot) => sum + lot.wet, 0))
  let left = event.clientX + 14
  let top = event.clientY + 12
  if (left + 220 > window.innerWidth - 8) left = event.clientX - 228
  if (top + 72 > window.innerHeight - 8) top = Math.max(8, event.clientY - 76)
  tip.value = {
    title: `${codeOf(item)} · ${row}行${col}列`,
    line: [placed ? '' : '整堆', names.join('、') || '在库', tons ? `干重${tons}吨` : ''].filter(Boolean).join(' · '),
    x: left,
    y: top,
  }
}

function placeRubber(event: PointerEvent) {
  const el = stageRef.value
  if (!drag || !el) return
  const box = el.getBoundingClientRect()
  const x1 = drag.px - box.left
  const y1 = drag.py - box.top
  const x2 = event.clientX - box.left
  const y2 = event.clientY - box.top
  rubber.value = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  }
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
  const row = archiveOf(item)
  stackCodeModel.value = row?.code ? String(row.code) : codeOf(item)
  areaIdModel.value = row?.id ? String(row.id) : (item.stackId || '')
  cellsModel.value = keys.join(',')
}

function listenDrag(on: boolean) {
  if (on) {
    window.addEventListener('pointermove', onDrag, true)
    window.addEventListener('pointerup', endDrag, true)
    window.addEventListener('pointercancel', endDrag, true)
    return
  }
  window.removeEventListener('pointermove', onDrag, true)
  window.removeEventListener('pointerup', endDrag, true)
  window.removeEventListener('pointercancel', endDrag, true)
}

function beginDrag(event: PointerEvent, item: PlanItem) {
  listenDrag(false)
  const spot = pointOf(event)
  drag = { item, ...spot, px: event.clientX, py: event.clientY }
  rubber.value = { x: 0, y: 0, w: 0, h: 0 }
  const stage = stageRef.value
  if (stage) {
    try { stage.setPointerCapture(event.pointerId) } catch { /* 捕获失败时仍靠窗口事件跟手 */ }
  }
  listenDrag(true)
}

function onItem(event: PointerEvent, item: PlanItem) {
  if (!focusId.value) {
    const host = isWarehouseItem(item) ? item : item.type === 'stack' ? hostOf(item, plan.items) : undefined
    if (!host) return
    focusId.value = host.id
    flyTo(frameOf(host))
    return
  }
  if (item.type !== 'stack' || event.button !== 0) return
  beginDrag(event, item)
}

function onDrag(event: PointerEvent) {
  if (!drag) return
  const spot = pointOf(event)
  placeRubber(event)
  preview.value = { code: codeOf(drag.item), keys: cellsInside(drag.item, drag, spot) }
  showCellTip(event, drag.item)
}

function endDrag(event: PointerEvent) {
  listenDrag(false)
  const stage = stageRef.value
  if (stage?.hasPointerCapture?.(event.pointerId)) {
    try { stage.releasePointerCapture(event.pointerId) } catch { /* 已经松开 */ }
  }
  const current = drag
  drag = null
  rubber.value = null
  preview.value = null
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
  showCellTip(event, current.item)
}
</script>

<template>
  <div class="pick">
    <div class="pick-bar">
      <span>{{ focusId ? '着色格子为在库票货，拖拽框选，单击可加减一格' : '点击仓库放大' }}</span>
      <strong v-if="stackCodeModel">{{ stackCodeModel }}<template v-if="selectedKeys.length"> · {{ selectedKeys.length }} 格</template></strong>
      <em v-if="occupyText">{{ occupyText }}</em>
      <em v-if="clashText" class="clash">{{ clashText }}</em>
      <button v-if="focusId" type="button" @click="zoomOut">返回总览</button>
    </div>
    <div ref="stageRef" class="stage" :class="{ banding: rubber }">
      <PlanSvg
        ref="mapRef"
        :plan="plan"
        theme="cockpit"
        :lots="lots"
        :stacks="stacks"
        :view="view"
        :only-host-id="focusId"
        @item-down="onItem"
        @item-enter="(event, item) => { if (!drag) showCellTip(event, item) }"
        @item-move="(event, item) => { if (!drag) showCellTip(event, item) }"
        @item-leave="tip = null"
      >
        <g class="cells" pointer-events="none">
          <rect
            v-for="mark in guides"
            :key="mark.key"
            :x="mark.x"
            :y="mark.y"
            :width="mark.w"
            :height="mark.h"
            :fill="mark.on ? (mark.busy ? 'rgba(209,192,64,.38)' : 'rgba(209,192,64,.62)') : 'transparent'"
            :stroke="mark.on ? '#e7c98a' : 'rgba(255,255,255,.35)'"
            stroke-width="0.03"
          />
        </g>
      </PlanSvg>
      <ul v-if="owners.length" class="owners">
        <li v-for="name in owners" :key="name"><i :style="{ background: cargoStyle(name, '').fill }" /><span>{{ name }}</span></li>
      </ul>
      <div v-if="tip" class="cell-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <strong>{{ tip.title }}</strong>
        <p>{{ tip.line }}</p>
      </div>
      <div
        v-if="rubber && (rubber.w > 1 || rubber.h > 1)"
        class="rubber"
        :style="{ left: `${rubber.x}px`, top: `${rubber.y}px`, width: `${rubber.w}px`, height: `${rubber.h}px` }"
      />
    </div>
  </div>
</template>

<style scoped>
.pick { width: 100%; height: 100%; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.pick-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: #5c5c5c; font-size: 13px; }
.pick-bar strong { color: #1a1a1a; }
.pick-bar em { color: #6b5424; font-style: normal; }
.pick-bar em.clash { color: #a15c12; }
.pick-bar button {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.stage { position: relative; flex: 1; width: 100%; min-height: 280px; border-radius: 8px; overflow: hidden; background: #1c2126; touch-action: none; user-select: none; }
.stage.banding { cursor: crosshair; }
.rubber {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1px dashed #fff;
  box-shadow: 0 0 0 1px #3ec6d4;
  pointer-events: none;
}
.cells { pointer-events: none; }
.owners {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  margin: 0;
  padding: 6px 8px;
  list-style: none;
  background: rgba(8, 16, 28, .82);
  color: #f4f0e6;
  font-size: 12px;
}
.owners li { display: flex; align-items: center; gap: 6px; min-height: 18px; }
.owners i { width: 10px; height: 10px; display: block; flex: none; }
.cell-tip {
  position: fixed;
  z-index: 30;
  max-width: 240px;
  padding: 8px 10px;
  background: #3c3828;
  color: #f4f0e6;
  pointer-events: none;
  box-shadow: 0 8px 20px rgba(0, 0, 0, .35);
}
.cell-tip strong { display: block; color: #e7c98a; font-size: 13px; }
.cell-tip p { margin: 4px 0 0; font-size: 12px; }
</style>
