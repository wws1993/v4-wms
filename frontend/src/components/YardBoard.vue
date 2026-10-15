<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { floorApi, inventoryApi, warehouseApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import PulseDot from '@/components/PulseDot.vue'
import YardMapLoading from '@/components/YardMapLoading.vue'
import { contentFrame, defaultPlan, hostOf, isWarehouseItem, stackCode, warehouseCodeOf } from '@/plan/model'
import type { CargoLot } from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const router = useRouter()
const plan = reactive<FloorPlan>(defaultPlan())
const lots = ref<CargoLot[]>([])
const houses = ref<Record<string, unknown>[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const satellite = ref(false)
const loading = ref(true)
const planError = ref('')
const LOAD_MIN_MS = 2000
const tip = ref<{ title: string; rate: string; line: string; hint: string; x: number; y: number } | null>(null)
let hideTip = 0
const focusId = ref('')
const stageRef = ref<HTMLElement>()
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
const ground = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
let fly = 0
let observer: ResizeObserver | undefined
let alive = true

onMounted(async () => {
  satellite.value = false
  focusId.value = ''
  const started = Date.now()
  const [planRes, stockRes, houseRes, stackRes] = await Promise.all([
    floorApi.get(),
    inventoryApi.list({ page: 1, pageSize: 50 }),
    warehouseApi.list({ page: 1, pageSize: 50 }),
    warehouseApi.stacks({ page: 1, pageSize: 500 }),
  ])
  if (!alive) return
  if (planRes.success && planRes.data) Object.assign(plan, planRes.data)
  else planError.value = planRes.message || '平面图读取失败'
  if (houseRes.success && houseRes.data) houses.value = houseRes.data.list
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  if (stockRes.success && stockRes.data) {
    lots.value = stockRes.data.list.map((row) => ({
      stackText: String(row.stackText || ''),
      warehouse: String(row.warehouse || ''),
      consignor: String(row.consignor || row.owner || ''),
      cargoType: String(row.cargoType || ''),
      wet: Number(row.wet || 0),
      status: String(row.status || ''),
    }))
  }
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
  const tons = stockTons((lot) => warehouseCodeOf(lot.warehouse) === code) || Number(house?.used) || 0
  const rate = house ? Number(house.rate) || 0 : 0
  const count = Number(house?.stackCount) || plan.items.filter((entry) => entry.type === 'stack' && hostOf(entry, plan.items)?.id === item.id).length
  return {
    title: code,
    rate: `${rate}%`,
    line: `堆位${count}个 · 库存${tons}吨`,
    hint: focusId.value ? '移入堆位查看堆位信息' : '点击放大至本仓库',
  }
}

function stackCard(item: PlanItem) {
  const host = hostOf(item, plan.items)
  const slot = item.name.replace(/^\d+#/, '').trim() || item.name
  const code = host ? stackCode(host.name, slot) : slot
  const houseName = host ? warehouseCodeOf(host.name) : ''
  const row = stacks.value.find((entry) => String(entry.id) === item.stackId || String(entry.code) === code)
  const tons = stockTons((lot) => lot.stackText === code)
  const capacity = Number(row?.capacity) || 0
  const rate = capacity > 0 ? Math.min(100, Math.round((tons / capacity) * 100)) : 0
  const area = String(row?.areaLabel || '')
  const state = tons > 0 ? '在库' : '空闲'
  return {
    title: houseName ? `${houseName}-${slot}` : code,
    rate: `${rate}%`,
    line: [area, state, `库存${tons}吨`].filter(Boolean).join(' · '),
    hint: '点击进入堆位管理',
  }
}

function onEnter(_event: PointerEvent, item: PlanItem) {
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
    placeTip(item, stackCard(item))
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
  const frames = [coverFrame(contentFrame(plan))]
  for (const item of plan.items) {
    if (item.type === 'warehouse' || item.type === 'idle') frames.push(frameOf(item))
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const frame of frames) {
    minX = Math.min(minX, frame.x)
    minY = Math.min(minY, frame.y)
    maxX = Math.max(maxX, frame.x + frame.w)
    maxY = Math.max(maxY, frame.y + frame.h)
  }
  ground.x = minX
  ground.y = minY
  ground.w = Math.max(1, maxX - minX)
  ground.h = Math.max(1, maxY - minY)
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

function onItem(item: PlanItem) {
  tip.value = null
  if (!focusId.value) {
    const host = item.type === 'warehouse' || item.type === 'idle'
      ? item
      : item.type === 'stack'
        ? hostOf(item, plan.items)
        : undefined
    if (!host) return
    focusId.value = host.id
    flyTo(frameOf(host))
    return
  }
  if (item.type === 'stack') router.push('/stacks')
}

function back() {
  tip.value = null
  focusId.value = ''
  flyTo(frameOf())
}

</script>

<template>
  <section class="yard">
    <div class="card-head">
      <h3><PulseDot />仓库堆位示意图</h3>
      <label class="sat">卫星图 <el-switch v-model="satellite" /></label>
    </div>
    <div class="body">
      <div ref="stageRef" class="stage" :class="{ 'is-loading': loading }">
        <YardMapLoading v-if="loading" />
        <template v-else>
        <p v-if="planError" class="plan-miss">{{ planError }}</p>
        <PlanSvg
          :plan="plan"
          theme="cockpit"
          :satellite="satellite"
          :ground="ground"
          :lots="lots"
          :only-host-id="focusId"
          :view="view"
          @item-down="(_event, item) => onItem(item)"
          @item-enter="onEnter"
          @item-move="onMoveTip"
          @item-leave="onLeave"
        />
        </template>
      </div>
      <button v-if="focusId" class="back" type="button" @click="back">返回总览</button>
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
      <ul v-if="!loading && !focusId" class="legend">
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
.sat { display: flex; align-items: center; gap: 8px; color: #c5d0dc; font-size: 13px; }
.sat :deep(.el-switch.is-checked .el-switch__core) { background: #e7c98a; border-color: #e7c98a; }
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
  width: 232px;
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
