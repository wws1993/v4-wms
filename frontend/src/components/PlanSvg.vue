<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FloorPlan, PlanItem, PlanType } from '@/types'
import { archiveForStack, cargoStyle, hostOf, isWarehouseItem, labelClearOf, lotsOnStack, planLabel, planPaint, sortPlanItems, stackCellGrid, stackCellRect, type CargoLot } from '@/plan/model'

const props = defineProps<{
  plan: FloorPlan
  theme: 'editor' | 'cockpit'
  selectedId?: string
  selectedIds?: string[]
  draft?: { type: PlanType; col: number; row: number; cols: number; rows: number } | null
  marquee?: { col: number; row: number; cols: number; rows: number } | null
  handles?: { col: number; row: number; cols: number; rows: number } | null
  lots?: CargoLot[]
  stacks?: Record<string, unknown>[]
  onlyHostId?: string
  view: { x: number; y: number; w: number; h: number }
}>()

const emit = defineEmits<{
  blank: [event: PointerEvent]
  itemDown: [event: PointerEvent, item: PlanItem]
  itemMenu: [event: PointerEvent, item: PlanItem]
  itemEnter: [event: PointerEvent, item: PlanItem]
  itemMove: [event: PointerEvent, item: PlanItem]
  itemLeave: [event: PointerEvent, item: PlanItem]
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

function cargoBands(item: PlanItem) {
  const rows = cargo(item)
  if (rows.some((lot) => lot.cells?.length)) return []
  return rows
}

function cargoCells(item: PlanItem) {
  const rows = cargo(item).filter((lot) => lot.cells?.length)
  if (!rows.length) return []
  const grid = stackCellGrid(item, archiveForStack(item, props.plan.items, props.stacks || []))
  const groups = new Map<string, CargoLot[]>()
  for (const lot of rows) {
    for (const key of lot.cells || []) {
      if (!stackCellRect(item, key, grid)) continue
      const list = groups.get(key) || []
      list.push(lot)
      groups.set(key, list)
    }
  }
  const marks: { key: string; x: number; y: number; w: number; h: number; consignor: string; cargoType: string }[] = []
  for (const [key, list] of groups) {
    const rect = stackCellRect(item, key, grid)
    if (!rect) continue
    // 有货整格涂满，不按重量或票数切分高度；多票同格时取干重最大的一票定色
    const top = list.slice().sort((a, b) => b.wet - a.wet)[0] || list[0]
    marks.push({
      key: `${item.id}-${key}`,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      consignor: top.consignor,
      cargoType: top.cargoType,
    })
  }
  return marks
}

function paint(item: PlanItem) {
  return planPaint(item, props.theme)
}

function shapeOpacity(item: PlanItem) {
  return paint(item).opacity
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

function stackTons(item: PlanItem) {
  if (props.theme !== 'editor' || item.type !== 'stack' || item.capacity == null) return ''
  if (item.rows < 1.4 || item.cols < 1.6) return ''
  return `${item.capacity}吨`
}

function textLines(text: string) {
  return text.replace(/\r\n/g, '\n').split('\n')
}

function plainStep(item: PlanItem) {
  const size = isWarehouseItem(item) ? 0.72 : Math.max(0.42, Math.min(0.8, item.rows * 0.38))
  return size * 1.25
}

function plainLabelY(item: PlanItem, text: string) {
  const lines = textLines(text)
  if (isWarehouseItem(item)) return markY(item)
  return item.row + item.rows - 0.22 - (lines.length - 1) * plainStep(item)
}

function stackTonSize(item: PlanItem) {
  return Math.max(0.2, Math.min(0.28, Math.min(item.cols, item.rows) * 0.11))
}

const labels = computed(() => items.value.map((item) => {
  const text = caption(item)
  const fitted = isWarehouseItem(item) || item.type === 'stack'
    ? null
    : labelClearOf(item, text, items.value, item.type === 'door' ? 0.72 : 1.2)
  return { item, text, fitted }
}))

const pickedShapes = computed(() => items.value.filter((item) => picked(item.id)))

function picked(id: string) {
  return props.selectedIds?.includes(id) || id === props.selectedId
}

function cornerArms(box: { cols: number; rows: number }) {
  const arm = (span: number) => Math.min(span * 0.4, Math.max(0.05, Math.min(0.28, span * 0.18)))
  return { hx: arm(box.cols), hy: arm(box.rows) }
}

function cornerPath(dir: string, box: { col: number; row: number; cols: number; rows: number }) {
  const { hx, hy } = cornerArms(box)
  const x = dir.includes('w') ? box.col : box.col + box.cols
  const y = dir.includes('n') ? box.row : box.row + box.rows
  const dx = dir.includes('w') ? hx : -hx
  const dy = dir.includes('n') ? hy : -hy
  return `M ${x} ${y + dy} L ${x} ${y} L ${x + dx} ${y}`
}

function cornerStroke(box: { cols: number; rows: number }) {
  const { hx, hy } = cornerArms(box)
  return Math.min(0.07, Math.max(0.025, Math.min(hx, hy) * 0.45))
}

function cornerHit(dir: string, box: { col: number; row: number; cols: number; rows: number }) {
  const { hx, hy } = cornerArms(box)
  const width = Math.max(0.28, hx + 0.12)
  const height = Math.max(0.28, hy + 0.12)
  return {
    x: (dir.includes('w') ? box.col : box.col + box.cols) - (dir.includes('w') ? 0.06 : width - 0.06),
    y: (dir.includes('n') ? box.row : box.row + box.rows) - (dir.includes('n') ? 0.06 : height - 0.06),
    width,
    height,
  }
}

function snapEdge(value: number) {
  return Math.round(value * 1000) / 1000
}

/** 驾驶舱区块描边：同一条边上的线段收成一条，相邻区块不会叠成双线。 */
const borders = computed(() => {
  if (props.theme !== 'cockpit' && props.theme !== 'editor') return []
  const groups = new Map<string, { axis: 'h' | 'v'; pos: number; spans: [number, number][] }>()
  const push = (axis: 'h' | 'v', pos: number, from: number, to: number) => {
    const a = Math.min(from, to)
    const b = Math.max(from, to)
    if (b - a < 0.001) return
    const key = `${axis}:${pos}`
    const group = groups.get(key)
    if (group) group.spans.push([a, b])
    else groups.set(key, { axis, pos, spans: [[a, b]] })
  }
  items.value.forEach((item) => {
    const x1 = snapEdge(item.col)
    const y1 = snapEdge(item.row)
    const x2 = snapEdge(item.col + item.cols)
    const y2 = snapEdge(item.row + item.rows)
    push('h', y1, x1, x2)
    push('h', y2, x1, x2)
    push('v', x1, y1, y2)
    push('v', x2, y1, y2)
  })
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  groups.forEach((group) => {
    const spans = group.spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let start = spans[0][0]
    let end = spans[0][1]
    const flush = () => {
      if (group.axis === 'h') lines.push({ x1: start, y1: group.pos, x2: end, y2: group.pos })
      else lines.push({ x1: group.pos, y1: start, x2: group.pos, y2: end })
    }
    spans.slice(1).forEach(([from, to]) => {
      if (from <= end + 0.001) end = Math.max(end, to)
      else {
        flush()
        start = from
        end = to
      }
    })
    flush()
  })
  return lines
})
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
      fill="#1c2126"
    />
    <g stroke="rgba(255,255,255,0.08)" stroke-width="0.03">
      <line v-for="col in gridX" :key="'c' + col" :x1="col" :y1="view.y - 2" :x2="col" :y2="view.y + view.h + 2" />
      <line v-for="row in gridY" :key="'r' + row" :x1="view.x - 2" :y1="row" :x2="view.x + view.w + 2" :y2="row" />
    </g>
    <g
      v-for="item in items"
      :key="item.id"
      class="shape"
      @pointerdown.stop="emit('itemDown', $event, item)"
      @pointerenter.stop="emit('itemEnter', $event, item)"
      @pointermove.stop="emit('itemMove', $event, item)"
      @pointerleave.stop="emit('itemLeave', $event, item)"
      @contextmenu.prevent.stop="emit('itemMenu', $event, item)"
    >
      <rect
        :x="item.col"
        :y="item.row"
        :width="item.cols"
        :height="item.rows"
        :fill="paint(item).fill"
        :fill-opacity="shapeOpacity(item)"
        :stroke="'none'"
      />
      <g v-if="cargoCells(item).length">
        <rect
          v-for="cell in cargoCells(item)"
          :key="cell.key"
          :x="cell.x"
          :y="cell.y"
          :width="cell.w"
          :height="cell.h"
          :fill="cargoStyle(cell.consignor, cell.cargoType).fill"
          :fill-opacity="cargoStyle(cell.consignor, cell.cargoType).opacity"
          :stroke="cargoStyle(cell.consignor, cell.cargoType).stroke"
          stroke-width="0.04"
        />
      </g>
      <g v-else-if="cargoBands(item).length">
        <rect
          v-for="(lot, index) in cargoBands(item)"
          :key="lot.stackText + index"
          :x="item.col + 0.15"
          :y="item.row + 0.15 + index * ((item.rows - 0.3) / cargoBands(item).length)"
          :width="item.cols - 0.3"
          :height="(item.rows - 0.3) / cargoBands(item).length - 0.08"
          :fill="cargoStyle(lot.consignor, lot.cargoType).fill"
          :fill-opacity="cargoStyle(lot.consignor, lot.cargoType).opacity"
          :stroke="cargoStyle(lot.consignor, lot.cargoType).stroke"
          stroke-width="0.08"
        />
      </g>
    </g>
    <g v-if="borders.length" class="block-border">
      <line
        v-for="(line, index) in borders"
        :key="'bd-' + index"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        vector-effect="non-scaling-stroke"
      />
    </g>
    <g class="labels">
      <template v-for="row in labels" :key="'lb-' + row.item.id">
        <text
          v-if="row.fitted"
          :x="row.fitted.x"
          :y="row.fitted.y"
          text-anchor="middle"
          dominant-baseline="central"
          :fill="paint(row.item).label"
          :font-size="row.fitted.size"
          font-weight="600"
        >
          <template v-if="row.fitted.lines">
            <tspan
              v-for="(line, index) in row.fitted.lines"
              :key="'ln-' + index"
              :x="row.fitted.x"
              :dy="index ? row.fitted.step : 0"
            >{{ line }}</tspan>
          </template>
          <template v-else>
            <tspan
              v-for="(ch, index) in row.fitted.chars"
              :key="index"
              :x="row.fitted.vertical ? row.fitted.x : undefined"
              :dy="row.fitted.vertical && index ? row.fitted.step : 0"
            >{{ ch }}</tspan>
          </template>
        </text>
        <text
          v-else-if="row.text"
          :y="plainLabelY(row.item, row.text)"
          :text-anchor="isWarehouseItem(row.item) ? 'middle' : 'start'"
          :dominant-baseline="isWarehouseItem(row.item) ? 'hanging' : 'auto'"
          :fill="paint(row.item).label"
          :font-size="isWarehouseItem(row.item) ? 0.72 : Math.max(0.42, Math.min(0.8, row.item.rows * 0.38))"
          :font-weight="isWarehouseItem(row.item) ? 700 : 500"
        >
          <tspan
            v-for="(line, index) in textLines(row.text)"
            :key="index"
            :x="isWarehouseItem(row.item) ? row.item.col + row.item.cols / 2 : row.item.col + 0.18"
            :dy="index ? plainStep(row.item) : 0"
          >{{ line }}</tspan>
        </text>
        <text
          v-if="stackTons(row.item)"
          class="ton-mark"
          :x="row.item.col + row.item.cols - 0.14"
          :y="row.item.row + row.item.rows - 0.16"
          text-anchor="end"
          fill="rgba(255,255,255,0.55)"
          :font-size="stackTonSize(row.item)"
          font-weight="500"
        >{{ stackTons(row.item) }}</text>
      </template>
    </g>
    <slot />
    <rect
      v-if="draft"
      :x="draft.col"
      :y="draft.row"
      :width="draft.cols"
      :height="draft.rows"
      fill="rgba(231,201,138,.16)"
      stroke="#e7c98a"
      stroke-width="0.06"
      stroke-dasharray="0.2 0.12"
    />
    <rect
      v-if="marquee"
      class="marquee"
      :x="marquee.col"
      :y="marquee.row"
      :width="marquee.cols"
      :height="marquee.rows"
      fill="rgba(231,201,138,.12)"
      stroke="#e7c98a"
      stroke-width="0.06"
      stroke-dasharray="0.16 0.1"
    />
    <g v-if="theme === 'editor' && !handles" class="corners">
      <g v-for="item in pickedShapes" :key="'corner-' + item.id">
        <path v-for="dir in ['nw', 'ne', 'sw', 'se']" :key="dir" :d="cornerPath(dir, item)" :stroke-width="cornerStroke(item)" />
      </g>
    </g>
    <g v-if="theme === 'editor' && handles">
      <rect
        :x="handles.col"
        :y="handles.row"
        :width="handles.cols"
        :height="handles.rows"
        fill="none"
        stroke="#e7c98a"
        stroke-width="0.045"
        stroke-dasharray="0.16 0.1"
        pointer-events="none"
      />
      <g
        v-for="dir in ['nw', 'ne', 'sw', 'se']"
        :key="dir"
        class="handle"
        :class="'handle-' + dir"
        @pointerdown.stop="emit('handleDown', $event, dir)"
      >
        <rect v-bind="cornerHit(dir, handles)" fill="transparent" />
        <path :d="cornerPath(dir, handles)" :stroke-width="cornerStroke(handles)" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.plan-svg { width: 100%; height: 100%; display: block; touch-action: none; }
.block-border { pointer-events: none; stroke: #fff; stroke-width: 1; stroke-linecap: square; }
.plan-svg.editor { background: #1c2126; }
.plan-svg.cockpit { background: #1c2126; }
.shape { cursor: pointer; }
.labels, .marquee, .corners { pointer-events: none; }
.corners path,
.handle path { fill: none; stroke: #e7c98a; stroke-linecap: square; stroke-linejoin: miter; }
.handle { pointer-events: auto; }
.handle path { pointer-events: none; }
.ton-mark { fill-opacity: 0.72; }
.handle-nw, .handle-se { cursor: nwse-resize; }
.handle-ne, .handle-sw { cursor: nesw-resize; }
</style>
