<script setup lang="ts">
import { computed, watch } from 'vue'
import type { FloorPlan, PlanItem } from '@/types'
import { hostOf, isWarehouseItem, stackCode, warehouseCodeOf, type CargoLot } from '@/plan/model'

type Tone = 'raw' | 'mix' | 'fg' | 'qc'
type Level = 'lv-low' | 'lv-mid' | 'lv-high' | 'lv-crit'

const PALETTE: Record<Tone, { top: string; left: string; right: string; roof: string; ground: string; door: string; accent: string }> = {
  raw: { top: '#7CB8E8', left: '#3D6F9E', right: '#4E84B5', roof: '#2A5580', ground: '#162838', door: '#1E3A52', accent: '#5A9FD4' },
  mix: { top: '#B0A4E8', left: '#6E62A8', right: '#8578BF', roof: '#524888', ground: '#221E38', door: '#342E52', accent: '#9B8FD4' },
  fg: { top: '#6FD4A8', left: '#3A9468', right: '#4AAA7C', roof: '#287050', ground: '#142820', door: '#1E4030', accent: '#4DB88A' },
  qc: { top: '#E8C878', left: '#A88438', right: '#C49A48', roof: '#886828', ground: '#302818', door: '#483818', accent: '#D4A850' },
}

const STACK_FACE: Record<Level, { top: string; left: string; right: string }> = {
  'lv-low': { top: '#4A8FA8', left: '#2E6078', right: '#3A7890' },
  'lv-mid': { top: '#5A8FD4', left: '#3A6098', right: '#4878B0' },
  'lv-high': { top: '#C49A48', left: '#8A6828', right: '#A88438' },
  'lv-crit': { top: '#C45868', left: '#8A3848', right: '#A84858' },
}

interface StackCube {
  id: string
  code: string
  area: string
  areaTone: Tone
  level: Level
  rate: number
  tons: number
}

interface HouseCard {
  key: string
  name: string
  zone: string
  rate: number
  tone: Tone
  warn: boolean
  tons: number
  count: number
  planItem: PlanItem | null
  cols: number
  stacks: StackCube[]
  paint: (typeof PALETTE)['raw']
  phase: number
}

const props = defineProps<{
  plan: FloorPlan
  houses: Record<string, unknown>[]
  stacks: Record<string, unknown>[]
  lots: CargoLot[]
  warnCodes: string[]
}>()

const emit = defineEmits<{
  open: [item: PlanItem | null]
  hover: [payload: { title: string; rate: string; line: string; hint: string; x: number; y: number }]
  leave: []
  usage: [items: { name: string; rate: number }[]]
}>()

function areaTone(area: string): Tone {
  if (area.includes('待检')) return 'qc'
  if (area.includes('成品')) return 'fg'
  if (area.includes('混')) return 'mix'
  return 'raw'
}

function levelOf(rate: number): Level {
  if (rate >= 85) return 'lv-crit'
  if (rate >= 70) return 'lv-high'
  if (rate >= 40) return 'lv-mid'
  return 'lv-low'
}

function houseTone(areas: string[], index: number): Tone {
  if (!areas.length) return (['raw', 'mix', 'fg', 'qc'] as Tone[])[index % 4]
  const counts: Record<Tone, number> = { raw: 0, mix: 0, fg: 0, qc: 0 }
  for (const area of areas) counts[areaTone(area)] += 1
  const ranked = (Object.entries(counts) as [Tone, number][]).sort((a, b) => b[1] - a[1])
  const [lead, next] = ranked
  if (!lead || lead[1] === 0) return 'raw'
  if (next && next[1] > 0 && lead[1] / areas.length < 0.7) return 'mix'
  return lead[0]
}

function pilePath(rate: number) {
  const fill = Math.round(Math.max(0, Math.min(100, rate)) * 0.38)
  if (fill < 2) return ''
  return `M108 ${92 - fill} L108 92 L136 78 L136 ${78 - fill * 0.72} Z`
}

