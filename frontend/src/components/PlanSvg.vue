<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FloorPlan, PlanItem, PlanType } from '@/types'
import { cargoStyle, lotsOnStack, planLabel, planPaint, sortPlanItems, warehouseMark, type CargoLot } from '@/plan/model'

const props = defineProps<{
  plan: FloorPlan
  theme: 'editor' | 'cockpit'
  satellite?: boolean
  selectedId?: string
  draft?: { type: PlanType; col: number; row: number; cols: number; rows: number } | null
  lots?: CargoLot[]
  view: { x: number; y: number; w: number; h: number }
}>()

const emit = defineEmits<{
  blank: [event: PointerEvent]
  itemDown: [event: PointerEvent, item: PlanItem]
  handleDown: [event: PointerEvent, dir: string]
}>()

const svgRef = ref<SVGSVGElement>()

function locate(event: { clientX: number; clientY: number }) {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const pt = svg.createSVGPoint()
  pt.x = event.clientX
  pt.y = event.clientY
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const mapped = pt.matrixTransform(matrix.inverse())
  return { x: mapped.x, y: mapped.y }
}

defineExpose({ locate, el: () => svgRef.value })

const items = computed(() => sortPlanItems(props.plan.items))
const viewBox = computed(() => `${props.view.x} ${props.view.y} ${props.view.w} ${props.view.h}`)

function cargo(item: PlanItem) {
  if (props.theme !== 'cockpit' || item.type !== 'stack') return []
  return lotsOnStack(item, props.plan.items, props.lots || [])
}

function paint(item: PlanItem) {
  return planPaint(item, props.theme)
}

function markY(item: PlanItem) {
  const below = item.row + item.rows + 0.25
  if (below + 0.8 > props.plan.gridRows) return item.row - 0.2
  return below
}
</script>

