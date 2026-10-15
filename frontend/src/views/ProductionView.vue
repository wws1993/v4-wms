<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { inventoryApi, materialApi, partnerApi, productionApi, warehouseApi } from '@/api'
import { usePageTab } from '@/hooks/pageTab'

type Line = {
  customsNo: string
  consignor: string
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
}

type Doc = Record<string, unknown>

const tab = usePageTab('feed', ['feed', 'finish', 'ledger'])
const filters = reactive({ consignor: '', from: '', to: '' })
const consignors = ref<string[]>([])
const products = ref<string[]>(['铜精矿混成品'])
const docs = ref<Doc[]>([])
const lots = ref<Doc[]>([])
const stacks = ref<Doc[]>([])
const loading = ref(false)
const feedOpen = ref(false)
const processOpen = ref(false)
const finishOpen = ref(false)
const detailOpen = ref(false)
const ledgerOpen = ref(false)
const ledgerDate = ref('')
const detailBatch = ref('')
const feed = reactive({ consignor: '', prodBatch: '', workOrder: '', keyword: '', cargoType: '', country: '', stack: '' })
const feedPicked = ref<Record<string, string>>({})
const process = reactive({ consignor: '', prodBatch: '', process: '混矿筛分', from: '', to: '', remark: '' })
const finish = reactive({ consignor: '', product: '', outputDry: '', prodBatch: '', stackCode: '' })

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

const usedByCustoms = computed(() => {
  const map = new Map<string, number>()
  for (const row of docs.value) {
    if (row.docType && row.docType !== '投料出库') continue
    for (const line of linesOf(row)) {
      map.set(line.customsNo, (map.get(line.customsNo) || 0) + amountOf(line))
    }
  }
  return map
})

function availableOf(row: Doc) {
  const left = Number(row.dry || 0) - (usedByCustoms.value.get(String(row.batchNo)) || 0)
  return Math.max(0, Math.round(left * 1000) / 1000)
}

const rawLots = computed(() => lots.value.filter((row) => row.status === '在库' && row.batchKind === '报关单号' && row.cargoType !== '混成品'))
const feedVisible = computed(() => rawLots.value.filter((row) => {
  if (feed.keyword && !String(row.batchNo).includes(feed.keyword)) return false
  if (feed.cargoType && row.cargoType !== feed.cargoType) return false
  if (feed.country && row.originCountry !== feed.country) return false
  if (feed.stack && !String(row.stackText).toLowerCase().includes(feed.stack.toLowerCase())) return false
  return true
}))
const feedCountries = computed(() => [...new Set(rawLots.value.map((row) => String(row.originCountry || '')).filter(Boolean))])
const batchOptions = computed(() => [...new Set(docs.value.map((row) => String(row.prodBatch || '')).filter(Boolean))])

const flatOps = computed(() => {
  const list: Doc[] = []
  for (const row of docs.value) {
    if (row.docType === '加工过程') {
      const lines = batchLines(String(row.prodBatch))
      list.push({
        ...row,
        type: '加工过程',
        customs: customsText(lines),
        outCustoms: '—',
        kind: row.process,
        qty: `${clock(row.time)}–${clock(row.timeTo)}`,
        stack: stackText(lines),
      })
    }
    if (row.docType === '投料出库') {
      for (const line of linesOf(row)) {
        list.push({
          ...row,
          type: '投料出库',
          consignor: line.consignor || row.consignor,
          customs: line.customsNo,
          outCustoms: row.outCustomsNo || '—',
          kind: line.cargoType,
          qty: `${num(line.wet)} / ${num(line.feedDry)} 干吨`,
          stack: line.stack,
        })
      }
    }
  }
  return list
})

const opsRows = computed(() => flatOps.value.filter((row) => {
    if (filters.consignor && row.consignor !== filters.consignor) return false
    const day = String(row.time || '').slice(0, 10)
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    return true
}))

function batchLines(batch: string) {
  const lines: Line[] = []
  for (const row of docs.value) {
    if (row.docType === '投料出库' && row.prodBatch === batch) lines.push(...linesOf(row))
  }
  return lines
}

function finishOf(batch: string) {
  return docs.value.find((row) => row.docType === '完工入库' && row.prodBatch === batch)
}

