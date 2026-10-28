<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inventoryApi, ocrApi, outboundApi, partnerApi, warehouseApi } from '@/api'
import ImageViewer from '@/components/ImageViewer.vue'
import { MONEY_ROW, MOCK_DATA } from '@/controller/shared/constants'
import { dash } from './ops/samples'

const route = useRoute()
const filters = reactive({ consignor: '', status: '', from: '', to: '', keyword: '' })
const consignors = ref<{ id: string; name: string }[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const sourceLots = ref<Record<string, unknown>[]>([])
const lotsLoading = ref(false)
const lotPage = ref(1)
const lotPageSize = ref(10)
const lotTotal = ref(0)
const statuses = ref<string[]>(['未出库', '已出库', '作废'])
const currencies = ref<{ label: string; value: string }[]>([{ label: '人民币 ¥', value: 'CNY' }, { label: '美元 $', value: 'USD' }])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const open = ref(false)
const detailOpen = ref(false)
const current = ref<Record<string, unknown> | null>(null)
const ocrStatus = ref('上传出库报关单影像，自动识别并回填')
const outboundFile = ref<HTMLInputElement>()
const ocrBusy = ref(false)
const ocrProgress = ref(0)
const ocrPreviewOpen = ref(false)
const ocrPreviewUrl = ref('')
const ocrPreviewName = ref('')
const ocrPreviewImage = ref(false)
const form = reactive<Record<string, any>>(blankForm())
const saving = ref(false)
let ocrProgressTimer = 0

onBeforeUnmount(() => {
  window.clearInterval(ocrProgressTimer)
  if (ocrPreviewUrl.value) URL.revokeObjectURL(ocrPreviewUrl.value)
})

const selected = computed(() => sourceLots.value.find((row) => lotKey(row) === form.lotId))

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

function areaTag(area: unknown) {
  const label = String(area || '').trim()
  if (/待检|检验|质检/.test(label)) return 'warning'
  if (/成品/.test(label)) return 'success'
  if (/原料|报备矿|矿区/.test(label)) return 'primary'
  if (/冻结|不合格|隔离|危险/.test(label)) return 'danger'
  if (/混矿|混成品|混合/.test(label)) return 'info'
  return 'info'
}

function areaText(row: Record<string, unknown>) {
  const stack = stacks.value.find((item) => String(item.id) === String(row.stackId) || String(item.code) === String(row.stackText))
  return String(row.areaLabel || stack?.areaLabel || '未分类')
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
  const res = await warehouseApi.stackCatalog()
  stacks.value = res.success && Array.isArray(res.data) ? res.data : []
}

onMounted(async () => {
  const [partnersRes, statusRes] = await Promise.all([
    partnerApi.catalog({ role: '委托方' }),
    dictApi.labels('wms_shipment_status'),
    loadStacks(),
  ])
  if (partnersRes.success && Array.isArray(partnersRes.data)) {
    consignors.value = partnersRes.data.map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || ''),
    })).filter((row) => row.id && row.name)
    setConsignorId(form.consignor)
  } else {
    ElMessage.error(partnersRes.message || '委托方列表加载失败')
  }
  if (statusRes.success && statusRes.data?.length) statuses.value = statusRes.data
  const currencyRes = await dictApi.options('wms_currency_type')
  if (currencyRes.success && Array.isArray(currencyRes.data)) currencies.value = currencyRes.data
  applyKeyword()
  load()
})

function blankForm() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    ...MOCK_DATA.outbound,
    consignor: MOCK_DATA.outbound.consignor || consignors.value[0]?.name || '',
    consignorId: consignors.value.find((row) => row.name === MOCK_DATA.outbound.consignor)?.id || '',
    consumer: MOCK_DATA.outbound.receivingCompany,
    shipmentOrderDetails: MOCK_DATA.outbound.shipmentOrderDetails.map((row) => ({ ...row })),
    planShipmentTime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  }
}

function setConsignorId(name: unknown) {
  const consignor = consignors.value.find((row) => row.name === String(name ?? ''))
  if (consignor) form.consignorId = consignor.id
}

function onConsignorChange(id: string) {
  const consignor = consignors.value.find((row) => row.id === id)
  form.consignorId = id
  form.consignor = consignor?.name || ''
}

let lotSilent = false
let lotToken = 0
let keywordTimer = 0

