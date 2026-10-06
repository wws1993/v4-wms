<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FloorPlan, PlanItem, PlanType } from '@/types'
import { cargoStyle, hostOf, isWarehouseItem, lotsOnStack, planLabel, planPaint, sortPlanItems, type CargoLot } from '@/plan/model'

const props = defineProps<{
  plan: FloorPlan
  theme: 'editor' | 'cockpit'
  satellite?: boolean
  selectedId?: string
  selectedIds?: string[]
  draft?: { type: PlanType; col: number; row: number; cols: number; rows: number } | null
  marquee?: { col: number; row: number; cols: number; rows: number } | null
  handles?: { col: number; row: number; cols: number; rows: number } | null
  lots?: CargoLot[]
  onlyHostId?: string
  view: { x: number; y: number; w: number; h: number }
}>()

const emit = defineEmits<{
  blank: [event: PointerEvent]
  itemDown: [event: PointerEvent, item: PlanItem]
  itemMenu: [event: PointerEvent, item: PlanItem]
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

const items = computed(() => {
  const source = props.plan.items
  if (props.theme !== 'cockpit' || !props.onlyHostId) return sortPlanItems(source)
  const host = source.find((item) => item.id === props.onlyHostId)
  if (!host) return sortPlanItems(source)
  return sortPlanItems(source.filter((item) => item.id === host.id || hostOf(item, source)?.id === host.id))
})
const viewBox = computed(() => `${props.view.x} ${props.view.y} ${props.view.w} ${props.view.h}`)

function cargo(item: PlanItem) {
  if (props.theme !== 'cockpit' || item.type !== 'stack') return []
  return lotsOnStack(item, props.plan.items, props.lots || [])
}

function paint(item: PlanItem) {
  return planPaint(item, props.theme)
}

function markY(item: PlanItem) {
  return item.row + item.rows + 0.28
}

const gridX = computed(() => {
  const start = Math.floor(props.view.x) - 1
  const end = Math.ceil(props.view.x + props.view.w) + 1
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
})

const gridY = computed(() => {
  const start = Math.floor(props.view.y) - 1
  const end = Math.ceil(props.view.y + props.view.h) + 1
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
})

function caption(item: PlanItem) {
  if (isWarehouseItem(item)) return item.name
  return planLabel(item) || item.name
}

function picked(id: string) {
  return props.selectedIds?.includes(id) || id === props.selectedId
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
    <rect
      :x="view.x - 2"
      :y="view.y - 2"
      :width="view.w + 4"
      :height="view.h + 4"
      :fill="satellite ? '#1a2420' : (theme === 'cockpit' ? '#1c2126' : '#F0F3F7')"
    />
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
      <line v-for="col in gridX" :key="'c' + col" :x1="col" :y1="view.y - 2" :x2="col" :y2="view.y + view.h + 2" />
      <line v-for="row in gridY" :key="'r' + row" :x1="view.x - 2" :y1="row" :x2="view.x + view.w + 2" :y2="row" />
    </g>
    <g
      v-for="item in items"
      :key="item.id"
      class="shape"
      @pointerdown.stop="emit('itemDown', $event, item)"
      @contextmenu.prevent.stop="emit('itemMenu', $event, item)"
    >
      <rect
        :x="item.col"
        :y="item.row"
        :width="item.cols"
        :height="item.rows"
        :fill="paint(item).fill"
        :fill-opacity="satellite ? 0.72 : paint(item).opacity"
        :stroke="picked(item.id) ? '#1B4F8A' : paint(item).stroke"
        :stroke-width="picked(item.id) ? 0.12 : 0.06"
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
    </g>
    <g class="labels">
      <text
        v-for="item in items"
        :key="'lb-' + item.id"
        :x="isWarehouseItem(item) ? item.col + item.cols / 2 : item.col + 0.18"
        :y="isWarehouseItem(item) ? markY(item) : item.row + item.rows - 0.22"
        :text-anchor="isWarehouseItem(item) ? 'middle' : 'start'"
        :dominant-baseline="isWarehouseItem(item) ? 'hanging' : 'auto'"
        :fill="paint(item).label"
        :font-size="isWarehouseItem(item) ? 0.72 : Math.max(0.42, Math.min(0.8, item.rows * 0.38))"
        :font-weight="isWarehouseItem(item) ? 700 : 500"
      >{{ caption(item) }}</text>
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
    <rect
      v-if="marquee"
      class="marquee"
      :x="marquee.col"
      :y="marquee.row"
      :width="marquee.cols"
      :height="marquee.rows"
      fill="rgba(47,128,196,.12)"
      stroke="#2f80c4"
      stroke-width="0.06"
      stroke-dasharray="0.16 0.1"
    />
    <g v-if="theme === 'editor' && handles">
      <rect
        v-for="dir in ['nw', 'ne', 'sw', 'se']"
        :key="dir"
        class="handle"
        :x="(dir.includes('w') ? handles.col : handles.col + handles.cols) - 0.22"
        :y="(dir.includes('n') ? handles.row : handles.row + handles.rows) - 0.22"
        width="0.44"
        height="0.44"
        fill="#fff"
        stroke="#1B4F8A"
        stroke-width="0.06"
        @pointerdown.stop="emit('handleDown', $event, dir)"
      />
    </g>
  </svg>
</template>

<style scoped>
.plan-svg { width: 100%; height: 100%; display: block; touch-action: none; }
.plan-svg.editor { background: #F0F3F7; }
.plan-svg.cockpit { background: #1c2126; }
.shape { cursor: pointer; }
.labels, .marquee { pointer-events: none; }
.handle { cursor: nwse-resize; }
</style>