const finishRows = computed(() => docs.value.filter((row) => row.docType === '完工入库'))
const pendingBatches = computed(() => batchOptions.value.filter((batch) => batchLines(batch).length && !finishOf(batch)))
const inspectStacks = computed(() => stacks.value.filter((row) => row.areaLabel === '待检区'))
const detailLines = computed(() => batchLines(detailBatch.value))
const detailFinish = computed(() => finishOf(detailBatch.value))
const processLines = computed(() => batchLines(process.prodBatch))
const finishLines = computed(() => batchLines(finish.prodBatch))
const finishCustoms = computed(() => customsText(finishLines.value))

const ledgerRows = computed(() => {
  const map = new Map<string, { date: string; consume: number; output: number; orders: Set<string> }>()
  for (const row of docs.value) {
    const date = String(row.time || '').slice(0, 10) || '—'
    const item = map.get(date) || { date, consume: 0, output: 0, orders: new Set<string>() }
    if (row.docType === '投料出库') {
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

function feedOver(batchNo: string, row: Doc) {
  const amount = Number(feedPicked.value[batchNo] || 0)
  return feedPicked.value[batchNo] != null && (!(amount > 0) || amount > availableOf(row))
}

async function load() {
  loading.value = true
  const res = await productionApi.list({ page: 1, pageSize: 200 })
  loading.value = false
  if (res.success && res.data) docs.value = res.data.list
}

onMounted(async () => {
  const [who, lotRes, stackRes, materialRes] = await Promise.all([
    partnerApi.consignors(),
    inventoryApi.list({ page: 1, pageSize: 200, status: '在库' }),
    warehouseApi.stacks({ page: 1, pageSize: 200 }),
    materialApi.list({ page: 1, pageSize: 100 }),
  ])
  if (who.success && Array.isArray(who.data) && who.data.length) consignors.value = who.data
  if (lotRes.success && lotRes.data) lots.value = lotRes.data.list
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  if (materialRes.success && materialRes.data) {
    const names = materialRes.data.list
      .filter((row) => row.kind === '成品' || row.cargoType === '混成品')
      .map((row) => String(row.name || ''))
      .filter(Boolean)
    if (names.length) products.value = names
  }
  await load()
  if (!consignors.value.length) {
    consignors.value = [...new Set(docs.value.map((row) => String(row.consignor || '')).filter(Boolean))]
  }
})

function search() {
  if (filters.from && filters.to && filters.from > filters.to) {
    ElMessage.warning('开始日期不能晚于结束日期')
    return
  }
  ElMessage.success(opsRows.value.length ? `已查询，共 ${opsRows.value.length} 条` : '该条件下暂无投料或加工记录')
}

function onFeedCheck(row: Doc, on: unknown) {
  const batchNo = String(row.batchNo)
  const left = availableOf(row)
  if (on && left <= 0) {
    ElMessage.warning(`报关单 ${batchNo} 可用干吨为 0`)
    return
  }
  if (on) feedPicked.value = { ...feedPicked.value, [batchNo]: String(left) }
  else {
    const next = { ...feedPicked.value }
    delete next[batchNo]
    feedPicked.value = next
  }
}

function openFeed() {
  Object.assign(feed, { consignor: consignors.value[0] || '', prodBatch: batchOptions.value[0] || '', workOrder: '', keyword: '', cargoType: '', country: '', stack: '' })
  feedPicked.value = {}
  feedOpen.value = true
}

function resetFeedFilter() {
  Object.assign(feed, { keyword: '', cargoType: '', country: '', stack: '' })
}

function lotLine(row: Doc, feedDry: number): Line {
  return {
    customsNo: String(row.batchNo),
    consignor: String(row.consignor || ''),
    cargoType: String(row.cargoType || ''),
    material: String(row.material || ''),
    voyage: '—',
    blNo: '—',
    originCountry: String(row.originCountry || ''),
    wet: Number(row.wet || 0),
    dry: Number(row.dry || 0),
    feedDry,
    stack: String(row.stackText || ''),
    areaLabel: String(row.areaLabel || ''),
  }
}

async function saveFeed() {
  const nos = Object.keys(feedPicked.value)
  if (!feed.consignor || !feed.prodBatch || !feed.workOrder || !nos.length) {
    ElMessage.warning('请填写委托方、生产批次、生产工单，并勾选报关单')
    return
  }
  const lines = nos.map((customsNo) => {
    const lot = rawLots.value.find((row) => String(row.batchNo) === customsNo)
    return lotLine(lot || { batchNo: customsNo }, Number(feedPicked.value[customsNo] || 0))
  })
  const over = lines.find((line) => {
    const lot = rawLots.value.find((row) => String(row.batchNo) === line.customsNo)
    return !(line.feedDry > 0) || !lot || line.feedDry > availableOf(lot)
  })
  if (over) {
    const lot = rawLots.value.find((row) => String(row.batchNo) === over.customsNo)
    const left = lot ? availableOf(lot) : 0
    ElMessage.warning(over.feedDry > 0 ? `报关单 ${over.customsNo} 本次 ${over.feedDry} 吨，可用 ${left} 吨` : `报关单 ${over.customsNo} 投料干吨须大于 0`)
    return
  }
  const res = await productionApi.create({
    docType: '投料出库', consignor: feed.consignor, prodBatch: feed.prodBatch, workOrder: feed.workOrder, feedLines: lines,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  feedOpen.value = false
  load()
}

function openProcess() {
  Object.assign(process, {
    consignor: consignors.value[0] || '',
    prodBatch: batchOptions.value[0] || '',
    process: '混矿筛分',
    from: '',
    to: '',
    remark: '',
  })
  processOpen.value = true
}

async function saveProcess() {
  if (!process.consignor || !process.prodBatch || !process.process) {
    ElMessage.warning('请填写委托方、生产批次和工序')
    return
  }
  const res = await productionApi.create({
    docType: '加工过程',
    consignor: process.consignor,
    prodBatch: process.prodBatch,
    process: process.process,
    time: process.from,
    timeTo: process.to,
    remark: process.remark,
    workOrder: docs.value.find((row) => row.prodBatch === process.prodBatch)?.workOrder || '',
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  processOpen.value = false
  load()
}

function fillFinish(batch: string) {
  const feedDoc = docs.value.find((row) => row.docType === '投料出库' && row.prodBatch === batch)
  finish.prodBatch = batch
  finish.consignor = String(feedDoc?.consignor || consignors.value[0] || '')
  finish.product = products.value[0] || ''
  finish.outputDry = ''
  finish.stackCode = inspectStacks.value[0] ? String(inspectStacks.value[0].code) : ''
}

function openFinish() {
  fillFinish(pendingBatches.value[0] || '')
  finishOpen.value = true
}

async function saveFinish() {
  if (!finish.consignor || !finish.product || !finish.prodBatch || !finish.stackCode || !(Number(finish.outputDry) > 0)) {
    ElMessage.warning('请填写委托方、成品物料、产量、生产批次和待检区堆位')
    return
  }
  const res = await productionApi.create({
    docType: '完工入库',
    consignor: finish.consignor,
    product: finish.product,
    outputDry: Number(finish.outputDry),
    prodBatch: finish.prodBatch,
    stackCode: finish.stackCode,
    customsNos: finishCustoms.value,
    sourceStacks: stackText(finishLines.value),
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  finishOpen.value = false
  load()
}

function openDetail(batch: unknown) {
  detailBatch.value = String(batch || '')
  detailOpen.value = true
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
          <el-button @click="openProcess">登记加工过程</el-button>
        </div>
        <el-form :inline="true">
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
          <el-table-column prop="id" label="单号" width="150" />
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
          <el-table-column label="操作" width="80">
            <template #default="{ row }"><el-button link type="primary" @click="openDetail(row.prodBatch)">详情</el-button></template>
          </el-table-column>
        </el-table>
        <p class="count">共 {{ opsRows.length }} 条</p>
      </el-tab-pane>

      <el-tab-pane label="完工入库" name="finish">
        <div class="toolbar"><el-button type="primary" @click="openFinish">成品完工入库</el-button></div>
        <el-table :data="finishRows" border stripe>
          <el-table-column prop="id" label="完工单号" width="150" />
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

    <el-dialog v-model="feedOpen" title="原料投料出库" width="980px" align-center>
      <p class="hint">投料挂到生产批次下。同一生产批次可勾选多个报关单号矿物。本次投料干吨不能超过可用干吨。</p>
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="委托方" required><el-select v-model="feed.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次" required><el-select v-model="feed.prodBatch" filterable allow-create default-first-option><el-option v-for="name in batchOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产工单" required><el-input v-model="feed.workOrder" placeholder="如 WO-20260803-01" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="已选报关单"><el-input :model-value="`${Object.keys(feedPicked).length} 票`" readonly /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">勾选投料报关单（可多选）</div>
      <el-form :inline="true">
        <el-form-item label="报关单号"><el-input v-model="feed.keyword" clearable placeholder="报关单号" /></el-form-item>
        <el-form-item label="货物类型">
          <el-select v-model="feed.cargoType" clearable placeholder="全部货物类型" style="width: 140px">
            <el-option label="达标矿" value="达标矿" /><el-option label="报备矿" value="报备矿" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源国家">
          <el-select v-model="feed.country" clearable placeholder="全部国家" style="width: 120px">
            <el-option v-for="name in feedCountries" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item label="堆放堆位"><el-input v-model="feed.stack" clearable placeholder="如 1#A1" /></el-form-item>
        <el-form-item><el-button @click="resetFeedFilter">重置</el-button></el-form-item>
        <el-form-item><span class="hint">显示 {{ feedVisible.length }} / {{ rawLots.length }} 条</span></el-form-item>
      </el-form>
      <el-table :data="feedVisible" border max-height="320">
        <el-table-column label="选择" width="70">
          <template #default="{ row }"><el-checkbox :model-value="feedPicked[String(row.batchNo)] != null" @change="onFeedCheck(row, $event)" /></template>
        </el-table-column>
        <el-table-column prop="batchNo" label="报关单号" min-width="160" />
        <el-table-column label="货物类型" width="100"><template #default="{ row }"><el-tag :type="cargoTag(row.cargoType)" effect="plain">{{ row.cargoType }}</el-tag></template></el-table-column>
        <el-table-column prop="originCountry" label="来源国家" width="100" />
        <el-table-column prop="stackText" label="堆放堆位" width="100" />
        <el-table-column label="可投干重(吨)" width="120"><template #default="{ row }">{{ num(availableOf(row)) }}</template></el-table-column>
        <el-table-column label="本次投料干重" width="140">
          <template #default="{ row }"><el-input v-if="feedPicked[String(row.batchNo)] != null" v-model="feedPicked[String(row.batchNo)]" size="small" :class="{ over: feedOver(String(row.batchNo), row) }" /></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="feedOpen = false">取消</el-button>
        <el-button type="primary" @click="saveFeed">确认投料</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="processOpen" title="生产加工过程登记" width="980px" align-center>
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="委托方" required><el-select v-model="process.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="生产批次" required><el-select v-model="process.prodBatch" filterable allow-create default-first-option><el-option v-for="name in batchOptions" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="工序" required><el-input v-model="process.process" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="开始时间"><el-date-picker v-model="process.from" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="结束时间"><el-date-picker v-model="process.to" type="datetime" value-format="YYYY-MM-DD HH:mm" /></el-form-item></el-col>
      </el-row>
      <div class="panel-title">混矿原料信息</div>
      <el-table :data="processLines" border empty-text="该生产批次还没有投料">
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
      <p class="hint">完工入库目标堆位仅限待检区。检验完成后在堆位管理点击查验完成，片区标识改为成品区。</p>
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="委托方" required><el-select v-model="finish.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="成品物料" required><el-select v-model="finish.product"><el-option v-for="name in products" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="产量(干吨)" required><el-input v-model="finish.outputDry" /></el-form-item></el-col>
        <el-col :span="12">
          <el-form-item label="生产批次" required>
            <el-select v-model="finish.prodBatch" @change="fillFinish(String($event))">
              <el-option v-for="name in pendingBatches" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12"><el-form-item label="关联报关单号"><el-input :model-value="finishCustoms" readonly /></el-form-item></el-col>
        <el-col :span="12">
          <el-form-item label="目标堆位" required>
            <el-select v-model="finish.stackCode">
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
        <el-descriptions-item label="完工单号">{{ detailFinish.id }}</el-descriptions-item>
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
        <el-table-column prop="id" label="单号" width="150" />
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
.remark { margin-top: 12px; }
.over :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset; }
:deep(.el-form-item) { margin-bottom: 12px; }
:deep(.el-dialog .el-select), :deep(.el-dialog .el-input), :deep(.el-dialog .el-date-editor.el-input) { width: 100%; }
</style>
