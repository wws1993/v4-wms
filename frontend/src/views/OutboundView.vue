<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inventoryApi, ocrApi, outboundApi, partnerApi, warehouseApi } from '@/api'
import { dash, money } from './ops/samples'

type AmountLine = {
  productCode: string
  productName: string
  qty: string | number
  unitPrice: string | number
  totalPrice: string | number
  originCountry: string
  destination: string
  domesticDest: string
}

const route = useRoute()
const filters = reactive({ consignor: '', status: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const sourceLots = ref<Record<string, unknown>[]>([])
const lotsLoading = ref(false)
const lotPage = ref(1)
const lotPageSize = ref(10)
const lotTotal = ref(0)
const statuses = ref<string[]>(['未出库', '已出库', '作废'])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const open = ref(false)
const detailOpen = ref(false)
const current = ref<Record<string, unknown> | null>(null)
const ocrStatus = ref('上传出库报关单影像，自动识别并回填')
const recognized = ref(false)
const outboundFile = ref<HTMLInputElement>()
const form = reactive<Record<string, any>>({})
const amountLines = ref<AmountLine[]>([])
const saving = ref(false)

const selected = computed(() => sourceLots.value.find((row) => lotKey(row) === form.lotId))
const amountSum = computed(() => amountLines.value.reduce((sum, row) => sum + (Number(row.totalPrice) || 0), 0))

function emptyAmountLine(): AmountLine {
  return {
    productCode: '',
    productName: '',
    qty: '',
    unitPrice: '',
    totalPrice: '',
    originCountry: '',
    destination: '',
    domesticDest: '',
  }
}

function lotKey(row: Record<string, unknown>) {
  return String(row.id || row.inventoryId || row.batchNo)
}

function lotText(row: Record<string, unknown> | undefined, key: 'customs' | 'prod') {
  if (!row) return '—'
  if (key === 'customs') return dash(row.recordNo || row.customsNo)
  return dash(row.batchNo)
}

function lotRowClass({ row }: { row: Record<string, unknown> }) {
  return lotKey(row) === form.lotId ? 'is-picked' : ''
}

async function load() {
  loading.value = true
  const res = await outboundApi.list({ ...filters, page: page.value, pageSize: 10 })
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '加载失败')
    rows.value = []
    total.value = 0
    return
  }
  if (res.message.includes('暂不支持')) ElMessage.warning(res.message)
  rows.value = res.data.list
  total.value = res.data.total
}

function applyKeyword() {
  if (route.name !== 'outbound') return false
  const keyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (filters.keyword === keyword) return false
  filters.keyword = keyword
  page.value = 1
  return true
}

watch(() => route.query.keyword, () => {
  if (applyKeyword()) load()
})

onActivated(() => {
  if (applyKeyword()) load()
})

async function loadStacks() {
  const listed: Record<string, unknown>[] = []
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await warehouseApi.stacks({ page: pageNo, pageSize: 200 })
    if (!res.success || !res.data?.list.length) break
    listed.push(...res.data.list)
    if (listed.length >= Number(res.data.total || listed.length)) break
  }
  stacks.value = listed
}

onMounted(async () => {
  const [who, statusRes] = await Promise.all([
    partnerApi.consignors(),
    dictApi.labels('wms_shipment_status'),
    loadStacks(),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (statusRes.success && statusRes.data?.length) statuses.value = statusRes.data
  applyKeyword()
  load()
})

function blankForm() {
  return {
    consignor: consignors.value[0] || '',
    consignee: '',
    customsNo: '',
    shipDate: '',
    wet: '',
    grossWeight: '',
    netWeight: '',
    checklistNo: '',
    stackId: '',
    customsKeyword: '',
    lotId: '',
    batchNo: '',
    inventoryId: '',
    orcId: '',
  }
}

let lotSilent = false
let lotToken = 0
let keywordTimer = 0

async function reset() {
  lotSilent = true
  window.clearTimeout(keywordTimer)
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, blankForm())
  amountLines.value = [emptyAmountLine()]
  lotPage.value = 1
  lotTotal.value = 0
  sourceLots.value = []
  recognized.value = false
  ocrStatus.value = '请先上传出库报关单'
  open.value = true
  // 等分页组件挂载完，避免 current-change / 关键字 watch 再打一次
  await nextTick()
  lotSilent = false
  await loadSourceLots(true)
}

async function loadSourceLots(keepPick = false) {
  if (!keepPick) {
    form.lotId = ''
    form.batchNo = ''
    form.inventoryId = ''
  }
  const token = ++lotToken
  lotsLoading.value = true
  const res = await inventoryApi.list({
    stack: form.stackId || undefined,
    keyword: String(form.customsKeyword || '').trim() || undefined,
    status: '在库',
    page: lotPage.value,
    pageSize: lotPageSize.value,
  })
  if (token !== lotToken) return
  lotsLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '票货查询失败')
    sourceLots.value = []
    lotTotal.value = 0
    return
  }
  const list = res.data.list
  sourceLots.value = list
  lotTotal.value = Number(res.data.total ?? list.length)
  if (keepPick && form.lotId && !list.some((row) => lotKey(row) === form.lotId)) {
    form.lotId = ''
    form.batchNo = ''
    form.inventoryId = ''
  }
}

