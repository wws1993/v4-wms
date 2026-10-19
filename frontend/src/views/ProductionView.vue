<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { inventoryApi, partnerApi, productionApi, warehouseApi } from '@/api'
import { usePageTab } from '@/hooks/pageTab'

type Line = {
  inventoryId: string
  customsNo: string
  consignor: string
  consignorId: string
  cargoType: string
  material: string
  voyage: string
  blNo: string
  originCountry: string
  wet: number
  dry: number
  feedDry: number
  stack: string
  areaLabel: string
  outCustomsNo: string
}

type Doc = Record<string, unknown>

const route = useRoute()
const tab = usePageTab('feed', ['feed', 'finish', 'ledger'])
const filters = reactive({ consignor: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const docs = ref<Doc[]>([])
const stacks = ref<Doc[]>([])
const feedLots = ref<Doc[]>([])
const feedTotal = ref(0)
const feedPage = ref(1)
const feedPageSize = ref(10)
const feedLoading = ref(false)
const feedQueried = ref(false)
const feedCountries = ref<string[]>([])
const lotCache = ref<Record<string, Doc>>({})
const loading = ref(false)
const feedOpen = ref(false)
const processOpen = ref(false)
const finishOpen = ref(false)
const detailOpen = ref(false)
const ledgerOpen = ref(false)
const ledgerDate = ref('')
const detailBatch = ref('')
const feed = reactive({ prodBatch: '', keyword: '', cargoType: '', country: '', stack: '' })
const feedPicked = ref<Record<string, string>>({})
const process = reactive({ id: '', orderNo: '', locked: false, consignor: '', prodBatch: '', process: '混矿筛分', from: '', to: '', remark: '' })
const finish = reactive({ id: '', orderNo: '', locked: false, consignor: '', prodBatch: '', outputDry: '', stackCode: '', areaId: '', warehouseId: '' })

function linesOf(row: Doc): Line[] {
  if (!Array.isArray(row.feedLines)) return []
  return row.feedLines as Line[]
}

function amountOf(line: { feedDry?: number; dry?: number }) {
  return Number(line.feedDry ?? line.dry ?? 0)
}

function num(value: unknown) {
  const n = Number(value || 0)
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function clock(value: unknown) {
  return String(value || '').slice(11, 16)
}

function customsText(lines: Line[]) {
  if (!lines.length) return '—'
  if (lines.length === 1) return lines[0].customsNo
  return `${lines[0].customsNo} 等 ${lines.length} 票`
}

function stackText(lines: Line[]) {
  const names = [...new Set(lines.map((line) => line.stack).filter(Boolean))]
  return names.join(' / ') || '—'
}

function lotKey(row: Doc) {
  return String(row.inventoryId || row.id || row.batchNo)
}

function availableOf(row: Doc) {
  const remain = Number(row.remain)
  if (!Number.isFinite(remain)) return 0
  return Math.max(0, Math.round(remain * 1000) / 1000)
}

const batchOptions = computed(() => [...new Set(docs.value.map((row) => String(row.prodBatch || '')).filter(Boolean))])
const pickedLots = computed(() => Object.keys(feedPicked.value).map((key) => lotCache.value[key]).filter((row): row is Doc => Boolean(row)))
const feedConsignors = computed(() => [...new Set(pickedLots.value.map((row) => String(row.consignor || '')).filter(Boolean))])
const feedConsignorText = computed(() => feedConsignors.value.join('、'))

function matchesKeyword(row: Doc) {
  const word = filters.keyword.trim()
  if (!word) return true
  const lines = linesOf(row)
  return `${row.orderNo || ''}${row.id || ''}${row.prodBatch || ''}${row.customsNos || ''}${row.outCustomsNo || ''}${lines.map((line) => line.customsNo).join('')}`.includes(word)
}

function batchLines(batch: string) {
  const lines: Line[] = []
  const seen = new Set<string>()
  for (const row of docs.value) {
    if (row.prodBatch !== batch) continue
    if (row.docType !== '投料出库' && row.docType !== '加工过程') continue
    for (const line of linesOf(row)) {
      const key = line.inventoryId || line.customsNo
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      lines.push(line)
    }
  }
  return lines
}

function linesOfOrder(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  const own = linesOf(doc || {})
  if (own.length) return own
  return batchLines(String(doc?.prodBatch || ''))
}

function finishOf(batch: string) {
  return docs.value.find((row) => row.docType === '完工入库' && row.prodBatch === batch)
}

const feedOrders = computed(() => docs.value.filter((row) => row.docType === '投料出库' && !row.finished))
const openOrders = computed(() => docs.value.filter((row) => (row.docType === '投料出库' || row.docType === '加工过程') && !row.finished))

const flatOps = computed(() => {
  const list: Doc[] = []
  for (const row of docs.value) {
    if (row.docType === '加工过程') {
      const lines = linesOf(row).length ? linesOf(row) : batchLines(String(row.prodBatch))
      list.push({
        ...row,
        type: '加工过程',
        lead: true,
        canProcess: false,
        canFinish: !row.finished,
        customs: customsText(lines),
        outCustoms: row.outCustomsNo || '—',
        kind: row.process,
        qty: `${clock(row.time)}–${clock(row.timeTo)}`,
        stack: stackText(lines),
      })
    }
    if (row.docType === '投料出库') {
      const lines = linesOf(row)
      const source = lines.length ? lines : [{ customsNo: '—', cargoType: '', wet: 0, feedDry: 0, stack: '', outCustomsNo: '' } as Line]
      source.forEach((line, index) => {
        list.push({
          ...row,
          type: '投料出库',
          lead: index === 0,
          canProcess: index === 0 && !row.finished,
          canFinish: index === 0 && !row.finished,
          consignor: line.consignor || row.consignor,
          customs: line.customsNo,
          outCustoms: line.outCustomsNo || row.outCustomsNo || '—',
          kind: line.cargoType,
          qty: lines.length ? `${num(line.wet)} / ${num(line.feedDry)} 干吨` : '—',
          stack: line.stack,
        })
      })
    }
  }
  return list
})

const opsRows = computed(() => flatOps.value.filter((row) => {
  if (filters.consignor && row.consignor !== filters.consignor) return false
  if (!matchesKeyword(row)) return false
  const day = String(row.time || '').slice(0, 10)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  return true
}))

const finishRows = computed(() => docs.value.filter((row) => row.docType === '完工入库' && matchesKeyword(row)))
const inspectStacks = computed(() => stacks.value.filter((row) => row.areaLabel === '待检区'))
const detailLines = computed(() => batchLines(detailBatch.value))
const detailFinish = computed(() => finishOf(detailBatch.value))
const processLines = computed(() => linesOfOrder(process.id))
const finishLines = computed(() => linesOfOrder(finish.id))
const finishCustoms = computed(() => customsText(finishLines.value))

const ledgerRows = computed(() => {
  const map = new Map<string, { date: string; consume: number; output: number; orders: Set<string> }>()
  for (const row of docs.value) {
    const date = String(row.time || '').slice(0, 10) || '—'
    const item = map.get(date) || { date, consume: 0, output: 0, orders: new Set<string>() }
    if (row.docType === '投料出库' || (row.docType === '加工过程' && !docs.value.some((other) => other.docType === '投料出库' && other.prodBatch === row.prodBatch))) {
      item.consume += linesOf(row).reduce((sum, line) => sum + amountOf(line), 0)
      if (row.workOrder) item.orders.add(String(row.workOrder))
    }
    if (row.docType === '加工过程' && row.workOrder) item.orders.add(String(row.workOrder))
    if (row.docType === '完工入库') item.output += Number(row.outputDry || 0)
    map.set(date, item)
  }
  return [...map.values()].map((item) => ({ date: item.date, consume: item.consume, output: item.output, orders: item.orders.size }))
})

const ledgerDetails = computed(() => flatOps.value.filter((row) => String(row.time || '').slice(0, 10) === ledgerDate.value))

function outCustoms(line: Line) {
  if (line.outCustomsNo) return line.outCustomsNo
  const doc = docs.value.find((row) => row.docType === '投料出库' && row.prodBatch === detailBatch.value && linesOf(row).some((item) => item.customsNo === line.customsNo))
  return String(doc?.outCustomsNo || '—')
}

function areaOf(code: unknown, fallback: unknown) {
  const stack = stacks.value.find((item) => item.code === code)
  return String(stack?.areaLabel || fallback || '—')
}

function cargoTag(type: unknown) {
  return type === '报备矿' ? 'warning' : 'success'
}

function areaTag(area: unknown) {
  if (area === '待检区') return 'warning'
  if (area === '成品区') return 'success'
  return 'primary'
}

function feedOver(key: string, row: Doc) {
  const amount = Number(feedPicked.value[key] || 0)
  return feedPicked.value[key] != null && (!(amount > 0) || amount > availableOf(row))
}

function orderLabel(row: Doc) {
  return `${row.orderNo || row.id} · ${row.prodBatch || ''}`
}

function listKind() {
  return tab.value === 'finish' ? 2 : 1
}

async function load(kind = listKind()) {
  loading.value = true
  const res = await productionApi.list({
    page: 1,
    pageSize: 200,
    type: kind,
    consignor: filters.consignor || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  })
  loading.value = false
  if (!res.success || !res.data) {
    if (!res.success) ElMessage.error(res.message)
    return false
  }
  const incoming = res.data.list
  if (kind === 2) docs.value = [...docs.value.filter((row) => row.docType !== '完工入库'), ...incoming]
  else docs.value = [...incoming.filter((row) => row.docType !== '完工入库'), ...docs.value.filter((row) => row.docType === '完工入库')]
  return true
}

function applyKeyword() {
  if (route.name !== 'production') return false
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (filters.keyword === keyword) return false
  filters.keyword = keyword
  return true
}

watch(() => route.query.keyword, () => {
  applyKeyword()
})

watch(tab, (name, previous) => {
  if (!previous || name === previous) return
  const next = name === 'finish' ? 2 : 1
  const prev = previous === 'finish' ? 2 : 1
  if (next !== prev) load(next)
})

onActivated(() => {
  applyKeyword()
})

onMounted(async () => {
  const [who, stackRes] = await Promise.all([
    partnerApi.consignors(),
    warehouseApi.stacks({ page: 1, pageSize: 200 }),
  ])
  if (who.success && Array.isArray(who.data) && who.data.length) consignors.value = who.data
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  await load()
  if (!consignors.value.length) {
    consignors.value = [...new Set(docs.value.map((row) => String(row.consignor || '')).filter(Boolean))]
  }
})

async function search() {
  if (filters.from && filters.to && filters.from > filters.to) {
    ElMessage.warning('开始日期不能晚于结束日期')
    return
  }
  const done = await load()
  if (!done) return
  if (tab.value === 'finish') {
    ElMessage.success(finishRows.value.length ? `已查询，共 ${finishRows.value.length} 条` : '该条件下暂无完工记录')
    return
  }
  ElMessage.success(opsRows.value.length ? `已查询，共 ${opsRows.value.length} 条` : '该条件下暂无投料或加工记录')
}

function onFeedCheck(row: Doc, on: unknown) {
  const key = lotKey(row)
  const left = availableOf(row)
  if (on && left <= 0) {
    ElMessage.warning(`报关单 ${row.batchNo} 剩余干吨为 0`)
    return
  }
  lotCache.value = { ...lotCache.value, [key]: row }
  if (on) feedPicked.value = { ...feedPicked.value, [key]: String(left) }
  else {
    const next = { ...feedPicked.value }
    delete next[key]
    feedPicked.value = next
  }
}

function openFeed() {
  Object.assign(feed, { prodBatch: '', keyword: '', cargoType: '', country: '', stack: '' })
  feedPicked.value = {}
  lotCache.value = {}
  feedLots.value = []
  feedTotal.value = 0
  feedPage.value = 1
  feedCountries.value = []
  feedOpen.value = true
  searchLots()
}

function resetFeedFilter() {
  Object.assign(feed, { keyword: '', cargoType: '', country: '', stack: '' })
  if (feedPage.value !== 1) {
    feedPage.value = 1
    return
  }
  searchLots()
}

async function searchLots() {
  feedLoading.value = true
  feedQueried.value = true
  const res = await inventoryApi.list({
    page: feedPage.value,
    pageSize: feedPageSize.value,
    status: '在库',
    kind: '原料',
    keyword: feed.keyword || undefined,
    cargoType: feed.cargoType || undefined,
    originCountry: feed.country || undefined,
    stack: feed.stack || undefined,
  })
  feedLoading.value = false
  if (!res.success || !res.data) {
    feedLots.value = []
    feedTotal.value = 0
    if (!res.success) ElMessage.error(res.message)
    return
  }
  const rows = res.data.list.filter((row) => row.status === '在库' && row.batchKind === '报关单号' && row.cargoType !== '混成品')
  feedLots.value = rows
  feedTotal.value = Number(res.data.total || 0)
  const seen = new Set(feedCountries.value)
  rows.forEach((row) => {
    const name = String(row.originCountry || '')
    if (name && name !== '—') seen.add(name)
    lotCache.value[lotKey(row)] = row
  })
  feedCountries.value = [...seen]
}

function queryLots() {
  if (feedPage.value !== 1) {
    feedPage.value = 1
    return
  }
  searchLots()
}

function onFeedPage() {
  if (feedQueried.value) searchLots()
}

function onFeedSize() {
  if (!feedQueried.value) return
  if (feedPage.value !== 1) feedPage.value = 1
  else searchLots()
}

function lotLine(row: Doc, feedDry: number): Line {
  return {
    inventoryId: lotKey(row),
    customsNo: String(row.batchNo),
    consignor: String(row.consignor || ''),
    consignorId: String(row.consignorId || ''),
    cargoType: String(row.cargoType || ''),
    material: String(row.material || ''),
    voyage: String(row.shipName || ''),
    blNo: String(row.blNo || ''),
    originCountry: String(row.originCountry || ''),
    wet: Number(row.wet || 0),
    dry: Number(row.dry || 0),
    feedDry,
    stack: String(row.stackText || ''),
    areaLabel: String(row.areaLabel || ''),
    outCustomsNo: '',
  }
}

async function saveFeed() {
  const keys = Object.keys(feedPicked.value)
  if (!feed.prodBatch || !keys.length) {
    ElMessage.warning('请填写生产批次，并勾选报关单')
    return
  }
  const lines = keys.map((key) => {
    const lot = lotCache.value[key]
    return lotLine(lot || { batchNo: key, inventoryId: key }, Number(feedPicked.value[key] || 0))
  })
  const over = lines.find((line) => {
    const lot = lotCache.value[line.inventoryId]
    return !(line.feedDry > 0) || !lot || line.feedDry > availableOf(lot)
  })
  if (over) {
    const lot = lotCache.value[over.inventoryId]
    const left = lot ? availableOf(lot) : 0
    ElMessage.warning(over.feedDry > 0 ? `报关单 ${over.customsNo} 本次 ${over.feedDry} 吨，剩余 ${left} 吨` : `报关单 ${over.customsNo} 投料干吨须大于 0`)
    return
  }
  const consignorIds = [...new Set(lines.map((line) => line.consignorId).filter(Boolean))]
  const res = await productionApi.create({ prodBatch: feed.prodBatch, consignorId: consignorIds.join(','), feedLines: lines })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  feedOpen.value = false
  await load()
}

function fillProcess(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  process.id = id
  process.orderNo = String(doc?.orderNo || '')
  process.consignor = String(doc?.consignor || '')
  process.prodBatch = String(doc?.prodBatch || '')
  process.process = '混矿筛分'
  process.from = ''
  process.to = ''
  process.remark = ''
}

function openProcess(row?: Doc) {
  const target = row?.id ? row : feedOrders.value[0]
  if (!target) {
    ElMessage.warning('没有可登记加工的投料单')
    return
  }
  process.locked = Boolean(row?.id)
  fillProcess(String(target.id))
  processOpen.value = true
}

async function saveProcess() {
  if (!process.id || !process.process) {
    ElMessage.warning('请选择投料单并填写工序')
    return
  }
  if (process.from && process.to && process.from > process.to) {
    ElMessage.warning('开始时间不能晚于结束时间')
    return
  }
  const res = await productionApi.process(process.id, {
    process: process.process,
    time: process.from,
    timeTo: process.to,
    remark: process.remark,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  processOpen.value = false
  load()
}

function pickStack(code: string) {
  const stack = inspectStacks.value.find((item) => String(item.code) === code)
  finish.stackCode = code
  finish.areaId = stack ? String(stack.id) : ''
  finish.warehouseId = stack ? String(stack.warehouseId || '') : ''
}

function fillFinish(id: string) {
  const doc = docs.value.find((row) => String(row.id) === id)
  finish.id = id
  finish.orderNo = String(doc?.orderNo || '')
  finish.consignor = String(doc?.consignor || '')
  finish.prodBatch = String(doc?.prodBatch || '')
  finish.outputDry = ''
  pickStack(inspectStacks.value[0] ? String(inspectStacks.value[0].code) : '')
}

function openFinish(row?: Doc) {
  const target = row?.id ? row : openOrders.value[0]
  if (!target) {
    ElMessage.warning('没有待完工的生产单')
    return
  }
  finish.locked = Boolean(row?.id)
  fillFinish(String(target.id))
  finishOpen.value = true
}

async function saveFinish() {
  if (!finish.id || !finish.stackCode || !(Number(finish.outputDry) > 0)) {
    ElMessage.warning('请选择生产单、产量和待检区堆位')
    return
  }
  const res = await productionApi.finish(finish.id, {
    outputDry: Number(finish.outputDry),
    stackCode: finish.stackCode,
    areaId: finish.areaId,
    warehouseId: finish.warehouseId,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  finishOpen.value = false
  load()
}

async function openDetail(batch: unknown) {
  const name = String(batch || '')
  detailBatch.value = name
  detailOpen.value = true
  if (!name) return
  const res = await productionApi.detail(name)
  if (!res.success || !res.data || !Array.isArray(res.data.list) || !res.data.list.length) return
  const extra = (res.data.list as Doc[]).map((row) => {
    if (linesOf(row).length) return row
    const local = docs.value.find((item) => String(item.id) === String(row.id))
    if (!local || !linesOf(local).length) return row
    return { ...row, feedLines: local.feedLines, customsNos: local.customsNos, sourceStacks: local.sourceStacks, outCustomsNo: local.outCustomsNo }
  })
  docs.value = [...docs.value.filter((row) => row.prodBatch !== name), ...extra]
}

function openLedger(date: string) {
  ledgerDate.value = date
  ledgerOpen.value = true
}
</script>

<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="投料/加工" name="feed">
        <div class="toolbar">
          <el-button type="primary" @click="openFeed">新建投料单</el-button>
          <el-button @click="openProcess()">登记加工过程</el-button>
        </div>
        <el-form :inline="true">
          <el-form-item label="单号">
            <el-input v-model="filters.keyword" clearable placeholder="生产批次 / 报关单" style="width: 180px" />
          </el-form-item>
          <el-form-item label="委托方">
            <el-select v-model="filters.consignor" clearable placeholder="全部" style="width: 140px">
              <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" />
            <span class="sep">至</span>
            <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="search">查询</el-button></el-form-item>
        </el-form>
        <el-table v-loading="loading" :data="opsRows" border stripe>
          <el-table-column label="类型" width="100">
            <template #default="{ row }"><el-tag :type="row.type === '加工过程' ? 'primary' : 'success'" effect="plain">{{ row.type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="orderNo" label="单号" width="150" />
          <el-table-column label="委托方" width="110">
            <template #default="{ row }"><el-tag effect="plain">{{ row.consignor }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="prodBatch" label="生产批次" width="130" />
          <el-table-column prop="customs" label="报关单号" min-width="180" />
          <el-table-column prop="outCustoms" label="出库报关单号" min-width="160" />
          <el-table-column label="货物类型/工序" width="130">
            <template #default="{ row }">
              <el-tag v-if="row.type === '投料出库'" :type="cargoTag(row.kind)" effect="plain">{{ row.kind }}</el-tag>
              <el-tag v-else type="info" effect="plain">{{ row.kind }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="qty" label="数量" min-width="140" />
          <el-table-column prop="stack" label="堆放堆位" min-width="140" />
          <el-table-column prop="workOrder" label="生产工单" width="150" />
          <el-table-column prop="time" label="时间" min-width="150" />
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button v-if="row.canProcess" link type="primary" @click="openProcess(row)">登记加工</el-button>
              <el-button v-if="row.canFinish" link type="primary" @click="openFinish(row)">完工入库</el-button>
              <el-button link type="primary" @click="openDetail(row.prodBatch)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p class="count">共 {{ opsRows.length }} 条</p>
      </el-tab-pane>

      <el-tab-pane label="完工入库" name="finish">
        <div class="toolbar"><el-button type="primary" @click="openFinish()">成品完工入库</el-button></div>
        <el-table :data="finishRows" border stripe>
          <el-table-column prop="orderNo" label="完工单号" width="150" />
          <el-table-column label="委托方" width="110">
            <template #default="{ row }"><el-tag effect="plain">{{ row.consignor }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="prodBatch" label="生产批次" width="130" />
          <el-table-column prop="product" label="成品" width="130" />
          <el-table-column prop="outputDry" label="产量(干吨)" width="110" />
          <el-table-column prop="customsNos" label="关联报关单号" min-width="180" />
          <el-table-column prop="sourceStacks" label="原料堆放堆位" min-width="150" />
          <el-table-column prop="stackCode" label="目标堆位" width="100" />
          <el-table-column label="片区标识" width="100">
            <template #default="{ row }"><el-tag :type="areaTag(areaOf(row.stackCode, row.areaLabel))" effect="plain">{{ areaOf(row.stackCode, row.areaLabel) }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="time" label="时间" min-width="150" />
          <el-table-column label="操作" width="80">
            <template #default="{ row }"><el-button link type="primary" @click="openDetail(row.prodBatch)">详情</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="消耗产出台账" name="ledger">
        <el-table :data="ledgerRows" border>
          <el-table-column prop="date" label="日期" />
          <el-table-column prop="consume" label="原料消耗(干吨)" />
          <el-table-column prop="output" label="成品产出(干吨)" />
          <el-table-column prop="orders" label="工单数" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }"><el-button link type="primary" @click="openLedger(row.date)">明细</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="feedOpen" title="原料投料出库" width="1280px" align-center>
      <p class="hint">同一生产批次可勾选多个报关单。本次干吨不能超过剩余干吨。委托方随勾选票带出。</p>
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="生产批次" required><el-select v-model="feed.prodBatch" filterable allow-create default-first-option placeholder="新建或选择已有批次"><el-option v-for="name in batchOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="feedConsignorText" disabled placeholder="勾选报关单后带出" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="已选报关单"><el-input :model-value="`${Object.keys(feedPicked).length} 票`" disabled /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">勾选投料报关单（可多选）</div>
      <el-form :inline="true" @submit.prevent="queryLots">
        <el-form-item label="报关单号"><el-input v-model="feed.keyword" clearable placeholder="报关单号" @keyup.enter="queryLots" /></el-form-item>
        <el-form-item label="货物类型">
          <el-select v-model="feed.cargoType" clearable placeholder="全部货物类型" style="width: 140px">
            <el-option label="达标矿" value="达标矿" /><el-option label="报备矿" value="报备矿" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源国家">
          <el-select v-model="feed.country" clearable filterable allow-create default-first-option placeholder="全部国家" style="width: 140px">
            <el-option v-for="name in feedCountries" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="堆放堆位"><el-input v-model="feed.stack" clearable placeholder="如 1#A1" @keyup.enter="queryLots" /></el-form-item>
        <el-form-item><el-button type="primary" @click="queryLots">查询</el-button></el-form-item>
        <el-form-item><el-button @click="resetFeedFilter">重置</el-button></el-form-item>
      </el-form>
      <el-table v-loading="feedLoading" :data="feedLots" border max-height="360" empty-text="暂无在库报关单">
        <el-table-column label="选择" width="70">
          <template #default="{ row }"><el-checkbox :model-value="feedPicked[lotKey(row)] != null" @change="onFeedCheck(row, $event)" /></template>
        </el-table-column>
        <el-table-column prop="batchNo" label="报关单号" min-width="160" />
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="originCountry" label="来源国家" width="100" />
        <el-table-column prop="stackText" label="堆放堆位" width="100" />
        <el-table-column label="剩余干重(吨)" width="120"><template #default="{ row }">{{ num(availableOf(row)) }}</template></el-table-column>
        <el-table-column label="本次投料干重" width="140">
          <template #default="{ row }"><el-input v-if="feedPicked[lotKey(row)] != null" v-model="feedPicked[lotKey(row)]" size="small" :class="{ over: feedOver(lotKey(row), row) }" /></template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="feedPage"
          v-model:page-size="feedPageSize"
          :total="feedTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="onFeedPage"
          @size-change="onFeedSize"
        />
      </div>
      <template #footer>
        <el-button @click="feedOpen = false">取消</el-button>
        <el-button type="primary" @click="saveFeed">确认投料</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="processOpen" title="生产加工过程登记" width="980px" align-center>
      <el-row :gutter="16">
        <el-col v-if="process.locked" :span="12"><el-form-item label="生产单"><el-input :model-value="process.orderNo" readonly /></el-form-item></el-col>
        <el-col v-else :span="12">
          <el-form-item label="生产单" required>
            <el-select v-model="process.id" @change="fillProcess(String($event))">
              <el-option v-for="item in feedOrders" :key="String(item.id)" :label="orderLabel(item)" :value="String(item.id)" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="process.consignor" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="process.prodBatch" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="工序" required><el-input v-model="process.process" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="开始时间"><el-date-picker v-model="process.from" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="结束时间"><el-date-picker v-model="process.to" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">混矿原料信息</div>
      <el-table :data="processLines" border empty-text="该生产单还没有投料">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="customsNo" label="报关单号" min-width="160" />
        <el-table-column prop="voyage" label="船名/航次" min-width="140" />
        <el-table-column prop="blNo" label="提单号" width="120" />
        <el-table-column prop="originCountry" label="来源国家" width="90" />
        <el-table-column label="湿重(吨)" width="100"><template #default="{ row }">{{ num(row.wet) }}</template></el-table-column>
        <el-table-column label="干重(吨)" width="100"><template #default="{ row }">{{ num(row.dry) }}</template></el-table-column>
        <el-table-column prop="stack" label="堆放堆位" width="90" />
      </el-table>
      <el-form-item label="备注" class="remark"><el-input v-model="process.remark" type="textarea" :rows="3" /></el-form-item>
      <template #footer>
        <el-button @click="processOpen = false">取消</el-button>
        <el-button type="primary" @click="saveProcess">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="finishOpen" title="成品完工入库" width="860px" align-center>
      <p class="hint">目标堆位只显示待检区。查验完成在堆位管理。</p>
      <el-row :gutter="16">
        <el-col v-if="finish.locked" :span="12"><el-form-item label="生产单"><el-input :model-value="finish.orderNo" readonly /></el-form-item></el-col>
        <el-col v-else :span="12">
          <el-form-item label="生产单" required>
            <el-select v-model="finish.id" @change="fillFinish(String($event))">
              <el-option v-for="item in openOrders" :key="String(item.id)" :label="orderLabel(item)" :value="String(item.id)" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="finish.consignor" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="finish.prodBatch" readonly /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="产量(干吨)" required><el-input v-model="finish.outputDry" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="关联报关单号"><el-input :model-value="finishCustoms" readonly /></el-form-item></el-col>
        <el-col :span="12">
          <el-form-item label="目标堆位" required>
            <el-select :model-value="finish.stackCode" @change="pickStack(String($event))">
              <el-option v-for="item in inspectStacks" :key="String(item.id)" :label="`${item.code}（${item.warehouse} / 待检区）`" :value="String(item.code)" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <div class="panel-title">关联报关单矿物</div>
      <el-table :data="finishLines" border empty-text="未匹配到投料报关单">
        <el-table-column prop="customsNo" label="报关单号" min-width="160" />
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column label="投料干重(吨)" width="120"><template #default="{ row }">{{ num(row.feedDry) }}</template></el-table-column>
        <el-table-column prop="stack" label="原堆放堆位" width="110" />
        <el-table-column label="片区标识" width="100"><template #default="{ row }"><el-tag :type="areaTag(row.areaLabel)" effect="plain">{{ row.areaLabel }}</el-tag></template></el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="finishOpen = false">取消</el-button>
        <el-button type="primary" @click="saveFinish">完工入库</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" :title="`生产批次详情 · ${detailBatch}`" width="1100px" align-center>
      <div class="panel-title">关联报关单号（{{ detailLines.length }} 票）</div>
      <el-table :data="detailLines" border empty-text="该批次还没有投料">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="customsNo" label="报关单号" min-width="150" />
        <el-table-column label="出库报关单号" min-width="150"><template #default="{ row }">{{ outCustoms(row) }}</template></el-table-column>
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column label="货物类型" width="90"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="material" label="物料" width="90" />
        <el-table-column prop="voyage" label="船名/航次" min-width="140" />
        <el-table-column prop="blNo" label="提单号" width="110" />
        <el-table-column prop="originCountry" label="来源国家" width="90" />
        <el-table-column label="湿重(吨)" width="90"><template #default="{ row }">{{ num(row.wet) }}</template></el-table-column>
        <el-table-column label="干重(吨)" width="90"><template #default="{ row }">{{ num(row.dry) }}</template></el-table-column>
        <el-table-column prop="stack" label="堆放堆位" width="90" />
        <el-table-column label="片区标识" width="90"><template #default="{ row }"><el-tag :type="areaTag(row.areaLabel)" effect="plain">{{ row.areaLabel }}</el-tag></template></el-table-column>
      </el-table>
      <div class="panel-title">完工入库</div>
      <el-descriptions v-if="detailFinish" :column="2" border>
        <el-descriptions-item label="完工单号">{{ detailFinish.orderNo || detailFinish.id }}</el-descriptions-item>
        <el-descriptions-item label="生产批次">{{ detailFinish.prodBatch }}</el-descriptions-item>
        <el-descriptions-item label="目标堆位">{{ detailFinish.stackCode }} · {{ areaOf(detailFinish.stackCode, detailFinish.areaLabel) }}</el-descriptions-item>
        <el-descriptions-item label="投料消耗">{{ num(detailLines.reduce((sum, line) => sum + amountOf(line), 0)) }} 干吨（{{ detailLines.length }} 票报关单）</el-descriptions-item>
      </el-descriptions>
      <p v-else class="hint">尚未完工入库</p>
      <template #footer><el-button @click="detailOpen = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="ledgerOpen" :title="`${ledgerDate} 消耗产出明细`" width="980px" align-center>
      <el-table :data="ledgerDetails" border empty-text="当日没有单据">
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="orderNo" label="单号" width="150" />
        <el-table-column prop="consignor" label="委托方" width="100" />
        <el-table-column prop="prodBatch" label="生产批次" width="130" />
        <el-table-column prop="customs" label="报关单号" min-width="160" />
        <el-table-column prop="kind" label="货物类型/工序" width="120" />
        <el-table-column prop="qty" label="数量" min-width="140" />
        <el-table-column prop="stack" label="堆放堆位" min-width="120" />
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.hint { color: #5a6a7e; margin: 0 0 12px; }
.sep { margin: 0 8px; color: #5a6a7e; }
.count { color: #5a6a7e; margin: 8px 0 0; }
.panel-title { margin: 16px 0 8px; font-weight: 600; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.remark { margin-top: 12px; }
.over :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset; }
:deep(.el-form-item) { margin-bottom: 12px; }
:deep(.el-dialog .el-select), :deep(.el-dialog .el-input), :deep(.el-dialog .el-date-editor.el-input) { width: 100%; }
</style>