<template>
  <svg
    ref="svgRef"
    class="plan-svg"
    :class="theme"
    :viewBox="viewBox"
    xmlns="http://www.w3.org/2000/svg"
    @pointerdown="emit('blank', $event)"
  >
    <defs>
      <pattern id="plan-road" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#D8DEE8" />
        <line x1="0.08" y1="0.5" x2="0.92" y2="0.5" stroke="#5A6A7E" stroke-width="0.08" stroke-dasharray="0.18 0.12" />
      </pattern>
      <pattern id="plan-bush" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#E5F2EA" />
        <circle cx="0.32" cy="0.4" r="0.16" fill="#2E7D4F" />
        <circle cx="0.7" cy="0.62" r="0.14" fill="#6AA57E" />
      </pattern>
      <pattern id="plan-road-cockpit" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#2a3140" />
        <line x1="0.08" y1="0.5" x2="0.92" y2="0.5" stroke="rgba(255,255,255,0.28)" stroke-width="0.06" stroke-dasharray="0.16 0.12" />
      </pattern>
      <pattern id="plan-bush-cockpit" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill="#1a2820" />
        <circle cx="0.32" cy="0.4" r="0.16" fill="#2f6a45" />
        <circle cx="0.7" cy="0.62" r="0.13" fill="#3d8a58" />
      </pattern>
      <pattern id="plan-hatch-mix" width="0.55" height="0.55" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <rect width="0.55" height="0.55" fill="#9c7c54" fill-opacity="0.7" />
        <line x1="0" y1="0" x2="0" y2="0.55" stroke="#9e7e58" stroke-width="0.16" />
      </pattern>
      <pattern id="plan-hatch-gold" width="0.55" height="0.55" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <rect width="0.55" height="0.55" fill="#a58136" />
        <line x1="0" y1="0" x2="0" y2="0.55" stroke="#b89b63" stroke-width="0.16" />
      </pattern>
      <pattern id="plan-hatch-slate" width="0.55" height="0.55" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <rect width="0.55" height="0.55" fill="#585b72" fill-opacity="0.7" />
        <line x1="0" y1="0" x2="0" y2="0.55" stroke="#676c81" stroke-width="0.16" />
      </pattern>
    </defs>
    <rect :width="plan.gridCols" :height="plan.gridRows" :fill="satellite ? '#1a2420' : (theme === 'cockpit' ? '#1c2126' : '#F0F3F7')" />
    <image
      v-if="satellite"
      href="/yard-satellite.jpg"
      x="0"
      y="0"
      :width="plan.gridCols"
      :height="plan.gridRows"
      preserveAspectRatio="xMidYMid slice"
    />
    <g v-if="!satellite" :stroke="theme === 'cockpit' ? 'rgba(255,255,255,0.08)' : '#D8DEE8'" stroke-width="0.03">
      <line v-for="col in plan.gridCols + 1" :key="'c' + col" :x1="col - 1" y1="0" :x2="col - 1" :y2="plan.gridRows" />
      <line v-for="row in plan.gridRows + 1" :key="'r' + row" x1="0" :y1="row - 1" :x2="plan.gridCols" :y2="row - 1" />
    </g>
    <g
      v-for="item in items"
      :key="item.id"
      class="shape"
      @pointerdown.stop="emit('itemDown', $event, item)"
    >
      <rect
        :x="item.col"
        :y="item.row"
        :width="item.cols"
        :height="item.rows"
        :fill="paint(item).fill"
        :fill-opacity="satellite ? 0.72 : paint(item).opacity"
        :stroke="item.id === selectedId ? '#1B4F8A' : paint(item).stroke"
        :stroke-width="item.id === selectedId ? 0.12 : 0.06"
        :stroke-dasharray="paint(item).dash"
      />
      <g v-if="cargo(item).length">
        <rect
          v-for="(lot, index) in cargo(item)"
          :key="lot.stackText + index"
          :x="item.col + 0.15"
          :y="item.row + 0.15 + index * ((item.rows - 0.3) / cargo(item).length)"
          :width="item.cols - 0.3"
          :height="(item.rows - 0.3) / cargo(item).length - 0.08"
          :fill="cargoStyle(lot.consignor, lot.cargoType).fill"
          :fill-opacity="cargoStyle(lot.consignor, lot.cargoType).opacity"
          :stroke="cargoStyle(lot.consignor, lot.cargoType).stroke"
          stroke-width="0.08"
        />
      </g>
      <text
        v-if="planLabel(item)"
        :x="item.type === 'stack' ? item.col + 0.2 : item.col + item.cols / 2"
        :y="item.type === 'stack' ? item.row + item.rows - 0.25 : item.row + item.rows / 2"
        :text-anchor="item.type === 'stack' ? 'start' : 'middle'"
        dominant-baseline="middle"
        :fill="paint(item).label"
        :font-size="Math.max(0.42, Math.min(0.85, item.rows * 0.42))"
      >{{ planLabel(item) }}</text>
      <text
        v-if="item.type === 'warehouse' || item.type === 'idle'"
        :x="item.col + item.cols / 2"
        :y="markY(item)"
        text-anchor="middle"
        dominant-baseline="hanging"
        :fill="paint(item).label"
        font-size="0.7"
        font-weight="700"
      >{{ warehouseMark(item) }}</text>
      <g v-if="theme === 'editor' && item.id === selectedId">
        <rect
          v-for="dir in ['nw', 'ne', 'sw', 'se']"
          :key="dir"
          class="handle"
          :x="(dir.includes('w') ? item.col : item.col + item.cols) - 0.22"
          :y="(dir.includes('n') ? item.row : item.row + item.rows) - 0.22"
          width="0.44"
          height="0.44"
          fill="#fff"
          stroke="#1B4F8A"
          stroke-width="0.06"
          @pointerdown.stop="emit('handleDown', $event, dir)"
        />
      </g>
    </g>
    <rect
      v-if="draft"
      :x="draft.col"
      :y="draft.row"
      :width="draft.cols"
      :height="draft.rows"
      fill="rgba(27,79,138,.15)"
      stroke="#1b4f8a"
      stroke-width="0.08"
      stroke-dasharray="0.2 0.12"
    />
  </svg>
</template>

<style scoped>
.plan-svg { width: 100%; height: 100%; display: block; touch-action: none; }
.plan-svg.editor { background: #F0F3F7; }
.plan-svg.cockpit { background: #1c2126; }
.shape { cursor: pointer; }
.handle { cursor: nwse-resize; }
</style>
