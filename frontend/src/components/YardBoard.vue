<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { floorApi, inventoryApi, settingsApi, warehouseApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import PulseDot from '@/components/PulseDot.vue'
import YardIso from '@/components/YardIso.vue'
import YardMapLoading from '@/components/YardMapLoading.vue'
import { archiveForStack, contentFrame, defaultPlan, hostOf, isWarehouseItem, lotsOnStack, stackCellAt, stackCellGrid, stackCode, warehouseCodeOf } from '@/plan/model'
import type { CargoLot } from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const router = useRouter()
const plan = reactive<FloorPlan>(defaultPlan())
const lots = ref<CargoLot[]>([])
const houses = ref<Record<string, unknown>[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const alertRows = ref<Record<string, unknown>[]>([])
const capacityWarn = ref(70)
const warnCodes = computed(() => {
  const codes = new Set<string>()
  const threshold = capacityWarn.value > 0 ? capacityWarn.value : 70
  for (const house of houses.value) {
    const code = warehouseCodeOf(String(house.code || ''))
    if (code && Number(house.rate) >= threshold) codes.add(code)
  }
  for (const row of alertRows.value) {
    const type = String(row.type || '')
    const target = String(row.target || '')
    const detail = String(row.detail || '')
    if (type === '码头超期' || detail.includes('码头仓库')) codes.add('码头仓库')
    if (type !== '库容') continue
    const code = warehouseCodeOf(target)
    const house = houses.value.find((item) => warehouseCodeOf(String(item.code || '')) === code)
    if (house && Number(house.rate) < threshold) continue
    if (code) codes.add(code)
  }
  return [...codes]
})
const loading = ref(true)
const mode = ref<'iso' | 'plan'>('iso')
const enteredFrom = ref<'iso' | 'plan'>('plan')
const planError = ref('')
const LOAD_MIN_MS = 2000
const tip = ref<{ title: string; rate: string; line: string; hint: string; x: number; y: number } | null>(null)
let hideTip = 0
const focusId = ref('')
const stageRef = ref<HTMLElement>()
const mapRef = ref<InstanceType<typeof PlanSvg>>()
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
const blend = ref(0)
const fading = ref(false)
let fly = 0
let blendFrame = 0
let observer: ResizeObserver | undefined
let alive = true

onMounted(async () => {
  focusId.value = ''
  const started = Date.now()
  const [planRes, stockRes, houseRes, stackRes, paramRes, alertRes] = await Promise.all([
    floorApi.get(),
    inventoryApi.home(),
    warehouseApi.catalog(),
    warehouseApi.stacks({ page: 1, pageSize: 500 }),
    settingsApi.get(),
    inventoryApi.alerts({ page: 1, pageSize: 100 }),
  ])
  if (!alive) return
  if (planRes.success && planRes.data) Object.assign(plan, planRes.data)
  else planError.value = planRes.message || '平面图读取失败'
  if (houseRes.success && houseRes.data) houses.value = houseRes.data.list
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  if (paramRes.success && paramRes.data) {
    const value = Number(paramRes.data.capacityWarn)
    if (value > 0) capacityWarn.value = value
  }
  if (alertRes.success && alertRes.data) alertRows.value = alertRes.data.list
  if (stockRes.success && Array.isArray(stockRes.data)) lots.value = stockRes.data
  const remain = LOAD_MIN_MS - (Date.now() - started)
  if (remain > 0) await new Promise((resolve) => window.setTimeout(resolve, remain))
  if (!alive) return
  loading.value = false
  await nextTick()
  layoutBoard()
  if (stageRef.value) {
    observer = new ResizeObserver(() => layoutBoard())
    observer.observe(stageRef.value)
  }
})

onBeforeUnmount(() => {
  alive = false
  cancelAnimationFrame(fly)
  cancelAnimationFrame(blendFrame)
  observer?.disconnect()
  window.clearTimeout(hideTip)
})

function stockTons(match: (lot: CargoLot) => boolean) {
  return Math.round(lots.value.reduce((sum, lot) => sum + (lot.status === '在库' && match(lot) ? lot.wet : 0), 0))
}

function screenBox(item: PlanItem) {
  const svg = stageRef.value?.querySelector('svg')
  const ctm = svg?.getScreenCTM()
  if (!svg || !ctm) return null
  const point = (x: number, y: number) => {
    const spot = svg.createSVGPoint()
    spot.x = x
    spot.y = y
    return spot.matrixTransform(ctm)
  }
  const a = point(item.col, item.row)
  const b = point(item.col + item.cols, item.row + item.rows)
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

function placeCursorTip(
  x: number,
  y: number,
  body: { title: string; rate: string; line: string; hint: string },
  size = { width: 260, height: 128 },
) {
  const { width, height } = size
  let left = x + 14
  let top = y + 12
  if (left + width > window.innerWidth - 8) left = x - width - 14
  if (top + height > window.innerHeight - 8) top = Math.max(8, y - height - 12)
  tip.value = { ...body, x: left, y: top }
}

function onIsoHover(body: { title: string; rate: string; line: string; hint: string; x: number; y: number }) {
  window.clearTimeout(hideTip)
  placeCursorTip(body.x, body.y, body)
}

function placeTip(item: PlanItem, body: { title: string; rate: string; line: string; hint: string }) {
  const width = 232
  const height = 108
  const gap = 10
  const box = screenBox(item)
  let x = 16
  let y = 16
  if (box) {
    x = box.x + box.w + gap
    y = box.y
    if (x + width > window.innerWidth - 8) x = box.x - width - gap
    if (x < 8) {
      x = Math.max(8, box.x)
      y = box.y + box.h + gap
    }
    if (y + height > window.innerHeight - 8) y = Math.max(8, box.y - height - gap)
  }
  tip.value = { ...body, x, y }
}

function warehouseCard(item: PlanItem) {
  const code = warehouseCodeOf(item.name)
  const house = houses.value.find((row) => String(row.code) === code)
  const fromLots = stockTons((lot) => warehouseCodeOf(lot.warehouse) === code)
  const tons = lots.value.length ? fromLots : (fromLots || Number(house?.used) || 0)
  const rate = house ? Number(house.rate) || 0 : 0
  const count = Number(house?.stackCount) || plan.items.filter((entry) => entry.type === 'stack' && hostOf(entry, plan.items)?.id === item.id).length
  return {
    title: code,
    rate: `${rate}%`,
    line: `堆位${count}个 · 干重${tons}吨`,
    hint: focusId.value ? '移入堆位查看堆位信息' : '点击放大至本仓库',
  }
}

function stackRef(item: PlanItem) {
  const host = hostOf(item, plan.items)
  const slot = item.name.replace(/^\d+#/, '').trim() || item.name
  const built = host ? stackCode(host.name, slot) : slot
  const row = stacks.value.find((entry) => String(entry.id) === item.stackId || String(entry.code) === built || (item.archiveCode != null && String(entry.code) === item.archiveCode))
  const code = String(row?.code || item.archiveCode || built)
  return { host, slot, code, row }
}

function stackLots(item: PlanItem) {
  return lotsOnStack(item, plan.items, lots.value)
}

function namesOf(rows: CargoLot[]) {
  return [...new Set(rows.map((lot) => lot.consignor).filter(Boolean))]
}

function stackCard(item: PlanItem, event?: PointerEvent) {
  const { host, slot, code, row } = stackRef(item)
  const houseName = host ? warehouseCodeOf(host.name) : ''
  const here = stackLots(item)
  const tons = Math.round(here.reduce((sum, lot) => sum + lot.wet, 0))
  const capacity = Number(row?.capacity) || 0
  const rate = capacity > 0 ? Math.min(100, Math.round((tons / capacity) * 100)) : 0
  const area = String(row?.areaLabel || '')
  const occupied = new Set(here.flatMap((lot) => lot.cells || []))
  const state = occupied.size ? `占用${occupied.size}格` : tons > 0 ? '在库' : '空闲'
  const title = houseName ? `${houseName}-${slot}` : code
  const base = {
    title,
    rate: `${rate}%`,
    line: [area, state, tons ? `干重${tons}吨` : '', namesOf(here).join('、')].filter(Boolean).join(' · '),
    hint: '点击查询本堆位库存',
  }
  if (!event) return base
  const key = stackCellAt(item, mapRef.value?.locate(event) || { x: 0, y: 0 }, stackCellGrid(item, archiveForStack(item, plan.items, stacks.value)))
  if (!key) return base
  const placed = here.filter((lot) => lot.cells?.length)
  const onCell = placed.length ? placed.filter((lot) => lot.cells?.includes(key)) : here
  if (!onCell.length) return base
  const [cellRow, cellCol] = key.split('-')
  const cellTons = Math.round(onCell.reduce((sum, lot) => sum + lot.wet, 0))
  return {
    title: `${title} · ${cellRow}行${cellCol}列`,
    rate: `${rate}%`,
    line: [namesOf(onCell).join('、') || '在库', cellTons ? `干重${cellTons}吨` : '', placed.length ? '' : '整堆'].filter(Boolean).join(' · '),
    hint: '点击查询本堆位库存',
  }
}

function onEnter(event: PointerEvent, item: PlanItem) {
  window.clearTimeout(hideTip)
  if (!focusId.value) {
    const host = isWarehouseItem(item) ? item : hostOf(item, plan.items)
    if (!host) {
      tip.value = null
      return
    }
    placeTip(host, warehouseCard(host))
    return
  }
  if (item.type === 'stack') {
    placeCursorTip(event.clientX, event.clientY, stackCard(item, event), { width: 280, height: 120 })
    return
  }
  if (isWarehouseItem(item)) {
    placeTip(item, warehouseCard(item))
    return
  }
  tip.value = null
}

function onMoveTip(event: PointerEvent, item: PlanItem) {
  if (!tip.value) return
  onEnter(event, item)
}

function onLeave() {
  window.clearTimeout(hideTip)
  hideTip = window.setTimeout(() => { tip.value = null }, 40)
}

function applyFrame(frame: { x: number; y: number; w: number; h: number }) {
  const next = coverFrame(frame)
  view.x = next.x
  view.y = next.y
  view.w = next.w
  view.h = next.h
}

function layoutBoard() {
  const el = stageRef.value
  if (el && el.clientHeight < 2) return
  if (!focusId.value) applyFrame(contentFrame(plan))
}

function coverFrame(frame: { x: number; y: number; w: number; h: number }) {
  const el = stageRef.value
  const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : frame.w / frame.h
  let w = frame.w
  let h = frame.h
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  return {
    x: frame.x + frame.w / 2 - w / 2,
    y: frame.y + frame.h / 2 - h / 2,
    w,
    h,
  }
}

function frameOf(item?: PlanItem) {
  if (!item) return coverFrame(contentFrame(plan))
  const padX = Math.max(0.6, item.cols * 0.12)
  const padY = Math.max(1.2, item.rows * 0.2)
  return coverFrame({
    x: item.col - padX,
    y: item.row - padY,
    w: item.cols + padX * 2,
    h: item.rows + padY * 2,
  })
}

function flyTo(next: { x: number; y: number; w: number; h: number }) {
  cancelAnimationFrame(fly)
  const from = { ...view }
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

function fadeMode(next: 'iso' | 'plan') {
  if (mode.value === next && !fading.value) return
  mode.value = next
  const target = next === 'plan' ? 1 : 0
  cancelAnimationFrame(blendFrame)
  const from = blend.value
  if (Math.abs(from - target) < 0.001) {
    blend.value = target
    fading.value = false
    return
  }
  fading.value = true
  const started = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / 420)
    const e = 1 - (1 - t) ** 3
    blend.value = from + (target - from) * e
    if (t < 1) blendFrame = requestAnimationFrame(tick)
    else {
      blend.value = target
      fading.value = false
    }
  }
  blendFrame = requestAnimationFrame(tick)
}

function layerStyle(kind: 'iso' | 'plan') {
  const incoming = mode.value === kind
  const opacity = incoming ? (kind === 'plan' ? blend.value : 1 - blend.value) : fading.value ? 1 : 0
  return {
    opacity: String(opacity),
    visibility: opacity > 0.01 ? 'visible' : 'hidden',
    pointerEvents: !fading.value && incoming ? 'auto' : 'none',
    zIndex: incoming ? 1 : 0,
  }
}

async function openHouse(item: PlanItem) {
  tip.value = null
  enteredFrom.value = 'iso'
  focusId.value = item.id
  fadeMode('plan')
  await nextTick()
  flyTo(frameOf(item))
}

function openIso(item: PlanItem | null) {
  if (!item) {
    showPlan()
    return
  }
  openHouse(item)
}

function showPlan() {
  tip.value = null
  if (mode.value !== 'plan') {
    focusId.value = ''
    applyFrame(contentFrame(plan))
  }
  fadeMode('plan')
}

function showIso() {
  tip.value = null
  fadeMode('iso')
}

function onItem(item: PlanItem) {
  tip.value = null
  if (!focusId.value) {
    const host = item.type === 'warehouse' || item.type === 'idle'
      ? item
      : item.type === 'stack'
        ? hostOf(item, plan.items)
        : undefined
    if (!host) return
    enteredFrom.value = 'plan'
    focusId.value = host.id
    flyTo(frameOf(host))
    return
  }
  if (item.type === 'stack') {
    const code = stackRef(item).code
    if (!code) return
    router.push({ path: '/inventory', query: { stack: code } })
  }
}

function back() {
  tip.value = null
  const fromIso = enteredFrom.value === 'iso'
  focusId.value = ''
  if (fromIso) {
    applyFrame(contentFrame(plan))
    fadeMode('iso')
    return
  }
  flyTo(frameOf())
}

</script>

<template>
  <section class="yard">
    <div class="card-head">
      <h3><PulseDot />仓库堆位示意图</h3>
      <div class="view-switch" role="tablist" aria-label="示意图视图">
        <button type="button" role="tab" :aria-selected="mode === 'iso'" :class="{ on: mode === 'iso' }" @click="showIso">立体图</button>
        <button type="button" role="tab" :aria-selected="mode === 'plan'" :class="{ on: mode === 'plan' }" @click="showPlan">平面图</button>
      </div>
    </div>
    <div class="body">
      <div ref="stageRef" class="stage" :class="{ 'is-loading': loading }">
        <YardMapLoading v-if="loading" />
        <template v-else>
        <p v-if="planError" class="plan-miss">{{ planError }}</p>
        <YardIso
          class="view-layer"
          :style="layerStyle('iso')"
          :plan="plan"
          :houses="houses"
          :stacks="stacks"
          :lots="lots"
          :warn-codes="warnCodes"
          @open="openIso"
          @hover="onIsoHover"
          @leave="onLeave"
        />
        <PlanSvg
          ref="mapRef"
          class="view-layer"
          :style="layerStyle('plan')"
          :plan="plan"
          theme="cockpit"
          :lots="lots"
          :stacks="stacks"
          :only-host-id="focusId"
          :view="view"
          @item-down="(_event, item) => onItem(item)"
          @item-enter="onEnter"
          @item-move="onMoveTip"
          @item-leave="onLeave"
        />
        </template>
      </div>
      <button v-if="mode === 'plan' && focusId" class="back" type="button" @click="back">返回总览</button>
      <div v-if="tip" class="yard-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <i class="bar" />
        <div class="tip-body">
          <div class="tip-row">
            <strong>{{ tip.title }}</strong>
            <span>{{ tip.rate }}</span>
          </div>
          <p>{{ tip.line }}</p>
          <em>{{ tip.hint }}</em>
        </div>
      </div>
      <ul v-if="!loading && mode === 'iso'" class="legend occ">
        <li><span>低占用</span><i class="lv low" /></li>
        <li><span>中占用</span><i class="lv mid" /></li>
        <li><span>高占用</span><i class="lv high" /></li>
        <li><span>预警</span><i class="lv crit" /></li>
      </ul>
      <ul v-else-if="!loading && !focusId" class="legend">
        <li><span>五矿有色达标/报备</span><i class="ore std" /><i class="ore" /></li>
        <li><span>南国铜业达标/报备</span><i class="ng std" /><i class="ng" /></li>
        <li><span>广西金川达标/报备</span><i class="jc std" /><i class="jc filed" /></li>
        <li><span>混成品</span><i class="mix" /></li>
        <li><span>入库预约</span><i class="book" /></li>
        <li><span>空闲</span><i class="idle" /></li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.yard {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgba(8, 16, 28, .78);
  border: 1px solid rgba(214, 176, 106, .38);
}
.yard::before, .yard::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
}
.yard::before { left: -1px; top: -1px; border-top: 2px solid #f0d090; border-left: 2px solid #f0d090; }
.yard::after { right: -1px; bottom: -1px; border-right: 2px solid #f0d090; border-bottom: 2px solid #f0d090; }
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
}
.card-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #e7c98a;
  font-size: 16px;
  font-weight: 600;
}
.view-switch { display: flex; border: 1px solid rgba(231, 201, 138, .55); }
.view-switch button {
  min-width: 64px;
  height: 26px;
  border: 0;
  background: transparent;
  color: #c5d0dc;
  font-size: 13px;
  cursor: pointer;
}
.view-switch button.on { background: #e7c98a; color: #1a140c; font-weight: 600; }
.body { position: relative; flex: 1; min-height: 0; margin: 0 10px 10px; }
.plan-miss {
  position: absolute;
  left: 16px;
  bottom: 12px;
  z-index: 2;
  margin: 0;
  color: #e7c98a;
  font-size: 12px;
}
.stage { position: absolute; inset: 0; }
.stage.is-loading { cursor: default; }
.stage :deep(.view-layer) { position: absolute; inset: 0; }
.stage :deep(.plan-svg) { width: 100%; height: 100%; }
.back {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 2;
  border: 1px solid #e7c98a;
  background: rgba(8, 16, 28, .9);
  color: #f0d7a4;
  padding: 4px 10px;
  cursor: pointer;
}
.legend {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
  margin: 0;
  padding: 0;
  list-style: none;
  color: rgba(255, 255, 255, .7);
  font-size: 12px;
  line-height: 1;
}
.legend.occ {
  top: auto;
  right: 10px;
  bottom: 6px;
  left: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 14px;
}
.legend.occ li { justify-content: flex-start; height: 18px; }
.lv.low { background: #4a8fa8; }
.lv.mid { background: #5a8fd4; }
.lv.high { background: #c49a48; }
.lv.crit { background: #c45868; }
.legend li { display: flex; align-items: center; justify-content: flex-end; gap: 6px; height: 22px; }
.legend i { width: 10px; height: 10px; display: block; box-sizing: border-box; }
.ore { background: rgba(200, 115, 72, .7); }
.ng { background: rgba(46, 128, 217, .7); }
.jc { background: rgba(48, 176, 199, .7); }
.jc.filed { background: rgba(48, 176, 199, .6); }
.mix { background: rgba(168, 131, 84, .7); }
.idle { background: #5662864D; }
.book { background: rgba(86, 98, 134, .3); border: 1px dashed #d1c040; }
.std { box-shadow: inset 0 0 0 1px #5aed95; }
.yard-tip {
  position: fixed;
  z-index: 40;
  width: 280px;
  pointer-events: none;
  background: #3c3828;
  color: #f4f0e6;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
}
.yard-tip .bar { display: block; height: 3px; background: #e7c98a; }
.yard-tip .tip-body { padding: 10px 12px 12px; }
.yard-tip .tip-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.yard-tip strong { color: #e7c98a; font-size: 16px; font-weight: 700; }
.yard-tip .tip-row span { font-size: 16px; font-weight: 600; }
.yard-tip p { margin: 6px 0 0; font-size: 14px; }
.yard-tip em { display: block; margin-top: 8px; color: rgba(255, 255, 255, .55); font-style: normal; font-size: 13px; }
</style>
