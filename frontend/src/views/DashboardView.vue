<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { auditApi, authApi, dashboardApi, settingsApi, warningApi } from '@/api'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { useAuthStore } from '@/stores/auth'
import PulseDot from '@/components/PulseDot.vue'
import YardBoard from '@/components/YardBoard.vue'

interface LogItem { type: string; text: string; time: string }
interface UsageItem { name: string; rate: number }
interface TrendItem { day: string; dry: number }
interface WarnItem { title: string; detail: string; time: string; link: string; tone?: string }

const DEFAULT_REFRESH_MINUTES = 3
const FLOW_LIMIT = 30

function pollMs(minutes: unknown) {
  const value = Number(minutes)
  const mins = value > 0 ? value : DEFAULT_REFRESH_MINUTES
  return mins * 60 * 1000
}

function dayText(offset = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function warnTone(level: unknown) {
  const text = String(level || '')
  if (text.includes('高')) return 'red'
  if (text.includes('中')) return 'orange'
  return 'yellow'
}

function mapWarning(row: Record<string, unknown>): WarnItem {
  const type = String(row.type || '预警')
  const target = String(row.target || '').trim()
  const detail = String(row.detail || '').trim()
  return {
    title: target ? `${type} · ${target}` : type,
    detail: detail || target || '—',
    time: String(row.time || ''),
    link: '/warning-logs',
    tone: warnTone(row.level),
  }
}

/** 作业链路展示类型：入仓 / 出仓 / 称重 / 生产 / 加工 / 完工 / 移库 / 盘点。 */
function flowTypeOf(row: Record<string, unknown>): string | null {
  const module = String(row.module || '')
  const blob = [module, row.action, row.content, row.detail].map((item) => String(item || '')).join(' ')
  if (blob.includes('盘点')) return '盘点'
  if (blob.includes('移库')) return '移库'
  if (blob.includes('完工')) return '完工'
  if (blob.includes('加工')) return '加工'
  if (blob.includes('投料') || module.includes('生产')) return '生产'
  if (blob.includes('收货') || blob.includes('称重') || blob.includes('到货')) return '称重'
  if (blob.includes('出库') || blob.includes('出仓') || module.includes('出库')) return '出仓'
  if (blob.includes('入库') || blob.includes('入仓') || blob.includes('预约') || module.includes('入库')) return '入仓'
  return null
}

function flowTime(value: unknown) {
  const text = String(value || '')
  const hit = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2})/)
  if (hit) return `${hit[1]} ${hit[2]}时`
  return text || '—'
}

function flowText(row: Record<string, unknown>) {
  const biz = String(row.bizNo || '').trim()
  const body = String(row.content || row.detail || '').trim()
  const parts = [biz && biz !== '—' ? biz : '', body && body !== '—' ? body : ''].filter(Boolean)
  return parts.join(' · ') || '—'
}

function mapFlowLog(row: Record<string, unknown>): LogItem | null {
  const type = flowTypeOf(row)
  if (!type) return null
  return { type, text: flowText(row), time: flowTime(row.time) }
}

const router = useRouter()
const auth = useAuthStore()
const passwordOpen = ref(false)
const boardRef = ref<HTMLElement>()
const yardRef = ref<{ reload?: (quiet?: boolean) => Promise<void> }>()
let yardBooted = false
const barRef = ref<HTMLElement>()
const lineRef = ref<HTMLElement>()
const kpi = ref({ rawWet: 0, rawDry: 0, fgWet: 0, fgDry: 0, inboundToday: 0, outboundToday: 0, pendingQc: 0, alerts: 0 })
const production = ref({ batchNo: '', total: 0, date: '', eta: '' })
const logs = ref<LogItem[]>([])
const usage = ref<UsageItem[]>([])
const trend = ref<TrendItem[]>([])
const warnings = ref<WarnItem[]>([])
const refreshedAt = ref('')
/** 无缝滚动：列表复制一份，动画 translateY(-50%)。 */
const warnTrack = computed(() => (warnings.value.length ? [...warnings.value, ...warnings.value] : []))
const warnScrollSec = computed(() => Math.max(18, warnings.value.length * 4))
const logTrack = computed(() => (logs.value.length ? [...logs.value, ...logs.value] : []))
const logScrollSec = computed(() => Math.max(20, logs.value.length * 2.4))
let barChart: echarts.ECharts | null = null
let lineChart: echarts.ECharts | null = null
let feedTimer = 0
let pollIntervalMs = pollMs(DEFAULT_REFRESH_MINUTES)

