<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { dashboardApi, floorApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import {
  archiveForStack,
  cargoStyle,
  contentFrame,
  defaultPlan,
  hostOf,
  isWarehouseItem,
  lotsOnStack,
  stackCellAt,
  stackCellGrid,
  stackCellRect,
  stackCode,
  warehouseCodeOf,
  type CargoLot,
} from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const props = withDefaults(defineProps<{
  stacks: Record<string, unknown>[]
  /** 外部已加载的平面图；不传则组件内自行拉取 */
  plan?: FloorPlan
  /** 外部已加载的票货；不传则组件内自行拉取 */
  lots?: CargoLot[]
  /** 只允许选这个片区的堆位，例如待检区 */
  areaLabel?: string
  /** select=框选堆格；browse=点击跳转库存，不可框选 */
  mode?: 'select' | 'browse'
  /** 是否显示顶部操作条 */
  showBar?: boolean
  /** 仓库档案，browse 模式下用于库容提示 */
  houses?: Record<string, unknown>[]
}>(), {
  mode: 'select',
  showBar: undefined,
  houses: () => [],
})

const stackCodeModel = defineModel<string>('stackCode', { default: '' })
const areaIdModel = defineModel<string>('areaId', { default: '' })
const cellsModel = defineModel<string>('cells', { default: '' })
const focusId = defineModel<string>('focusId', { default: '' })

const emit = defineEmits<{
  /** 用户在平面图内点击仓库放大 */
  'enter-host': [hostId: string]
}>()

const router = useRouter()
const localPlan = reactive<FloorPlan>(defaultPlan())
const localLots = ref<CargoLot[]>([])
const plan = computed(() => props.plan || localPlan)
const lots = computed(() => props.lots || localLots.value)
const selectable = computed(() => props.mode === 'select')
const barVisible = computed(() => props.showBar ?? selectable.value)

const stageRef = ref<HTMLElement>()
const mapRef = ref<InstanceType<typeof PlanSvg>>()
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
const rubber = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const preview = ref<{ code: string; keys: string[] } | null>(null)
const tip = ref<{ title: string; rate: string; line: string; hint: string; x: number; y: number } | null>(null)
let fly = 0
let drag: { item: PlanItem; x: number; y: number; px: number; py: number } | null = null
let hideTip = 0
let syncingFocus = false

const selectedKeys = computed(() => cellsModel.value.split(',').filter(Boolean))

onMounted(async () => {
  const tasks: Promise<unknown>[] = []
  if (!props.plan) {
    tasks.push(floorApi.get().then((res) => {
      if (res.success && res.data) Object.assign(localPlan, res.data)
    }))
  }
  if (!props.lots) {
    // 与驾驶舱平面图同一票货源，保证堆位占用着色一致
    tasks.push(dashboardApi.areas().then((res) => {
      if (res.success && Array.isArray(res.data)) localLots.value = res.data
    }))
  }
  if (tasks.length) await Promise.all(tasks)
  await nextTick()
  layout()
  const current = stackItem()
  if (current) {
    const host = hostOf(current, plan.value.items)
    if (host) {
      syncingFocus = true
      focusId.value = host.id
      syncingFocus = false
      applyFrame(frameOf(host))
    }
  } else if (focusId.value) {
    const host = plan.value.items.find((item) => item.id === focusId.value)
    if (host) applyFrame(frameOf(host))
  }
  if (stageRef.value) {
    new ResizeObserver(() => {
      if (!focusId.value) layout()
    }).observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(fly)
  listenDrag(false)
  window.clearTimeout(hideTip)
})

watch(focusId, async (id, prev) => {
  if (syncingFocus || id === prev) return
  await nextTick()
  if (!id) {
    rubber.value = null
    preview.value = null
    tip.value = null
    flyTo(frameOf())
    return
  }
  const host = plan.value.items.find((item) => item.id === id)
  if (host) flyTo(frameOf(host))
})

function slotName(name: string) {
  const flat = name.replace(/[\r\n]+/g, '').trim()
  return flat.replace(/^\d+#/, '').trim() || flat
}

function archiveOf(item: PlanItem) {
  return archiveForStack(item, plan.value.items, props.stacks)
}

function gridSize(item: PlanItem) {
  return stackCellGrid(item, archiveOf(item))
}

function codeOf(item: PlanItem) {
  const row = archiveOf(item)
  if (row?.code) return String(row.code)
  if (item.archiveCode) return item.archiveCode
  const host = hostOf(item, plan.value.items)
  const slot = slotName(item.name)
  return host ? stackCode(host.name, slot) : item.name
}

function stackItem() {
  return plan.value.items.find((item) => item.type === 'stack' && codeOf(item) === stackCodeModel.value)
}

function allowed(item: PlanItem) {
  if (item.type !== 'stack' || !props.areaLabel) return item.type === 'stack'
  return String(archiveOf(item)?.areaLabel || '') === props.areaLabel
}

function stacksInView() {
  return plan.value.items.filter((item) => allowed(item) && (!focusId.value || hostOf(item, plan.value.items)?.id === focusId.value))
}

function cellRect(item: PlanItem, key: string) {
  return stackCellRect(item, key, gridSize(item))
}

function lotsHere(item: PlanItem) {
  return lotsOnStack(item, plan.value.items, lots.value)
}

function lotsOnCell(item: PlanItem, key: string) {
  const rows = lotsHere(item)
  const placed = rows.filter((lot) => lot.cells?.length)
  if (placed.length) return placed.filter((lot) => lot.cells?.includes(key))
  return rows
}

function namesOf(rows: CargoLot[]) {
  return [...new Set(rows.map((lot) => lot.consignor).filter(Boolean))]
}

const guides = computed(() => {
  if (!focusId.value) return []
  const marks: { key: string; x: number; y: number; w: number; h: number; on: boolean; busy: boolean }[] = []
  for (const item of stacksInView()) {
    const size = gridSize(item)
    const chosen = selectable.value
      ? (preview.value?.code === codeOf(item)
        ? preview.value.keys
        : codeOf(item) === stackCodeModel.value ? selectedKeys.value : [])
      : []
    for (let row = 1; row <= size.rows; row += 1) {
      for (let col = 1; col <= size.cols; col += 1) {
        const key = `${row}-${col}`
        const rect = cellRect(item, key)
        if (!rect) continue
        const busy = lotsHere(item).some((lot) => lot.cells?.includes(key))
        marks.push({
          key: `${item.id}-${key}`,
          ...rect,
          on: chosen.includes(key),
          busy,
        })
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
  if (!selectable.value) return ''
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

const barHint = computed(() => {
  if (!focusId.value) return '点击仓库放大'
  if (selectable.value) {
    return `着色格子为在库票货，拖拽框选，单击可加减一格${props.areaLabel ? `，只可选${props.areaLabel}` : ''}`
  }
  return '着色格子为在库票货，点击堆位查询库存'
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
  if (!item) return coverFrame(contentFrame(plan.value))
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
  applyFrame(contentFrame(plan.value))
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
  syncingFocus = true
  focusId.value = ''
  syncingFocus = false
  rubber.value = null
  preview.value = null
  tip.value = null
  flyTo(frameOf())
}

function pointOf(event: PointerEvent) {
  return mapRef.value?.locate(event) || { x: 0, y: 0 }
}

function placeCursorTip(
  x: number,
  y: number,
  body: { title: string; rate: string; line: string; hint: string },
  size = { width: 260, height: 120 },
) {
  let left = x + 14
  let top = y + 12
  if (left + size.width > window.innerWidth - 8) left = x - size.width - 14
  if (top + size.height > window.innerHeight - 8) top = Math.max(8, y - size.height - 12)
  tip.value = { ...body, x: left, y: top }
}

function stockTons(match: (lot: CargoLot) => boolean) {
  return Math.round(lots.value.reduce((sum, lot) => sum + (lot.status === '在库' && match(lot) ? lot.wet : 0), 0))
}

function warehouseCard(item: PlanItem) {
  const code = warehouseCodeOf(item.name)
  const house = props.houses.find((row) => String(row.code) === code)
  const fromLots = stockTons((lot) => warehouseCodeOf(lot.warehouse) === code)
  const tons = lots.value.length ? fromLots : (fromLots || Number(house?.used) || 0)
  const rate = house ? Number(house.rate) || 0 : 0
  const count = Number(house?.stackCount)
    || plan.value.items.filter((entry) => entry.type === 'stack' && hostOf(entry, plan.value.items)?.id === item.id).length
  return {
    title: code,
    rate: house ? `${rate}%` : '',
    line: `堆位${count}个 · 干重${tons}吨`,
    hint: focusId.value ? '移入堆位查看票货信息' : '点击放大至本仓库',
  }
}

function stackTipBody(item: PlanItem, event?: PointerEvent) {
  const host = hostOf(item, plan.value.items)
  const slot = slotName(item.name)
  const code = codeOf(item)
  const houseName = host ? warehouseCodeOf(host.name) : ''
  const here = lotsHere(item)
  const tons = Math.round(here.reduce((sum, lot) => sum + lot.wet, 0))
  const row = archiveOf(item)
  const capacity = Number(row?.capacity) || 0
  const rate = capacity > 0 ? Math.min(100, Math.round((tons / capacity) * 100)) : 0
  const area = String(row?.areaLabel || '')
  const occupied = new Set(here.flatMap((lot) => lot.cells || []))
  const state = occupied.size ? `占用${occupied.size}格` : tons > 0 ? '在库' : '空闲'
  const title = houseName ? `${houseName}-${slot}` : code
  const hint = selectable.value
    ? (allowed(item) ? '拖拽框选格子，单击加减一格' : (props.areaLabel ? `只可选${props.areaLabel}` : ''))
    : '点击查询本堆位库存'
  const base = {
    title,
    rate: capacity > 0 ? `${rate}%` : '',
    line: [area, state, tons ? `干重${tons}吨` : '', namesOf(here).join('、')].filter(Boolean).join(' · '),
    hint,
  }
  if (!event || !focusId.value) return base
  const key = stackCellAt(item, pointOf(event), gridSize(item))
  if (!key) return base
  const onCell = lotsOnCell(item, key)
  if (!onCell.length) return base
  const placed = here.some((lot) => lot.cells?.length)
  const [cellRow, cellCol] = key.split('-')
  const cellTons = Math.round(onCell.reduce((sum, lot) => sum + lot.wet, 0))
  return {
    title: `${title} · ${cellRow}行${cellCol}列`,
    rate: capacity > 0 ? `${rate}%` : '',
    line: [placed ? '' : '整堆', namesOf(onCell).join('、') || '在库', cellTons ? `干重${cellTons}吨` : ''].filter(Boolean).join(' · '),
    hint,
  }
}

function showTip(event: PointerEvent, item: PlanItem) {
  window.clearTimeout(hideTip)
  if (!focusId.value) {
    const host = isWarehouseItem(item) ? item : hostOf(item, plan.value.items)
    if (!host) {
      tip.value = null
      return
    }
    placeCursorTip(event.clientX, event.clientY, warehouseCard(host), { width: 280, height: 120 })
    return
  }
  if (item.type === 'stack') {
    placeCursorTip(event.clientX, event.clientY, stackTipBody(item, event), { width: 280, height: 120 })
    return
  }
  if (isWarehouseItem(item)) {
    placeCursorTip(event.clientX, event.clientY, warehouseCard(item), { width: 280, height: 120 })
    return
  }
  tip.value = null
}

function onLeave() {
  window.clearTimeout(hideTip)
  hideTip = window.setTimeout(() => { tip.value = null }, 40)
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
  if (!allowed(item)) return
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

function openStack(item: PlanItem) {
  const code = codeOf(item)
  if (!code) return
  router.push({ path: '/inventory', query: { stack: code } })
}

function onItem(event: PointerEvent, item: PlanItem) {
  tip.value = null
  if (!focusId.value) {
    const host = isWarehouseItem(item) ? item : item.type === 'stack' ? hostOf(item, plan.value.items) : undefined
    if (!host) return
    syncingFocus = true
    focusId.value = host.id
    syncingFocus = false
    emit('enter-host', host.id)
    flyTo(frameOf(host))
    return
  }
  if (item.type !== 'stack') return
  if (selectable.value) {
    if (event.button !== 0 || !allowed(item)) return
    beginDrag(event, item)
    return
  }
  openStack(item)
}

function onDrag(event: PointerEvent) {
  if (!drag) return
  const spot = pointOf(event)
  placeRubber(event)
  preview.value = { code: codeOf(drag.item), keys: cellsInside(drag.item, drag, spot) }
  showTip(event, drag.item)
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
  if (!current || !selectable.value) return
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
  showTip(event, current.item)
}

defineExpose({ zoomOut, layout })
</script>

<template>
  <div class="yard-plan" :class="{ 'has-bar': barVisible }">
    <div v-if="barVisible" class="plan-bar">
      <span>{{ barHint }}</span>
      <strong v-if="selectable && stackCodeModel">
        {{ stackCodeModel }}<template v-if="selectedKeys.length"> · {{ selectedKeys.length }} 格</template>
      </strong>
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
        @item-enter="(event, item) => { if (!drag) showTip(event, item) }"
        @item-move="(event, item) => { if (!drag) showTip(event, item) }"
        @item-leave="onLeave"
      >
        <g class="cells" pointer-events="none">
          <rect
            v-for="mark in guides"
            :key="mark.key"
            :x="mark.x"
            :y="mark.y"
            :width="mark.w"
            :height="mark.h"
            :fill="mark.on
              ? (mark.busy ? 'rgba(209,192,64,.38)' : 'rgba(209,192,64,.62)')
              : (mark.busy ? 'rgba(209,192,64,.22)' : 'transparent')"
            :stroke="mark.on ? '#e7c98a' : (mark.busy ? 'rgba(231,201,138,.45)' : 'rgba(255,255,255,.28)')"
            stroke-width="0.03"
          />
        </g>
      </PlanSvg>
      <ul v-if="owners.length" class="owners">
        <li v-for="name in owners" :key="name"><i :style="{ background: cargoStyle(name, '').fill }" /><span>{{ name }}</span></li>
      </ul>
      <div v-if="tip" class="cell-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <i class="bar" />
        <div class="tip-body">
          <div class="tip-row">
            <strong>{{ tip.title }}</strong>
            <span v-if="tip.rate">{{ tip.rate }}</span>
          </div>
          <p>{{ tip.line }}</p>
          <em v-if="tip.hint">{{ tip.hint }}</em>
        </div>
      </div>
      <div
        v-if="selectable && rubber && (rubber.w > 1 || rubber.h > 1)"
        class="rubber"
        :style="{ left: `${rubber.x}px`, top: `${rubber.y}px`, width: `${rubber.w}px`, height: `${rubber.h}px` }"
      />
    </div>
  </div>
</template>

<style scoped>
.yard-plan { width: 100%; height: 100%; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 0; }
.yard-plan.has-bar { gap: 10px; }
.plan-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: #5c5c5c; font-size: 13px; }
.plan-bar strong { color: #1a1a1a; }
.plan-bar em { color: #6b5424; font-style: normal; }
.plan-bar em.clash { color: #a15c12; }
.plan-bar button {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.stage { position: relative; flex: 1; width: 100%; min-height: 280px; border-radius: 8px; overflow: hidden; background: #1c2126; touch-action: none; user-select: none; }
.yard-plan:not(.has-bar) .stage { min-height: 0; border-radius: 0; background: transparent; }
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
  z-index: 40;
  width: 280px;
  pointer-events: none;
  background: #3c3828;
  color: #f4f0e6;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
}
.cell-tip .bar { display: block; height: 3px; background: #e7c98a; }
.cell-tip .tip-body { padding: 10px 12px 12px; }
.cell-tip .tip-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cell-tip strong { color: #e7c98a; font-size: 15px; font-weight: 700; }
.cell-tip .tip-row span { font-size: 15px; font-weight: 600; }
.cell-tip p { margin: 6px 0 0; font-size: 13px; }
.cell-tip em { display: block; margin-top: 8px; color: rgba(255, 255, 255, .55); font-style: normal; font-size: 12px; }
</style>