function stockTons(match: (lot: CargoLot) => boolean) {
  return Math.round(props.lots.reduce((sum, lot) => sum + (lot.status === '在库' && match(lot) ? lot.wet : 0), 0))
}

function lotsOf(code: string, areaId: string) {
  return props.lots.filter((lot) => {
    if (lot.status && lot.status !== '在库') return false
    if (areaId && lot.areaId === areaId) return true
    return lot.stackText === code
  })
}

function sameHouse(left: string, right: string) {
  if (!left || !right) return false
  return left === right || warehouseCodeOf(left) === warehouseCodeOf(right)
}

function planItemOf(code: string) {
  return props.plan.items.find((item) => isWarehouseItem(item) && sameHouse(item.name, code)) || null
}

function cubesFor(code: string, houseId: string, planItem: PlanItem | null): StackCube[] {
  const seen = new Set<string>()
  const rows: { id: string; code: string; area: string; capacity: number }[] = []
  const push = (id: string, stackCodeText: string, area: string, capacity: number) => {
    const key = stackCodeText.trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push({ id, code: key, area, capacity })
  }
  for (const row of props.stacks) {
    const id = String(row.warehouseId || '')
    const named = String(row.warehouse || '')
    const belongs = (houseId && id === houseId) || sameHouse(named, code)
    if (!belongs) continue
    push(String(row.id || ''), String(row.code || ''), String(row.areaLabel || ''), Number(row.capacity) || 0)
  }
  if (planItem) {
    for (const item of props.plan.items) {
      if (item.type !== 'stack' || hostOf(item, props.plan.items)?.id !== planItem.id) continue
      if (item.stackId && rows.some((entry) => entry.id === item.stackId)) continue
      const slot = item.name.replace(/^\d+#/, '').trim() || item.name
      push(item.stackId || '', stackCode(planItem.name, slot), '', 0)
    }
  }
  return rows.map((row) => {
    const tons = Math.round(lotsOf(row.code, row.id).reduce((sum, lot) => sum + lot.wet, 0))
    const rate = row.capacity > 0 ? Math.min(100, Math.round((tons / row.capacity) * 100)) : tons > 0 ? 40 : 0
    return {
      id: row.id,
      code: row.code,
      area: row.area,
      areaTone: areaTone(row.area),
      level: levelOf(rate),
      rate,
      tons,
    }
  })
}

const cards = computed<HouseCard[]>(() => {
  const seen = new Set<string>()
  const entries: { code: string; house?: Record<string, unknown>; planItem: PlanItem | null }[] = []
  for (const house of props.houses) {
    const code = warehouseCodeOf(String(house.code || ''))
    if (!code || seen.has(code)) continue
    seen.add(code)
    entries.push({ code, house, planItem: planItemOf(code) })
  }
  for (const item of props.plan.items) {
    if (item.type !== 'warehouse') continue
    const code = warehouseCodeOf(item.name)
    if (!code || seen.has(code)) continue
    seen.add(code)
    entries.push({ code, planItem: item })
  }
  return entries.map((entry, index) => {
    const houseId = String(entry.house?.id || '')
    const stacks = cubesFor(entry.code, houseId, entry.planItem)
    const fromLots = stockTons((lot) => sameHouse(lot.warehouse, entry.code))
    const tons = props.lots.length ? fromLots : (fromLots || Number(entry.house?.used) || 0)
    const given = Number(entry.house?.rate)
    const capacity = Number(entry.house?.capacity) || 0
    const rate = Number.isFinite(given) && entry.house?.rate != null && entry.house.rate !== ''
      ? Math.round(given)
      : capacity > 0 ? Math.min(100, Math.round((tons / capacity) * 100)) : 0
    const lead = stacks.find((stack) => stack.tons > 0) || stacks[0]
    const tone = houseTone(stacks.map((stack) => stack.area).filter(Boolean), index)
    return {
      key: `h${index}`,
      name: entry.code,
      zone: lead ? `${lead.code} · ${lead.area || '堆位'}` : '暂无堆位',
      rate,
      tone,
      warn: props.warnCodes.some((item) => sameHouse(item, entry.code)),
      tons,
      count: stacks.length,
      planItem: entry.planItem,
      cols: stacks.length > 8 ? 6 : 4,
      stacks,
      paint: PALETTE[tone],
      phase: index,
    }
  })
})

watch(
  cards,
  (list) => {
    emit('usage', list.map((card) => ({ name: card.name, rate: card.rate })))
  },
  { immediate: true },
)

function lotHint(stack: StackCube) {
  const rows = lotsOf(stack.code, stack.id)
  if (!rows.length) return '空闲堆位'
  const cells = new Set(rows.flatMap((lot) => lot.cells || []))
  const body = rows.map((lot) => [lot.consignor, lot.cargoType, `干重${Math.round(lot.wet)}吨`].filter(Boolean).join(' ')).join('；')
  return [cells.size ? `占用${cells.size}格` : '', body].filter(Boolean).join(' · ')
}

function hoverHouse(event: PointerEvent, card: HouseCard) {
  emit('hover', {
    title: card.name,
    rate: `${card.rate}%`,
    line: `堆位${card.count}个 · 干重${card.tons}吨`,
    hint: '点击查看该仓库平面图',
    x: event.clientX,
    y: event.clientY,
  })
}

function hoverStack(event: PointerEvent, stack: StackCube) {
  emit('hover', {
    title: stack.code,
    rate: `${stack.rate}%`,
    line: [stack.area, stack.tons > 0 ? '在库' : '空闲', `干重${stack.tons}吨`].filter(Boolean).join(' · '),
    hint: lotHint(stack),
    x: event.clientX,
    y: event.clientY,
  })
}

function openCard(card: HouseCard) {
  emit('open', card.planItem)
}

function flowStyle(card: HouseCard, extra = 0) {
  return {
    animationDelay: `${card.phase * 0.55 + extra}s`,
    animationDuration: `${3.1 + (card.phase % 4) * 0.28}s`,
  }
}

function stackGlow(card: HouseCard, index: number) {
  return { animationDelay: `${card.phase * 0.4 + index * 0.28}s` }
}
</script>

<template>
  <div class="iso">
    <p v-if="!cards.length" class="empty">暂无仓库</p>
    <div v-else class="wh-grid">
      <article v-for="card in cards" :key="card.name" class="wh-card" :class="[card.tone, { 'is-warn': card.warn }]">
        <button
          type="button"
          class="wh-card-scene"
          :aria-label="`${card.name} ${card.rate}%`"
          @click="openCard(card)"
          @pointerenter="hoverHouse($event, card)"
          @pointermove="hoverHouse($event, card)"
          @pointerleave="emit('leave')"
        >
          <svg class="wh-iso-svg" viewBox="0 0 200 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient :id="`wh-iso-${card.key}`" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" :stop-color="card.paint.top" stop-opacity="0.95" />
                <stop offset="100%" :stop-color="card.paint.left" stop-opacity="0.85" />
              </linearGradient>
            </defs>
            <ellipse cx="100" cy="112" rx="72" ry="10" fill="rgba(0,0,0,0.28)" />
            <path d="M18 88 L100 48 L182 88 L100 128 Z" :fill="card.paint.ground" stroke="rgba(255,255,255,0.06)" stroke-width="0.6" />
            <path d="M52 52 L52 90 L100 114 L100 76 Z" :fill="card.paint.left" />
            <path d="M100 76 L100 114 L148 90 L148 52 Z" :fill="card.paint.right" />
            <path d="M52 52 L100 30 L148 52 L100 76 Z" :fill="`url(#wh-iso-${card.key})`" />
            <path d="M52 52 L100 30 L100 38 L52 60 Z" :fill="card.paint.roof" opacity="0.92" />
            <path d="M100 30 L148 52 L148 60 L100 38 Z" :fill="card.paint.roof" opacity="0.78" />
            <path class="flow-track" d="M52 52 L100 30 L148 52 L100 76 Z" />
            <path class="flow glow" :class="{ warn: card.warn }" d="M52 52 L100 30 L148 52 L100 76 Z" :style="flowStyle(card)" />
            <path class="flow" :class="{ warn: card.warn }" d="M52 52 L100 30 L148 52 L100 76 Z" :style="flowStyle(card)" />
            <path class="flow inner" :class="{ warn: card.warn }" d="M62.6 52.1 L100 35 L137.4 52.1 L100 70.8 Z" :style="flowStyle(card, 0.8)" />
            <path d="M68 78 L68 92 L84 100 L84 86 Z" :fill="card.paint.door" opacity="0.55" />
            <path v-if="pilePath(card.rate)" :d="pilePath(card.rate)" :fill="card.paint.accent" opacity="0.42" />
            <path d="M118 38 L132 46 L132 50 L118 42 Z" fill="rgba(255,255,255,0.12)" />
            <path d="M62 94 L78 102 L78 98 L62 90 Z" fill="rgba(0,0,0,0.12)" />
          </svg>
          <span class="wh-card-copy">
            <strong>{{ card.name }}</strong>
            <em>{{ card.zone }}</em>
            <b>{{ card.rate }}%</b>
          </span>
        </button>
        <div class="wh-card-strip">
          <span class="wh-strip-label">堆位</span>
          <p v-if="!card.stacks.length" class="strip-empty">暂无堆位</p>
          <div v-else class="wh-strip-grid" :style="{ gridTemplateColumns: `repeat(${card.cols}, minmax(0, 1fr))` }">
            <button
              v-for="(stack, stackIndex) in card.stacks"
              :key="stack.code"
              type="button"
              class="stack-cell"
              :class="`area-${stack.areaTone}`"
              :aria-label="`${stack.code} ${stack.rate}%`"
              @click="openCard(card)"
              @pointerenter="hoverStack($event, stack)"
              @pointermove="hoverStack($event, stack)"
              @pointerleave="emit('leave')"
            >
              <svg class="stack-iso-svg" viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M2 11 L10 7 L18 11 L10 15 Z" :fill="STACK_FACE[stack.level].left" opacity="0.35" />
                <path d="M2 11 L2 8 L10 4 L10 7 Z" :fill="STACK_FACE[stack.level].left" />
                <path d="M10 7 L10 4 L18 8 L18 11 Z" :fill="STACK_FACE[stack.level].right" />
                <path d="M2 8 L10 4 L18 8 L10 12 Z" :fill="STACK_FACE[stack.level].top" />
                <path class="stack-glow" :class="stack.level" d="M2 8 L10 4 L18 8 L10 12 Z" :style="stackGlow(card, stackIndex)" />
              </svg>
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.iso {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 4px 4px 30px;
  box-sizing: border-box;
}
.empty {
  margin: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, .45);
  font-size: 13px;
}
.wh-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 8px;
}
.wh-card {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(214, 176, 106, .28);
  background: linear-gradient(180deg, rgba(12, 24, 38, .96), rgba(8, 16, 26, .98));
}
.wh-card:hover { border-color: rgba(231, 201, 138, .7); }
.wh-card.is-warn { animation: warnPulse 1.1s ease-in-out infinite; }
.wh-card-scene {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px 2px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.wh-card-scene:hover,
.wh-card-scene:focus-visible { background: rgba(231, 201, 138, .08); }
.wh-iso-svg {
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: block;
}
.flow-track,
.flow {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  pointer-events: none;
}
.flow-track {
  stroke: rgba(246, 231, 191, .28);
  stroke-width: 1.1;
}
.flow {
  stroke: #f6e7bf;
  stroke-width: 1.7;
  stroke-dasharray: 26 186.94;
  animation-name: flow-outer;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-duration: 3.2s;
}
.flow.glow {
  stroke: rgba(255, 236, 196, .42);
  stroke-width: 4.2;
}
.flow.inner {
  stroke-width: 1.15;
  stroke-dasharray: 12 154.09;
  opacity: .8;
  animation-name: flow-inner;
}
.flow.warn { stroke: #ffb0b0; }
.flow.warn.glow { stroke: rgba(255, 140, 140, .45); }
@keyframes flow-outer { to { stroke-dashoffset: -212.94; } }
@keyframes flow-inner { to { stroke-dashoffset: -166.09; } }
.wh-card-copy {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px 16px;
  text-align: left;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(8, 16, 26, .72) 0%, rgba(8, 16, 26, .2) 55%, transparent 100%);
}
.wh-card-copy strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e8f0f8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.wh-card-scene:hover .wh-card-copy strong { color: #f0d7a4; }
.wh-card-copy em {
  color: rgba(255, 255, 255, .55);
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.wh-card-copy b {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 600;
}
.wh-card.raw .wh-card-copy b { color: #7cb8e8; }
.wh-card.mix .wh-card-copy b { color: #b0a4e8; }
.wh-card.fg .wh-card-copy b { color: #6fd4a8; }
.wh-card.qc .wh-card-copy b { color: #e8c878; }
.wh-card-strip {
  flex: 0 0 auto;
  min-height: 64px;
  max-height: 42%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 8px 8px;
  overflow: auto;
  background: rgba(8, 16, 26, .88);
  border-top: 1px solid rgba(214, 176, 106, .18);
}
.wh-strip-label {
  flex-shrink: 0;
  color: rgba(255, 255, 255, .45);
  font-size: 9px;
  letter-spacing: 0.08em;
}
.strip-empty {
  margin: 0;
  color: rgba(255, 255, 255, .35);
  font-size: 12px;
}
.wh-strip-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 4px;
  align-items: end;
}
.stack-cell {
  height: 100%;
  min-height: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
}
.stack-cell:hover { transform: translateY(-2px); }
.stack-cell.area-raw { box-shadow: inset 0 0 0 1px rgba(124, 184, 232, .45); }
.stack-cell.area-mix { box-shadow: inset 0 0 0 1px rgba(176, 164, 232, .55); }
.stack-cell.area-fg { box-shadow: inset 0 0 0 1px rgba(111, 212, 168, .55); }
.stack-cell.area-qc { box-shadow: inset 0 0 0 1px rgba(232, 200, 120, .55); }
.stack-iso-svg {
  width: 100%;
  height: auto;
  max-height: 100%;
  display: block;
}
.stack-cell:hover .stack-iso-svg { transform: scale(1.08); }
.stack-glow {
  fill: #fff6dc;
  opacity: 0.05;
  pointer-events: none;
  animation: stack-glow 2.8s ease-in-out infinite;
}
.stack-glow.lv-mid { animation-duration: 2.3s; }
.stack-glow.lv-high { animation-duration: 1.8s; }
.stack-glow.lv-crit {
  fill: #ffb4b4;
  animation-duration: 1.15s;
}
@keyframes stack-glow {
  0%, 100% { opacity: 0.04; }
  50% { opacity: 0.72; }
}
@keyframes warnPulse {
  0%, 100% { border-color: rgba(220, 80, 90, .45); box-shadow: inset 0 0 0 1px rgba(220, 80, 90, .15); }
  50% { border-color: rgba(255, 120, 120, .95); box-shadow: inset 0 0 16px rgba(220, 80, 90, .4); }
}
@media (prefers-reduced-motion: reduce) {
  .wh-card.is-warn { animation: none; border-color: rgba(255, 120, 120, .85); }
  .flow, .stack-glow { animation: none; }
}
</style>