async function reset() {
  lotSilent = true
  window.clearTimeout(keywordTimer)
  if (ocrPreviewUrl.value) URL.revokeObjectURL(ocrPreviewUrl.value)
  ocrPreviewUrl.value = ''
  ocrPreviewName.value = ''
  ocrPreviewImage.value = false
  ocrPreviewOpen.value = false
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, blankForm())
  lotPage.value = 1
  lotTotal.value = 0
  sourceLots.value = []
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
    itemCategory: 3,
    pageNum: lotPage.value,
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
  form.inventoryId = String(row.id ?? '')
  if (row.consignor) {
    form.consignor = String(row.consignor)
    setConsignorId(form.consignor)
  }
  const remain = Number(row.remain ?? row.dry ?? row.wet)
  if (!(Number(form.shipmentWeight) > 0) && remain > 0) form.shipmentWeight = remain
}

function addShipmentOrderDetail() {
  form.shipmentOrderDetails.push(Object.assign({}, MONEY_ROW))
}

function removeShipmentOrderDetail(index: number) {
  if (index > 0) form.shipmentOrderDetails.splice(index, 1)
}

/** 出库 OCR 回填：只回填出库单接口支持的字段。 */
function pickOcr(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (value != null && value !== '') return value
  }
  return undefined
}

function applyOcrFields(data: Record<string, unknown>) {
  const fields: [string, string[]][] = [
    ['recordNo', ['recordNo', 'customsNo', 'customsCode']],
    ['consignor', ['consignorName', 'consignor', '委托方']],
    ['verificationCode', ['verificationCode', 'checklistNo', '核注清单号']],
  ]
  for (const [formKey, ocrKeys] of fields) {
    const value = pickOcr(data, ocrKeys)
    if (value !== undefined) {
      form[formKey] = value
      if (formKey === 'consignor') setConsignorId(value)
    }
  }

  const company = pickOcr(data, ['consignorName'])
  if (company !== undefined) {
    form.receivingCompany = company
    form.consumer = company
  }

  const weight = pickOcr(data, ['netWeight', 'netWeight ', 'net', 'grossWeight', 'grossWeight ', 'gross'])
  if (weight !== undefined) form.shipmentWeight = weight

  const rawItems = pickOcr(data, ['amountLines', 'items', 'goods', 'details'])
  if (Array.isArray(rawItems)) {
    const detailRows = rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const values = {
          itemCode: pickOcr(item, ['itemCode', 'goodsCode', 'commodityCode', '商品编号', '商品编码']),
          itemName: pickOcr(item, ['itemName', 'goodsName', 'commodityName', '商品名称']),
          quantity: pickOcr(item, ['quantity', 'qty', '数量']),
          unit: pickOcr(item, ['unit', 'quantityUnit', '单位']),
          unitPrice: pickOcr(item, ['unitPrice', 'price', '单价']),
          totalPrice: pickOcr(item, ['totalPrice', 'amount', '总价', '金额']),
          currency: pickOcr(item, ['currency', 'currencyCode', '币制']),
          originCountry: pickOcr(item, ['originCountry', 'origin', '原产国']),
          destCountry: pickOcr(item, ['destCountry', 'destinationCountry', 'destination', '目的地']),
        }
        const hasContent = Object.values(values).some((value) => String(value ?? '').trim() !== '')
        const row: Record<string, unknown> = Object.assign({}, MONEY_ROW)
        for (const [key, value] of Object.entries(values)) {
          if (value !== undefined) row[key] = value
        }
        return [row, hasContent] as const
      })
      .filter(([, hasContent]) => hasContent)
      .map(([row]) => row)
    if (detailRows.length) form.shipmentOrderDetails = detailRows
  }
}