function onLotPage() {
  if (lotSilent) return
  loadSourceLots(true)
}

function onLotSize() {
  if (lotSilent) return
  if (lotPage.value !== 1) lotPage.value = 1
  else loadSourceLots(true)
}

function onStackChange() {
  if (lotSilent) return
  lotPage.value = 1
  loadSourceLots()
}

watch(() => form.customsKeyword, () => {
  if (!open.value || lotSilent) return
  window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(() => {
    if (!open.value || lotSilent) return
    lotPage.value = 1
    loadSourceLots()
  }, 300)
})

function pickLot(row: Record<string, unknown>) {
  form.lotId = lotKey(row)
  form.batchNo = String(row.batchNo || '')
  form.inventoryId = String(row.id || row.inventoryId || '')
  if (!form.consignor && row.consignor) form.consignor = String(row.consignor)
  const remain = Number(row.remain ?? row.dry ?? row.wet)
  if (!(Number(form.wet) > 0) && remain > 0) form.wet = remain
}

function addAmountLine() {
  amountLines.value.push(emptyAmountLine())
}

function removeAmountLine(index: number) {
  if (amountLines.value.length <= 1) {
    amountLines.value = [emptyAmountLine()]
    return
  }
  amountLines.value.splice(index, 1)
}

function fillAmountFromOcr(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) return false
  const lines = raw.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    return {
      productCode: String(row.productCode || row.goodsCode || row.code || ''),
      productName: String(row.productName || row.goodsName || row.name || ''),
      qty: row.qty ?? row.quantity ?? '',
      unitPrice: row.unitPrice ?? row.price ?? '',
      totalPrice: row.totalPrice ?? row.amount ?? row.total ?? '',
      originCountry: String(row.originCountry || row.origin || ''),
      destination: String(row.destination || row.destCountry || ''),
      domesticDest: String(row.domesticDest || row.domesticDestination || ''),
    } as AmountLine
  })
  amountLines.value = lines.length ? lines : [emptyAmountLine()]
  return true
}

/** 出库 OCR 回填：海关编号、消费使用单位（委托方+流向企业）、毛重、净重、核注清单号、金额 list */
function pickOcr(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (value != null && value !== '') return value
  }
  return undefined
}

function applyOcrFields(data: Record<string, unknown>) {
  const customsNo = pickOcr(data, ['customsNo', 'recordNo', 'customsCode', 'haiguanNo'])
  if (customsNo != null) form.customsNo = customsNo

  // 委托人、流向企业均取消费使用单位
  const consumer = pickOcr(data, ['consumer', '消费使用单位', 'consignee', 'merchantName', 'flowTo'])
  if (consumer != null) {
    form.consignor = consumer
    form.consignee = consumer
  }

  const gross = pickOcr(data, ['grossWeight', 'gross', '毛重'])
  if (gross != null) form.grossWeight = gross
  const net = pickOcr(data, ['netWeight', 'net', '净重'])
  if (net != null) form.netWeight = net
  const checklist = pickOcr(data, ['checklistNo', 'verificationCode', '核注清单号'])
  if (checklist != null) form.checklistNo = checklist

  fillAmountFromOcr(data.amountLines || data.items || data.goods || data.details)
}

async function runOcr(file?: File) {
  if (!file) {
    ElMessage.warning('请选择出库报关单文件')
    return
  }
  const res = await ocrApi.recognize({ docType: '出库报关单', fileName: file.name, __file: file, customsNo: form.customsNo })
  if (res.success && res.data) {
    const data = res.data as Record<string, unknown>
    applyOcrFields(data)
    if (data.id != null && data.id !== '') form.orcId = data.id
    recognized.value = true
    ocrStatus.value = '已识别，字段可手工修正'
  } else {
    recognized.value = false
    ocrStatus.value = res.message
  }
}

function onOutboundFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) runOcr(file)
}

function filledAmountLines() {
  return amountLines.value.filter((row) => (
    String(row.productCode || row.productName || row.qty || row.unitPrice || row.totalPrice).trim()
  ))
}

