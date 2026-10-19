<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { authApi, dashboardApi } from '@/api'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import { useAuthStore } from '@/stores/auth'
import PulseDot from '@/components/PulseDot.vue'
import YardBoard from '@/components/YardBoard.vue'

interface LogItem { type: string; text: string; time: string }
interface UsageItem { name: string; rate: number }
interface TrendItem { day: string; inWet: number; outWet: number }
interface WarnItem { title: string; detail: string; time: string; link: string; tone?: string }

const router = useRouter()
const auth = useAuthStore()
const passwordOpen = ref(false)
const boardRef = ref<HTMLElement>()
const barRef = ref<HTMLElement>()
const lineRef = ref<HTMLElement>()
const kpi = ref({ rawWet: 0, rawDry: 0, fgWet: 0, fgDry: 0, inboundToday: 0, outboundToday: 0, pendingQc: 0, alerts: 0 })
const production = ref({ batchNo: '', total: 0, date: '', eta: '' })
const logs = ref<LogItem[]>([])
const usage = ref<UsageItem[]>([])
const trend = ref<TrendItem[]>([])
const warnings = ref<WarnItem[]>([])
let barChart: echarts.ECharts | null = null
let lineChart: echarts.ECharts | null = null

const tagColor: Record<string, string> = {
  生产: '#3d8bff',
  称重: '#3dbe8c',
  上架: '#e08a3a',
  完工: '#3ec6d4',
  入仓: '#5b8def',
  出仓: '#e0b15a',
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

const showIn = ref(true)
const showOut = ref(true)

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
      legend: { show: false, data: ['入库湿吨', '出库湿吨'] },
      tooltip: {
        ...tooltipBase(),
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(231, 201, 138, 0.45)' } },
        formatter: (items: { axisValueLabel?: string; marker?: string; seriesName?: string; value?: number }[]) => {
          const list = Array.isArray(items) ? items : [items]
          const title = list[0]?.axisValueLabel || ''
          const rows = list.map((item) => `${item.marker || ''}${item.seriesName} ${item.value ?? 0} 湿吨`)
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
        max: 200,
        interval: 50,
        axisLabel: label,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: split,
      },
      series: [
        {
          name: '入库湿吨',
          type: 'line',
          smooth: 0.45,
          symbol: 'circle',
          symbolSize: 7,
          showSymbol: false,
          triggerLineEvent: true,
          cursor: 'pointer',
          data: trend.value.map((item) => item.inWet),
          lineStyle: { color: '#3aa0ff', width: 2 },
          itemStyle: { color: '#3aa0ff' },
          areaStyle: { color: area('rgba(58, 160, 255, 0.55)') },
          emphasis: { focus: 'series', scale: true },
        },
        {
          name: '出库湿吨',
          type: 'line',
          smooth: 0.45,
          symbol: 'circle',
          symbolSize: 7,
          showSymbol: false,
          triggerLineEvent: true,
          cursor: 'pointer',
          data: trend.value.map((item) => item.outWet),
          lineStyle: { color: '#e0a04a', width: 2 },
          itemStyle: { color: '#e0a04a' },
          areaStyle: { color: area('rgba(224, 160, 74, 0.5)') },
          emphasis: { focus: 'series', scale: true },
        },
      ],
    })
    lineChart.on('click', (params) => {
      router.push(params.seriesName === '出库湿吨' ? '/outbound' : '/inbound')
    })
  }
}

function toggleSeries(name: '入库湿吨' | '出库湿吨') {
  if (name === '入库湿吨') showIn.value = !showIn.value
  else showOut.value = !showOut.value
  lineChart?.dispatchAction({ type: 'legendToggleSelect', name })
}

onMounted(async () => {
  const res = await dashboardApi.cockpit()
  const data = res.data as {
    kpi: typeof kpi.value
    production: typeof production.value
    logs: LogItem[]
    usage: UsageItem[]
    trend: TrendItem[]
    warnings: WarnItem[]
  } | null
  if (res.success && data) {
    kpi.value = data.kpi
    production.value = data.production
    logs.value = data.logs
    usage.value = data.usage
    trend.value = data.trend
    warnings.value = data.warnings
  }
  await nextTick()
  renderCharts()
  observer = new ResizeObserver(() => resizeCharts())
  if (boardRef.value) observer.observe(boardRef.value)
})

onActivated(() => {
  nextTick(() => resizeCharts())
})

onBeforeUnmount(() => {
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
          <p>BONDED WMS · 关务监管</p>
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
        <article><b>{{ num(kpi.fgDry) }}</b><span>原料干吨</span></article>
      </section>

      <YardBoard />
      </div>

      <div class="side-col">
      <section class="hero">
        <img src="/factory.png" alt="生产现场" />
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
        <ul>
          <li v-for="(item, index) in logs" :key="item.type" :class="{ alt: index % 2 === 1 }">
            <em :style="{ color: tagColor[item.type] }">{{ item.type }}</em>
            <span>{{ item.text }}</span>
            <time>{{ item.time }}</time>
          </li>
        </ul>
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
            <h3><PulseDot />近七日入出库趋势</h3>
            <div class="legend">
              <span class="in" :class="{ off: !showIn }" @click="toggleSeries('入库湿吨')">入库湿吨</span>
              <span class="out" :class="{ off: !showOut }" @click="toggleSeries('出库湿吨')">出库湿吨</span>
            </div>
          </div>
          <div ref="lineRef" class="chart" />
        </article>
        <article class="chart-card">
          <div class="card-head"><h3><PulseDot />预警</h3></div>
          <ul class="warns">
            <li v-for="(item, index) in warnings" :key="index" @click="router.push(item.link)">
              <i :class="item.tone || 'red'" />
              <div>
                <b>{{ item.title }}</b>
                <span>{{ item.detail }}</span>
              </div>
              <time>{{ item.time }}</time>
            </li>
          </ul>
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
.head p { margin: 4px 0 0; color: rgba(255,255,255,.55); font-size: 13px; letter-spacing: .6px; }
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
.hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
.warns { list-style: none; margin: 0; padding: 0 12px; flex: 1; min-height: 0; overflow: auto; }
.warns li {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 8px;
  align-items: center;
  height: 56px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  cursor: pointer;
}
.warns i { width: 8px; height: 8px; border-radius: 50%; }
.warns i.red { background: #e15b54; }
.warns i.orange { background: #e08a3a; }
.warns i.yellow { background: #e0c15a; }
.warns b { display: block; font-size: 13px; color: #f3f7fb; font-weight: 600; }
.warns span, .warns time { color: #8ea0b5; font-size: 12px; }

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
.logs ul { list-style: none; margin: 0; padding: 0 8px 8px; flex: 1; min-height: 0; overflow: auto; }
.logs li {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 8px;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  font-size: 13px;
}
.logs li.alt { background: rgba(255,255,255,.03); }
.logs em { font-style: normal; font-weight: 600; }
.logs span { color: #d5e0ec; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.logs time { color: #9aa8b8; font-size: 12px; }
</style>