async function runOcr(file?: File) {
  if (!file) {
    ElMessage.warning('请选择出库报关单文件')
    return
  }
  if (ocrBusy.value) return
  if (ocrPreviewUrl.value) URL.revokeObjectURL(ocrPreviewUrl.value)
  ocrPreviewUrl.value = URL.createObjectURL(file)
  ocrPreviewName.value = file.name
  ocrPreviewImage.value = file.type.startsWith('image/')
  ocrBusy.value = true
  ocrProgress.value = 4
  ocrStatus.value = '正在识别出库报关单…'
  ocrProgressTimer = window.setInterval(() => {
    ocrProgress.value = Math.min(92, ocrProgress.value + Math.max(1, Math.ceil((92 - ocrProgress.value) / 14)))
  }, 220)
  try {
    const [res] = await Promise.all([
      ocrApi.recognize({ docType: '出库报关单', fileName: file.name, __file: file }),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ])
    if (res.success && res.data) {
      applyOcrFields(res.data as Record<string, unknown>)
      ocrProgress.value = 100
      ocrStatus.value = '已识别，字段可手工修正'
      ElMessage.success('出库报关单已识别并回填')
    } else {
      ocrStatus.value = res.message || '识别失败，请重试'
      ElMessage.error(ocrStatus.value)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '识别失败，请重试'
    ocrStatus.value = message
    ElMessage.error(message)
  } finally {
    window.clearInterval(ocrProgressTimer)
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    ocrBusy.value = false
  }
}

function onOutboundFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) runOcr(file)
}

