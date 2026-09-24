<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { floorApi, inventoryApi } from '@/api'
import PlanSvg from '@/components/PlanSvg.vue'
import { defaultPlan } from '@/plan/model'
import type { CargoLot } from '@/plan/model'
import type { FloorPlan, PlanItem } from '@/types'

const router = useRouter()
const plan = reactive<FloorPlan>(defaultPlan())
const lots = ref<CargoLot[]>([])
const satellite = ref(false)
const focusId = ref('')
const view = reactive({ x: 0, y: 0, w: defaultPlan().gridCols, h: defaultPlan().gridRows })
let fly = 0

onMounted(async () => {
  const [planRes, stockRes] = await Promise.all([
    floorApi.get(),
    inventoryApi.list({ page: 1, pageSize: 50 }),
  ])
  if (planRes.success && planRes.data?.items?.length) Object.assign(plan, planRes.data)
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
  view.w = plan.gridCols
  view.h = plan.gridRows
})

function frameOf(item?: PlanItem) {
  if (!item) return { x: 0, y: 0, w: plan.gridCols, h: plan.gridRows }
  const padX = Math.max(0.6, item.cols * 0.12)
  const padY = Math.max(1.2, item.rows * 0.2)
  return {
    x: item.col - padX,
    y: item.row - padY,
    w: item.cols + padX * 2,
    h: item.rows + padY * 2,
  }
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
  if (item.type === 'stack') {
    router.push('/stacks')
    return
  }
  if (item.type === 'warehouse' || item.type === 'idle') {
    focusId.value = item.id
    flyTo(frameOf(item))
  }
}

function back() {
  focusId.value = ''
  flyTo(frameOf())
}
</script>

<template>
  <section class="yard">
    <div class="card-head">
      <h3><i />仓库堆位示意图</h3>
      <label class="sat">卫星图 <el-switch v-model="satellite" /></label>
    </div>
    <div class="body">
      <PlanSvg
        :plan="plan"
        theme="cockpit"
        :satellite="satellite"
        :lots="lots"
        :view="view"
        @item-down="(_event, item) => onItem(item)"
      />
      <button v-if="focusId" class="back" type="button" @click="back">返回总览</button>
      <ul v-if="!focusId" class="legend">
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
  position: absolute;
  left: 44px;
  top: 221px;
  width: 1024px;
  height: 540px;
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
.card-head h3 i { width: 8px; height: 8px; background: #e7c98a; }
.sat { display: flex; align-items: center; gap: 8px; color: #c5d0dc; font-size: 13px; }
.sat :deep(.el-switch.is-checked .el-switch__core) { background: #e7c98a; border-color: #e7c98a; }
.body { position: relative; flex: 1; min-height: 0; margin: 0 10px 10px; }
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
.idle { background: rgba(86, 98, 134, .3); }
.book { background: rgba(86, 98, 134, .3); border: 1px dashed #d1c040; }
.std { box-shadow: inset 0 0 0 1px #5aed95; }
</style>