async function save() {
  if (!recognized.value) {
    ElMessage.warning('请先上传出库报关单')
    return
  }
  if (!selected.value) {
    ElMessage.warning('请选择票货')
    return
  }
  if (!form.consignor || !form.consignee || !form.shipDate || !form.wet || !form.checklistNo) {
    ElMessage.warning('请补全委托方、流向企业、出库日期、出库重量和核注清单号')
    return
  }
  const lines = filledAmountLines()
  if (!lines.length) {
    ElMessage.warning('请至少填写一行金额明细')
    return
  }
  const remain = Number(selected.value.remain ?? selected.value.dry ?? 0)
  const wet = Number(form.wet)
  if (remain > 0 && wet > remain) {
    ElMessage.warning(`出库重量不能超过在库 ${remain} 吨`)
    return
  }
  // 出库新字段接口未就绪：只做前端校验与组包，不造 mock 成功。
  const payload = {
    ...form,
    amount: amountSum.value || undefined,
    amountLines: lines,
  }
  saving.value = true
  try {
    const res = await outboundApi.create(payload)
    if (!res.success) {
      ElMessage.error(res.message || '出库接口尚未就绪')
      return
    }
    ElMessage.success(res.message)
    open.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function complete(row: Record<string, unknown>) {
  const res = await outboundApi.complete(String(row.id))
  if (!res.success) ElMessage.error(res.message)
  else ElMessage.success(res.message)
  load()
}

function canShip(row: Record<string, unknown>) {
  return row.status === '未出库'
}
</script>

<template>
  <div>
    <el-form :inline="true">
      <el-form-item label="单号"><el-input v-model="filters.keyword" clearable placeholder="报关单 / 批次 / 出库单" style="width: 200px" /></el-form-item>
      <el-form-item label="委托方"><el-select v-model="filters.consignor" clearable style="width: 140px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <div class="toolbar"><el-button type="primary" @click="reset">新建出库单</el-button></div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column label="出库单号" min-width="150"><template #default="{ row }">{{ dash(row.orderNo || row.id) }}</template></el-table-column>
      <el-table-column prop="consignor" label="委托方" width="120" />
      <el-table-column prop="consignee" label="流向企业" min-width="140" />
      <el-table-column prop="checklistNo" label="核注清单" min-width="140" />
      <el-table-column label="出库重量" width="100"><template #default="{ row }">{{ dash(row.wet) }}</template></el-table-column>
      <el-table-column label="金额" width="120"><template #default="{ row }">{{ money(row.amount, row.currency) }}</template></el-table-column>
      <el-table-column label="出库/完成时间" min-width="180"><template #default="{ row }">{{ dash(row.time) }} / {{ dash(row.finishedAt) }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="90" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canShip(row)" link type="primary" @click="complete(row)">出库完成</el-button>
          <el-button link type="primary" @click="current = row; detailOpen = true">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <el-dialog v-model="open" title="新建出库订单" width="1100px" align-center destroy-on-close>
      <div class="ocr">
        <el-tag>出库报关单</el-tag>
        <el-tag type="warning">必传</el-tag>
        <el-button size="small" @click="outboundFile?.click()">上传报关单</el-button>
        <input ref="outboundFile" class="file" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onOutboundFile" />
        <span>{{ ocrStatus }}</span>
      </div>
      <el-form label-width="120px">
        <el-form-item label="票货" required>
          <div class="lot-box">
            <div class="stack-query">
              <el-select
                v-model="form.stackId"
                filterable
                clearable
                placeholder="堆位"
                style="width: 160px"
                @change="onStackChange"
              >
                <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.id)" />
              </el-select>
              <el-input
                v-model="form.customsKeyword"
                clearable
                placeholder="批次 / 报关单号"
                style="flex: 1; min-width: 160px"
              />
            </div>
            <p class="hint">打开即查在库票货。切换堆位或关键字会自动刷新。</p>
            <el-table
              v-loading="lotsLoading"
              :data="sourceLots"
              border
              size="small"
              max-height="240"
              empty-text="暂无在库票货"
              :row-class-name="lotRowClass"
              @row-click="pickLot"
            >
              <el-table-column width="46">
                <template #default="{ row }">
                  <el-radio :model-value="form.lotId" :value="lotKey(row)" @click.stop="pickLot(row)" />
                </template>
              </el-table-column>
              <el-table-column label="生产批次" min-width="120"><template #default="{ row }">{{ lotText(row, 'prod') }}</template></el-table-column>
              <el-table-column label="报关单号" min-width="130"><template #default="{ row }">{{ lotText(row, 'customs') }}</template></el-table-column>
              <el-table-column prop="consignor" label="委托方" width="100" />
              <el-table-column prop="material" label="物料" width="90" />
              <el-table-column prop="stackText" label="堆位" width="90" />
              <el-table-column prop="areaLabel" label="片区" width="80" />
              <el-table-column label="在库" width="80"><template #default="{ row }">{{ dash(row.remain ?? row.dry) }}</template></el-table-column>
            </el-table>
            <div class="lot-pager">
              <el-pagination
                v-model:current-page="lotPage"
                v-model:page-size="lotPageSize"
                :total="lotTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                background
                small
                @current-change="onLotPage"
                @size-change="onLotSize"
              />
            </div>
            <p v-if="selected" class="lot-line">
              已选 {{ dash(selected.batchNo) }} · {{ dash(selected.material) }} · {{ dash(selected.stackText) }} · 在库 {{ dash(selected.remain ?? selected.dry) }} 吨
            </p>
          </div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="委托方" required>
              <el-select v-model="form.consignor" clearable filterable style="width: 100%">
                <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="流向企业" required><el-input v-model="form.consignee" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="海关编号"><el-input v-model="form.customsNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="核注清单号" required><el-input v-model="form.checklistNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库日期" required><el-date-picker v-model="form.shipDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库重量" required><el-input v-model="form.wet" type="number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="毛重"><el-input v-model="form.grossWeight" type="number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="净重"><el-input v-model="form.netWeight" type="number" /></el-form-item></el-col>
        </el-row>

        <el-form-item label="金额" required>
          <div class="amount-box">
            <div class="amount-toolbar">
              <span class="hint">合计 {{ amountSum ? amountSum.toLocaleString() : '—' }}</span>
              <el-button size="small" @click="addAmountLine">加一行</el-button>
            </div>
            <el-table :data="amountLines" border size="small" max-height="280" empty-text="暂无金额明细">
              <el-table-column label="商品编号" min-width="120">
                <template #default="{ row }"><el-input v-model="row.productCode" size="small" /></template>
              </el-table-column>
              <el-table-column label="商品名称" min-width="160">
                <template #default="{ row }"><el-input v-model="row.productName" size="small" /></template>
              </el-table-column>
              <el-table-column label="数量" width="110">
                <template #default="{ row }"><el-input v-model="row.qty" size="small" type="number" /></template>
              </el-table-column>
              <el-table-column label="单价" width="120">
                <template #default="{ row }"><el-input v-model="row.unitPrice" size="small" type="number" /></template>
              </el-table-column>
              <el-table-column label="总价" width="120">
                <template #default="{ row }"><el-input v-model="row.totalPrice" size="small" type="number" /></template>
              </el-table-column>
              <el-table-column label="原产国" width="100">
                <template #default="{ row }"><el-input v-model="row.originCountry" size="small" /></template>
              </el-table-column>
              <el-table-column label="目的地" width="100">
                <template #default="{ row }"><el-input v-model="row.destination" size="small" /></template>
              </el-table-column>
              <el-table-column label="境内目的地" min-width="120">
                <template #default="{ row }"><el-input v-model="row.domesticDest" size="small" /></template>
              </el-table-column>
              <el-table-column label="" width="70" fixed="right">
                <template #default="{ $index }">
                  <el-button link type="danger" @click="removeAmountLine($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="出库详情" width="640px" align-center>
      <p>单号 {{ dash(current?.orderNo || current?.id) }} · 状态 {{ dash(current?.status) }}</p>
      <p>海关编号 {{ dash(current?.customsNo) }} · 委托方 {{ dash(current?.consignor) }} · 流向企业 {{ dash(current?.consignee) }}</p>
      <p>核注 {{ dash(current?.checklistNo) }} · 毛重 {{ dash(current?.grossWeight) }} · 净重 {{ dash(current?.netWeight) }}</p>
      <p>批次 {{ dash(current?.batchNo) }} · 出库重量 {{ dash(current?.wet) }}</p>
      <p>金额 {{ money(current?.amount, current?.currency) }} · 备注 {{ dash(current?.remark) }}</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.ocr { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 10px; background: #f4f7fb; }
.file { display: none; }
.lot-box, .amount-box { width: 100%; }
.stack-query { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.hint { margin: 0 0 8px; color: #6b7280; font-size: 12px; }
.lot-line { margin: 8px 0 0; color: #374151; font-size: 13px; }
.lot-pager { display: flex; justify-content: flex-end; margin-top: 8px; }
.amount-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
:deep(.is-picked) > td { background: #f7f1e6 !important; }
</style>