async function save() {
  saving.value = true
  try {
    const res = await outboundApi.create(form)
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
      <el-table-column prop="receivingCompany" label="流向企业" min-width="140" />
      <el-table-column prop="consumer" label="消费使用单位" min-width="140" />
      <el-table-column prop="checklistNo" label="核注清单" min-width="140" />
      <el-table-column label="出库重量" width="100"><template #default="{ row }">{{ dash(row.shipmentWeight) }}</template></el-table-column>
      <el-table-column prop="amount" label="总金额" width="120" />
      <el-table-column label="出库时间" min-width="180"><template #default="{ row }">{{ dash(row.time) }}</template></el-table-column>
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
        <!-- {{form}} -->
        <el-tag type="info">可选识别</el-tag>
        <el-button size="small" type="primary" plain :disabled="ocrBusy" @click="outboundFile?.click()">
          {{ ocrPreviewName ? '重新上传' : '上传报关单' }}
        </el-button>
        <el-button v-if="ocrPreviewUrl" size="small" text type="primary" @click="ocrPreviewOpen = true">查看影像</el-button>
        <input ref="outboundFile" class="file" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onOutboundFile" />
        <span>{{ ocrStatus }}</span>
      </div>
      <el-form label-width="120px">
        <el-form-item label="票货">
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
                <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.id)">
                  <span class="stack-option">
                    <span>{{ String(item.code) }}</span>
                    <el-tag size="small" effect="plain" :type="areaTag(item.areaLabel)">{{ String(item.areaLabel || '未分类') }}</el-tag>
                  </span>
                </el-option>
              </el-select>
              <el-input
                v-model="form.customsKeyword"
                clearable
                placeholder="批次 / 报关单号"
                style="flex: 1; min-width: 160px"
              />
            </div>
            <p class="hint">仅查询在库混成品。切换堆位或关键字会自动刷新。</p>
            <el-table
              v-loading="lotsLoading"
              :data="sourceLots"
              border
              size="small"
              max-height="240"
              empty-text="暂无在库混成品"
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
              <el-table-column label="堆位标识" width="120">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="areaTag(areaText(row))">{{ dash(row.stackText) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="分类" width="90">
                <template #default="{ row }">
                  <el-tag size="small" effect="light" :type="areaTag(areaText(row))">{{ areaText(row) }}</el-tag>
                </template>
              </el-table-column>
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
            <div v-if="selected" class="lot-line">
              已选 {{ dash(selected.batchNo) }} · {{ dash(selected.material) }} ·
              <el-tag size="small" effect="plain" :type="areaTag(areaText(selected))">{{ dash(selected.stackText) }}</el-tag>
              <el-tag class="selected-area-tag" size="small" :type="areaTag(areaText(selected))">{{ areaText(selected) }}</el-tag>
              · 在库 {{ dash(selected.remain ?? selected.dry) }} 吨
            </div>
          </div>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="委托方">
              <el-select :model-value="form.consignorId" clearable filterable style="width: 100%" @change="onConsignorChange">
                <el-option
                  v-if="form.consignorId && !consignors.some((row) => row.id === String(form.consignorId))"
                  :label="String(form.consignor)"
                  :value="String(form.consignorId)"
                />
                <el-option v-for="item in consignors" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="流向企业"><el-input v-model="form.receivingCompany" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="消费使用单位"><el-input v-model="form.consumer" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库报关单号"><el-input v-model="form.recordNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="核注清单号"><el-input v-model="form.verificationCode" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="selected?.batchNo || ''" readonly /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="计划出库时间"><el-date-picker v-model="form.planShipmentTime" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库重量(吨)"><el-input v-model="form.shipmentWeight" type="number" min="0.001" step="0.001" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="报关单金额">
          <div class="money-editor">
            <div class="money-heading">
              <div>
                <strong>商品金额明细</strong>
                <span>填写报关商品、数量与金额信息</span>
              </div>
              <el-button size="small" type="primary" plain @click="addShipmentOrderDetail">
                <el-icon><Plus /></el-icon>
                添加明细
              </el-button>
            </div>
            <div class="money-list">
              <section v-for="(item, index) in form.shipmentOrderDetails" :key="index" class="money-card">
                <div class="money-card-heading">
                  <span class="money-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <strong>商品明细</strong>
                  <span v-if="index === 0" class="money-required">至少保留一行</span>
                  <el-button v-else size="small" link type="danger" @click="removeShipmentOrderDetail(index)">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </div>
                <div class="money-fields">
                  <label class="money-field"><span>商品编号</span><el-input v-model="item.itemCode" size="small" placeholder="请输入编号" /></label>
                  <label class="money-field"><span>商品名称</span><el-input v-model="item.itemName" size="small" placeholder="请输入名称" /></label>
                  <label class="money-field"><span>数量</span><el-input v-model="item.quantity" size="small" placeholder="请输入数量" /></label>
                  <label class="money-field"><span>单位</span><el-input v-model="item.unit" size="small" placeholder="如：千克" /></label>
                  <label class="money-field"><span>单价</span><el-input v-model="item.unitPrice" size="small" placeholder="请输入单价" /></label>
                  <label class="money-field"><span>总价</span><el-input v-model="item.totalPrice" size="small" placeholder="请输入总价" /></label>
                  <label class="money-field"><span>币制</span><el-select v-model="item.currency" size="small" placeholder="请选择币制">
                    <el-option v-for="currency in currencies" :key="currency.value" :label="currency.label" :value="currency.value" />
                  </el-select></label>
                  <label class="money-field"><span>原产国</span><el-input v-model="item.originCountry" size="small" placeholder="请输入原产国" /></label>
                  <label class="money-field"><span>目的地</span><el-input v-model="item.destCountry" size="small" placeholder="请输入目的地" /></label>
                </div>
              </section>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="ocrBusy" @click="save">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ocrPreviewOpen" title="出库报关单影像" width="900px" align-center append-to-body destroy-on-close>
      <ImageViewer
        v-if="ocrPreviewImage && ocrPreviewUrl"
        :src="ocrPreviewUrl"
        :name="ocrPreviewName"
        title="出库报关单"
      />
      <iframe
        v-else-if="ocrPreviewUrl"
        class="ocr-document"
        :src="ocrPreviewUrl"
        :title="ocrPreviewName"
      />
    </el-dialog>

    <el-dialog v-model="detailOpen" title="出库详情" width="640px" align-center>
      <p>单号 {{ dash(current?.orderNo || current?.id) }} · 状态 {{ dash(current?.status) }}</p>
      <p>报关单号 {{ dash(current?.recordNo) }} · 委托方 {{ dash(current?.consignor) }} · 流向企业 {{ dash(current?.receivingCompany) }}</p>
      <p>消费使用单位 {{ dash(current?.consumer) }} · 核注清单 {{ dash(current?.checklistNo) }}</p>
      <p>批次 {{ dash(current?.batchNo) }} · 出库重量 {{ dash(current?.shipmentWeight) }} 吨</p>
      <p>计划出库时间 {{ dash(current?.planShipmentTime) }} · 报关单金额 {{ dash(current?.amount) }} · 备注 {{ dash(current?.remark) }}</p>
    </el-dialog>

    <Teleport to="body">
      <div v-if="ocrBusy" class="ocr-mask" role="status" aria-live="polite">
        <div class="ocr-progress-card">
          <div class="ocr-spinner" />
          <strong>正在识别出库报关单</strong>
          <span>正在提取单据字段，请稍候…</span>
          <div class="ocr-progress-track"><i :style="{ width: `${ocrProgress}%` }" /></div>
          <small>{{ ocrProgress }}%</small>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.ocr { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 10px; background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-8); border-radius: 6px; }
.file { display: none; }
.ocr-document { display: block; width: 100%; height: min(68vh, 700px); border: 0; border-radius: 6px; background: var(--wms-bg); }
.ocr-mask { position: fixed; z-index: 5000; inset: 0; display: grid; place-items: center; background: rgb(18 22 28 / 52%); backdrop-filter: blur(3px); }
.ocr-progress-card { display: flex; width: min(360px, calc(100vw - 40px)); flex-direction: column; align-items: center; gap: 12px; padding: 28px 30px 22px; border: 1px solid var(--el-color-primary-light-7); border-radius: 12px; background: var(--el-bg-color); box-shadow: 0 20px 60px rgb(0 0 0 / 20%); color: var(--el-text-color-primary); }
.ocr-progress-card strong { font-size: 16px; font-weight: 600; }
.ocr-progress-card > span { color: var(--el-text-color-secondary); font-size: 13px; }
.ocr-spinner { width: 38px; height: 38px; border: 3px solid var(--el-color-primary-light-8); border-top-color: var(--el-color-primary); border-radius: 50%; animation: ocr-spin 0.8s linear infinite; }
.ocr-progress-track { width: 100%; height: 6px; overflow: hidden; border-radius: 99px; background: var(--el-color-primary-light-9); }
.ocr-progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--el-color-primary); transition: width 220ms ease; }
.ocr-progress-card small { color: var(--el-color-primary-dark-2); font-size: 12px; font-variant-numeric: tabular-nums; }
@keyframes ocr-spin { to { transform: rotate(360deg); } }
.lot-box { width: 100%; }
.money-editor { width: 100%; padding: 9px; border: 1px solid var(--el-color-primary-light-7); border-radius: 8px; background: linear-gradient(180deg, var(--el-color-primary-light-9) 0%, #fff 100%); }
.money-heading, .money-card-heading { display: flex; align-items: center; }
.money-heading { justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.money-heading > div { display: flex; flex-direction: column; gap: 3px; }
.money-heading strong { color: var(--el-text-color-primary); font-size: 13px; }
.money-heading span { color: var(--el-text-color-secondary); font-size: 11px; }
.money-list { display: flex; flex-direction: column; gap: 7px; }
.money-card { padding: 8px 9px; border: 1px solid var(--el-border-color); border-radius: 6px; background: #fff; }
.money-card-heading { gap: 7px; margin-bottom: 7px; padding-bottom: 6px; border-bottom: 1px solid var(--el-color-primary-light-9); }
.money-card-heading strong { color: var(--el-text-color-primary); font-size: 12px; }
.money-index { display: inline-flex; width: 21px; height: 21px; align-items: center; justify-content: center; border-radius: 5px; background: var(--el-color-primary-light-9); color: var(--el-color-primary-dark-2); font-size: 10px; font-weight: 700; }
.money-required { margin-left: auto; color: var(--el-text-color-secondary); font-size: 11px; }
.money-card-heading .el-button { margin-left: auto; }
.money-fields { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px 9px; }
.money-field { display: flex; min-width: 0; flex-direction: column; gap: 3px; color: var(--el-text-color-secondary); font-size: 11px; }
.money-field :deep(.el-input), .money-field :deep(.el-select) { width: 100%; }
.money-field :deep(.el-input__wrapper), .money-field :deep(.el-select__wrapper) { box-shadow: 0 0 0 1px var(--el-border-color) inset; }
.money-field :deep(.el-input__wrapper:hover), .money-field :deep(.el-select__wrapper:hover) { box-shadow: 0 0 0 1px var(--el-color-primary-light-5) inset; }
.stack-query { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.stack-option { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; }
.hint { margin: 0 0 8px; color: #6b7280; font-size: 12px; }
.lot-line { margin: 8px 0 0; color: #374151; font-size: 13px; }
.selected-area-tag { margin-left: 4px; }
.lot-pager { display: flex; justify-content: flex-end; margin-top: 8px; }
:deep(.is-picked) > td { background: #f7f1e6 !important; }
@media (max-width: 900px) {
  .money-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .money-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .money-heading { align-items: flex-start; }
}
</style>