function stampRefreshed() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  refreshedAt.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function schedulePoll(ms: number) {
  pollIntervalMs = ms
  window.clearInterval(feedTimer)
  feedTimer = window.setInterval(() => {
    void refreshDashboard()
  }, pollIntervalMs)
}

const tagColor: Record<string, string> = {
  入仓: '#5b8def',
  出仓: '#e0b15a',
  称重: '#3dbe8c',
  生产: '#9b8fd4',
  加工: '#3d8bff',
  完工: '#3ec6d4',
  移库: '#e08a3a',
  盘点: '#c5a15b',
}

let observer: ResizeObserver | null = null
const num = (value: number) => value.toLocaleString('zh-CN')
function resizeCharts() {
  if ((boardRef.value?.clientWidth || 0) < 2) return
  barChart?.resize()
  lineChart?.resize()
}

async function logout() {
  await authApi.logout()
  auth.logout()
  router.push('/login')
}

function tooltipBase() {
  return {
    trigger: 'axis' as const,
    confine: true,
    backgroundColor: 'rgba(8, 16, 28, 0.94)',
    borderColor: 'rgba(214, 176, 106, 0.75)',
    textStyle: { color: '#e8eef6', fontSize: 12 },
  }
}

function renderCharts() {
  const label = { color: '#8b9bb0', fontSize: 12 }
  const split = { lineStyle: { color: 'rgba(160, 180, 200, 0.16)', type: 'dashed' as const } }
  const axisLine = { lineStyle: { color: 'rgba(255,255,255,0.12)' } }
  if (barRef.value) {
    barChart?.dispose()
    barChart = echarts.init(barRef.value)
    barChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        ...tooltipBase(),
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(231, 201, 138, 0.12)' } },
        formatter: (items: { axisValueLabel?: string; value?: number }[]) => {
          const row = Array.isArray(items) ? items[0] : items
          return `${row?.axisValueLabel || ''}<br/>占用率 ${row?.value ?? 0}%`
        },
      },
      grid: { left: 46, right: 16, top: 18, bottom: 28 },
      xAxis: {
        type: 'category',
        data: usage.value.map((item) => item.name),
        axisLine,
        axisTick: { show: false },
        axisLabel: label,
        triggerEvent: true,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: { ...label, formatter: (value: number) => (value === 0 ? '0' : `${value}%`) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: split,
      },
      series: [{
        name: '占用率',
        type: 'bar',
        barWidth: 14,
        cursor: 'pointer',
        data: usage.value.map((item) => item.rate),
        itemStyle: { color: '#c6a15b' },
        emphasis: { itemStyle: { color: '#f0d090' } },
      }],
    })
    barChart.on('click', (params) => {
      const name = String(params.name || '')
      if (!name) return
      router.push({ path: '/inventory', query: { warehouse: name } })
    })
  }
  if (lineRef.value) {
    lineChart?.dispose()
    lineChart = echarts.init(lineRef.value)
    const area = (color: string) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color },
      { offset: 1, color: 'rgba(12, 18, 28, 0.02)' },
    ])
    lineChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        ...tooltipBase(),
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(231, 201, 138, 0.45)' } },
        formatter: (items: { axisValueLabel?: string; marker?: string; seriesName?: string; value?: number }[]) => {
          const list = Array.isArray(items) ? items : [items]
          const title = list[0]?.axisValueLabel || ''
          const rows = list.map((item) => `${item.marker || ''}${item.seriesName} ${item.value ?? 0} 干吨`)
          return [title, ...rows].join('<br/>')
        },
      },
      grid: { left: 40, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.value.map((item) => item.day),
        axisLine,
        axisTick: { show: false },
        axisLabel: label,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: trendMax(trend.value.map((item) => item.dry)),
        axisLabel: label,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: split,
      },
      series: [
        {
          name: '入库干吨',
          type: 'line',
          smooth: 0.45,
          symbol: 'circle',
          symbolSize: 7,
          showSymbol: trend.value.length < 2,
          cursor: 'pointer',
          data: trend.value.map((item) => item.dry),
          lineStyle: { color: '#3aa0ff', width: 2 },
          itemStyle: { color: '#3aa0ff' },
          areaStyle: { color: area('rgba(58, 160, 255, 0.55)') },
          emphasis: { focus: 'series', scale: true },
        },
      ],
    })
    lineChart.on('click', () => {
      router.push('/inbound')
    })
  }
}

function trendMax(values: number[]) {
  const peak = Math.max(0, ...values)
  if (peak <= 0) return 10
  const step = 10 ** Math.floor(Math.log10(peak))
  return Math.ceil((peak * 1.2) / step) * step
}

function onYardUsage(items: UsageItem[]) {
  usage.value = items
  nextTick(() => {
    if (!barChart || !barRef.value) {
      renderCharts()
      return
    }
    barChart.setOption({
      xAxis: { data: items.map((item) => item.name) },
      series: [{ data: items.map((item) => item.rate) }],
    })
  })
}

async function loadWarnings() {
  const res = await warningApi.list({ page: 1, pageSize: 100, from: dayText(-4), to: dayText(0) })
  if (!res.success || !res.data) return
  warnings.value = res.data.list.map((row) => mapWarning(row))
  if (!Number(kpi.value.alerts)) kpi.value.alerts = res.data.total || warnings.value.length
}

async function loadFlowLogs() {
  const res = await auditApi.list({ page: 1, pageSize: 100 })
  if (!res.success || !res.data) return
  const rows: LogItem[] = []
  for (const row of res.data.list) {
    const item = mapFlowLog(row)
    if (!item) continue
    rows.push(item)
    if (rows.length >= FLOW_LIMIT) break
  }
  logs.value = rows
}

async function refreshDashboard() {
  const quietYard = yardBooted
  const [weightRes, dailyRes, paramRes] = await Promise.all([
    dashboardApi.weight(),
    dashboardApi.receiptDaily(),
    settingsApi.get(),
    loadWarnings(),
    loadFlowLogs(),
    yardRef.value?.reload?.(quietYard),
  ])
  yardBooted = true
  if (weightRes.success && weightRes.data) {
    kpi.value = { ...kpi.value, ...weightRes.data }
  }
  if (dailyRes.success && Array.isArray(dailyRes.data)) trend.value = dailyRes.data
  if (!Number(kpi.value.alerts) && warnings.value.length) {
    kpi.value.alerts = warnings.value.length
  }
  stampRefreshed()
  await nextTick()
  renderCharts()
  const nextMs = pollMs(paramRes.success && paramRes.data ? paramRes.data.refreshInterval : undefined)
  if (nextMs !== pollIntervalMs) {
    schedulePoll(nextMs)
    return
  }
  pollIntervalMs = nextMs
}

onMounted(async () => {
  await refreshDashboard()
  observer = new ResizeObserver(() => resizeCharts())
  if (boardRef.value) observer.observe(boardRef.value)
  if (!feedTimer) schedulePoll(pollIntervalMs)
})

onActivated(() => {
  nextTick(() => resizeCharts())
})

onBeforeUnmount(() => {
  window.clearInterval(feedTimer)
  observer?.disconnect()
  barChart?.dispose()
  lineChart?.dispose()
})
</script>

<template>
  <div ref="boardRef" class="board">
    <header class="head">
        <div>
          <h1>系统概览</h1>
          <p class="sub">
            <span>BONDED WMS · 关务监管</span>
            <span v-if="refreshedAt" class="refreshed">数据刷新 {{ refreshedAt }}</span>
          </p>
        </div>
        <div class="tools">
          <el-dropdown>
            <span class="tool user-btn">{{ auth.user?.name }}</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="passwordOpen = true">修改密码</el-dropdown-item>
                <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <img class="avatar" src="/avatar.png" alt="" />
        </div>
    </header>
    <ChangePasswordDialog v-model="passwordOpen" />

    <div class="mid">
      <div class="main-col">
      <section class="kpis">
        <article><b>{{ num(kpi.rawWet) }}</b><span>原料湿吨</span></article>
        <article><b>{{ num(kpi.rawDry) }}</b><span>原料干吨</span></article>
        <article><b>{{ num(kpi.fgWet) }}</b><span>成品湿吨</span></article>
        <article><b>{{ num(kpi.fgDry) }}</b><span>成品干吨</span></article>
      </section>

      <YardBoard ref="yardRef" @usage="onYardUsage" />
      </div>

      <div class="side-col">
      <section class="hero">
        <video src="/factory.mp4" autoplay muted loop playsinline />
        <div class="hero-meta">
          <span>生产批次：<b>{{ production.batchNo }}</b></span>
          <span>总生产量：<b>{{ production.total }}</b></span>
          <span>生产日期：<b>{{ production.date }}</b></span>
          <span>预计完工：<b>{{ production.eta }}</b></span>
        </div>
      </section>

      <section class="minis">
        <article><b class="blue">{{ kpi.inboundToday }}</b><span>今日入库</span></article>
        <article><b class="orange">{{ kpi.outboundToday }}</b><span>今日出库</span></article>
        <article><b class="gold">{{ kpi.pendingQc }}</b><span>待检任务</span></article>
        <article><b class="red">{{ kpi.alerts }}</b><span>库存预警</span></article>
      </section>

      <section class="card logs">
        <div class="card-head">
          <h3><PulseDot />仓库作业链路</h3>
          <b class="live"><PulseDot color="#3d8bff" round :size="6" />LIVE</b>
        </div>
        <div class="logs-body">
          <p v-if="!logs.length" class="logs-empty">暂无作业日志</p>
          <div v-else class="logs-viewport">
            <ul class="logs-track" :style="{ animationDuration: `${logScrollSec}s` }">
              <li
                v-for="(item, index) in logTrack"
                :key="`${item.time}-${item.type}-${item.text}-${index}`"
                :class="{ alt: index % 2 === 1 }"
              >
                <time>{{ item.time }}</time>
                <em :style="{ color: tagColor[item.type] || '#c5d0dc' }">{{ item.type }}</em>
                <span>{{ item.text }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
      </div>
    </div>

    <section class="foot">
        <article class="chart-card">
          <div class="card-head"><h3><PulseDot />仓库使用分布</h3></div>
          <div ref="barRef" class="chart" />
        </article>
        <article class="chart-card">
          <div class="card-head">
            <h3><PulseDot />近七日入库</h3>
            <div class="legend">
              <span class="in">入库干吨</span>
            </div>
          </div>
          <div ref="lineRef" class="chart" />
        </article>
        <article class="chart-card warn-card">
          <div class="card-head">
            <h3><PulseDot />预警</h3>
            <button type="button" class="warn-all" @click="router.push('/warning-logs')">全部</button>
          </div>
          <div class="warns">
            <p v-if="!warnings.length" class="warn-empty">近 5 日暂无预警</p>
            <div v-else class="warns-viewport">
              <ul class="warns-track" :style="{ animationDuration: `${warnScrollSec}s` }">
                <li
                  v-for="(item, index) in warnTrack"
                  :key="`${item.time}-${item.title}-${index}`"
                  @click="router.push(item.link)"
                >
                  <i :class="item.tone || 'red'" />
                  <div>
                    <b>{{ item.title }}</b>
                    <span>{{ item.detail }}</span>
                  </div>
                  <time>{{ item.time }}</time>
                </li>
              </ul>
            </div>
          </div>
        </article>
    </section>
  </div>
</template>

<style scoped>
.board {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) minmax(200px, 28%);
  gap: 14px;
  padding: 16px 20px 16px;
  overflow: hidden;
  color: #e8eef6;
  background:
    radial-gradient(900px 520px at 28% 18%, rgba(120, 72, 24, .18), transparent 60%),
    #0b1018;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.mid {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
  gap: 14px;
}
.main-col, .side-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.head h1 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: 1px; color: #fff; }
.head .sub {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin: 4px 0 0;
  color: rgba(255, 255, 255, .55);
  font-size: 13px;
  letter-spacing: .6px;
}
.head .refreshed {
  color: rgba(231, 201, 138, .88);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.4px;
}
.tools { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.tool {
  position: relative;
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 4px;
  background: rgba(18, 24, 34, .9);
  color: #e8eef6;
  font-size: 13px;
  line-height: 30px;
  cursor: default;
}
.user-btn { cursor: pointer; outline: none; display: inline-block; }
.avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: #1a120c; }

.kpis {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  min-height: 96px;
}
.kpis article {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(196, 122, 48, .28), transparent 58%),
    linear-gradient(180deg, #1a140f, #12161c 70%);
  border: 1px solid rgba(214, 160, 90, .75);
  box-shadow: 0 0 16px rgba(196, 130, 50, .16), inset 0 0 20px rgba(196, 130, 50, .06);
}
.kpis article::before, .kpis article::after, .minis::before, .minis::after, .logs::before, .logs::after, .chart-card::before, .chart-card::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
}
.kpis article::before, .minis::before, .logs::before, .chart-card::before {
  left: -1px; top: -1px;
  border-top: 2px solid #f0d090;
  border-left: 2px solid #f0d090;
}
.kpis article::after, .minis::after, .logs::after, .chart-card::after {
  right: -1px; bottom: -1px;
  border-right: 2px solid #f0d090;
  border-bottom: 2px solid #f0d090;
}
.kpis b {
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
  color: #e7a05a;
  font-family: Bahnschrift, "DIN Alternate", "Microsoft YaHei", sans-serif;
}
.kpis span { margin-top: 8px; color: #d5dde6; font-size: 14px; }

.hero {
  position: relative;
  flex: none;
  height: 200px;
  overflow: hidden;
}
.hero video { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-meta {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 78px;
  display: grid;
  grid-template-columns: 1.15fr .85fr;
  align-content: center;
  column-gap: 8px;
  row-gap: 6px;
  padding: 8px 16px 10px;
  background: linear-gradient(transparent, rgba(6, 12, 20, .55) 30%, rgba(6, 12, 20, .2));
  font-size: 13px;
  color: rgba(255,255,255,.9);
}
.hero-meta b { font-weight: 600; }

.minis {
  position: relative;
  flex: none;
  height: 82px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  background: linear-gradient(90deg, rgba(18, 24, 36, .92), rgba(12, 16, 24, .92));
  border: 1px solid rgba(214, 176, 106, .45);
}
.minis article { display: flex; flex-direction: column; align-items: center; }
.minis b { font-size: 28px; line-height: 1; font-family: Bahnschrift, "DIN Alternate", sans-serif; }
.minis span { margin-top: 6px; color: #c5d0dc; font-size: 13px; }
.blue { color: #3aa0ff; }
.orange { color: #e08a3a; }
.gold { color: #e6c15a; }
.red { color: #e23b32; }

.foot {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.chart-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: rgba(13, 18, 28, .94);
  border: 1px solid rgba(214, 176, 106, .28);
}
.chart { flex: 1; min-height: 0; width: 100%; }
.legend { display: flex; gap: 14px; color: #c5d0dc; font-size: 12px; }
.legend span { cursor: pointer; }
.legend span.off { opacity: 0.35; }
.legend span::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: #3aa0ff;
}
.legend .out::before { background: #e0a04a; }
.warn-all {
  border: 0;
  padding: 0;
  background: transparent;
  color: #e7c98a;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.warn-all:hover { color: #f0d090; }
.warns {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 0 8px;
  overflow: hidden;
}
.warn-empty {
  margin: 0;
  padding: 24px 12px;
  color: #8ea0b5;
  font-size: 13px;
  text-align: center;
}
.warns-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  mask-image: linear-gradient(180deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
}
.warns-track {
  list-style: none;
  margin: 0;
  padding: 0 10px;
  animation-name: warnScroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.warns:hover .warns-track { animation-play-state: paused; }
@keyframes warnScroll {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}
.warns-track li {
  display: grid;
  grid-template-columns: 8px 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 8px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
}
.warns-track li:hover { background: rgba(231, 201, 138, 0.06); }
.warns i {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
}
.warns i.red { background: #e15b54; box-shadow: 0 0 8px rgba(225, 91, 84, 0.65); }
.warns i.orange { background: #e08a3a; box-shadow: 0 0 8px rgba(224, 138, 58, 0.55); }
.warns i.yellow { background: #e0c15a; box-shadow: 0 0 8px rgba(224, 193, 90, 0.45); }
.warns b { display: block; font-size: 13px; color: #f3f7fb; font-weight: 600; }
.warns span {
  display: block;
  margin-top: 2px;
  color: #8ea0b5;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warns time { color: #8ea0b5; font-size: 11px; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .warns-track { animation: none; }
  .warns-viewport { overflow: auto; }
}

.logs {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(16, 22, 32, .92);
  border: 1px solid rgba(214, 176, 106, .28);
}
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
.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #3d8bff;
  font-size: 13px;
  letter-spacing: 1px;
}
.logs-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 0 8px;
  overflow: hidden;
}
.logs-empty {
  margin: 0;
  padding: 20px 12px;
  color: #8ea0b5;
  font-size: 13px;
  text-align: center;
}
.logs-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  mask-image: linear-gradient(180deg, transparent 0%, #000 6%, #000 94%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 6%, #000 94%, transparent 100%);
}
.logs-track {
  list-style: none;
  margin: 0;
  padding: 0 10px;
  animation-name: logScroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.logs:hover .logs-track { animation-play-state: paused; }
@keyframes logScroll {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}
.logs-track li {
  display: grid;
  grid-template-columns: 108px 36px 1fr;
  gap: 6px;
  align-items: center;
  height: 30px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}
.logs-track li.alt { background: rgba(255, 255, 255, 0.03); }
.logs-track time {
  color: #9aa8b8;
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.logs-track em {
  font-style: normal;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}
.logs-track span {
  color: #d5e0ec;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
@media (prefers-reduced-motion: reduce) {
  .logs-track { animation: none; }
  .logs-viewport { overflow: auto; }
}
</style>
