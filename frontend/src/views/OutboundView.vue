<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inventoryApi, ocrApi, outboundApi, partnerApi, warehouseApi } from '@/api'
import { dash, money } from './ops/samples'

const route = useRoute()
const filters = reactive({ consignor: '', status: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const sourceLots = ref<Record<string, unknown>[]>([])
const lotsLoading = ref(false)
const statuses = ref<string[]>(['未出库', '已出库', '作废'])
const shipmentTypes = ref<string[]>(['销售出库', '退货出库', '生产出库'])
const currencies = ref<{ label: string; value: string }[]>([
  { label: '人民币 ¥', value: 'CNY' },
  { label: '美元 $', value: 'USD' },
])
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

const selected = computed(() => sourceLots.value.find((row) => lotKey(row) === form.lotId))

function lotKey(row: Record<string, unknown>) {
  return String(row.id || row.inventoryId || row.batchNo)
}

function lotText(row: Record<string, unknown> | undefined, key: 'customs' | 'prod') {
  if (!row) return '—'
  if (key === 'customs') return row.batchKind === '报关单号' ? String(row.batchNo) : dash(row.customsNo)
  return row.batchKind === '生产批次号' ? String(row.batchNo) : '—'
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

async function loadFinishedStacks() {
  const rows: Record<string, unknown>[] = []
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await warehouseApi.stacks({ page: pageNo, pageSize: 200, areaLabel: '成品区' })
    if (!res.success || !res.data?.list.length) break
    rows.push(...res.data.list)
    if (rows.length >= Number(res.data.total || rows.length)) break
  }
  stacks.value = rows.filter((row) => String(row.areaLabel || '') === '成品区')
}

onMounted(async () => {
  const [who, statusRes, typeRes, currencyRes] = await Promise.all([
    partnerApi.consignors(),
    dictApi.labels('wms_shipment_status'),
    dictApi.labels('wms_shipment_type'),
    dictApi.data({ type: 'wms_currency_type', page: 1, pageSize: 20 }),
    loadFinishedStacks(),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (statusRes.success && statusRes.data?.length) statuses.value = statusRes.data
  if (typeRes.success && typeRes.data?.length) shipmentTypes.value = typeRes.data
  if (currencyRes.success && currencyRes.data?.list.length) {
    currencies.value = currencyRes.data.list
      .filter((row) => String(row.status || '正常') !== '停用')
      .map((row) => ({ label: String(row.label), value: String(row.value) }))
  }
  applyKeyword()
  load()
})

function reset() {
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, {
    consignor: consignors.value[0] || '',
    consignee: '',
    consumer: '',
    customsNo: '',
    checklistNo: '',
    shipmentType: shipmentTypes.value.find((item) => item.includes('销售')) || shipmentTypes.value[0] || '销售出库',
    stackId: '',
    customsKeyword: '',
    lotId: '',
    batchNo: '',
    inventoryId: '',
    areaLabel: '成品区',
    wet: '',
    amount: '',
    currency: currencies.value.find((item) => item.value === 'USD' || item.label.includes('美元'))?.value || 'USD',
    time: '',
    remark: '',
    orcId: '',
  })
  sourceLots.value = []
  recognized.value = false
  ocrStatus.value = '请先上传出库报关单'
  open.value = true
}

let lotToken = 0
async function loadSourceLots(stackId = form.stackId) {
  form.lotId = ''
  form.batchNo = ''
  form.inventoryId = ''
  sourceLots.value = []
  const keyword = String(form.customsKeyword || '').trim()
  if (!stackId && !keyword) return
  const token = ++lotToken
  lotsLoading.value = true
  const res = await inventoryApi.list({
    stack: stackId || undefined,
    keyword: keyword || undefined,
    status: '在库',
    areaLabel: '成品区',
    page: 1,
    pageSize: 200,
  })
  if (token !== lotToken) return
  lotsLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '票货查询失败')
    return
  }
  sourceLots.value = res.data.list.filter((row) => String(row.areaLabel || '') === '成品区')
  if (!form.stackId && sourceLots.value.length) {
    const stackText = String(sourceLots.value[0].stackText || '')
    const hit = stacks.value.find((row) => String(row.code) === stackText || String(row.id) === stackText)
    if (hit) form.stackId = String(hit.id)
  }
}

function querySourceLots() {
  if (!form.stackId && !String(form.customsKeyword || '').trim()) {
    ElMessage.warning('请选择成品区堆位或输入批次/报关单号')
    return
  }
  loadSourceLots(form.stackId)
}

function pickLot(row: Record<string, unknown>) {
  if (String(row.areaLabel || '') !== '成品区') {
    ElMessage.warning('只能选择成品区票货')
    return
  }
  form.lotId = lotKey(row)
  form.batchNo = String(row.batchNo || '')
  form.inventoryId = String(row.id || row.inventoryId || '')
  form.areaLabel = '成品区'
  if (!form.consignor && row.consignor) form.consignor = String(row.consignor)
  const remain = Number(row.remain ?? row.dry ?? row.wet)
  if (!(Number(form.wet) > 0) && remain > 0) form.wet = remain
}

async function runOcr(file?: File) {
  if (!file) {
    ElMessage.warning('请选择出库报关单文件')
    return
  }
  const res = await ocrApi.recognize({ docType: '出库报关单', fileName: file.name, __file: file, customsNo: form.customsNo })
  if (res.success && res.data) {
    const data = res.data as Record<string, unknown>
    for (const key of ['customsNo', 'checklistNo', 'consignee', 'consumer', 'wet', 'amount', 'currency']) {
      if (data[key] != null && data[key] !== '') form[key] = data[key]
    }
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

async function save() {
  if (!recognized.value) {
    ElMessage.warning('请先上传出库报关单')
    return
  }
  if (!selected.value) {
    ElMessage.warning('请选择成品区票货')
    return
  }
  if (!form.consignee || !form.consumer || !form.customsNo || !form.checklistNo || !form.batchNo || !form.wet) {
    ElMessage.warning('请补全必填字段')
    return
  }
  const remain = Number(selected.value.remain ?? selected.value.dry ?? 0)
  const wet = Number(form.wet)
  if (remain > 0 && wet > remain) {
    ElMessage.warning(`出库重量不能超过在库 ${remain} 吨`)
    return
  }
  const res = await outboundApi.create({ ...form })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  open.value = false
  load()
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
      <el-table-column prop="consignor" label="委托方" width="100" />
      <el-table-column prop="consignee" label="流向企业" width="140" />
      <el-table-column prop="consumer" label="消费使用单位" min-width="140" />
      <el-table-column prop="customsNo" label="报关单号" min-width="160" />
      <el-table-column prop="checklistNo" label="核注清单" width="120" />
      <el-table-column label="报关单金额" width="130"><template #default="{ row }">{{ money(row.amount, row.currency) }}</template></el-table-column>
      <el-table-column label="重量" width="90"><template #default="{ row }">{{ row.wet }} 干吨</template></el-table-column>
      <el-table-column prop="shipmentType" label="出库类型" width="100" />
      <el-table-column prop="remark" label="备注" min-width="120" />
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

    <el-dialog v-model="open" title="新建出库订单" width="920px" align-center destroy-on-close>
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
                placeholder="成品区堆位"
                style="width: 160px"
                @change="loadSourceLots"
              >
                <el-option v-for="item in stacks" :key="String(item.id)" :label="String(item.code)" :value="String(item.id)" />
              </el-select>
              <el-input
                v-model="form.customsKeyword"
                clearable
                placeholder="批次 / 报关单号"
                style="flex: 1; min-width: 140px"
                @keyup.enter="querySourceLots"
              />
              <el-button type="primary" :loading="lotsLoading" @click="querySourceLots">查询</el-button>
            </div>
            <p class="hint">仅可选成品区在库票货，原料区与待检区不可选。</p>
            <el-table
              v-loading="lotsLoading"
              :data="sourceLots"
              border
              size="small"
              max-height="220"
              :empty-text="form.stackId || String(form.customsKeyword || '').trim() ? '没有匹配的成品区票货' : '请先选择成品区堆位或查询批次'"
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
              <el-table-column prop="consignor" label="委托方" width="90" />
              <el-table-column prop="material" label="物料" width="90" />
              <el-table-column prop="stackText" label="堆位" width="90" />
              <el-table-column prop="areaLabel" label="片区" width="80" />
              <el-table-column label="在库" width="80"><template #default="{ row }">{{ dash(row.remain ?? row.dry) }}</template></el-table-column>
            </el-table>
            <p v-if="selected" class="lot-line">
              已选 {{ dash(selected.batchNo) }} · {{ dash(selected.material) }} · {{ dash(selected.stackText) }} · 在库 {{ dash(selected.remain ?? selected.dry) }} 吨
            </p>
          </div>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="委托方"><el-select v-model="form.consignor" clearable style="width: 100%"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="流向企业"><el-input v-model="form.consignee" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="消费使用单位"><el-input v-model="form.consumer" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库报关单号"><el-input v-model="form.customsNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库类型"><el-select v-model="form.shipmentType" style="width: 100%"><el-option v-for="item in shipmentTypes" :key="item" :label="item" :value="item" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="核注清单号"><el-input v-model="form.checklistNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库重量"><el-input v-model="form.wet" type="number" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="报关单金额">
              <div class="currency">
                <el-select v-model="form.currency" style="width: 120px">
                  <el-option v-for="item in currencies" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
                <el-input v-model="form.amount" type="number" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="计划出库时间"><el-date-picker v-model="form.time" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="save">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="出库详情" width="640px" align-center>
      <p>单号 {{ dash(current?.orderNo || current?.id) }} · 状态 {{ dash(current?.status) }} · 类型 {{ dash(current?.shipmentType) }}</p>
      <p>流向企业 {{ dash(current?.consignee) }} · 消费使用单位 {{ dash(current?.consumer) }}</p>
      <p>报关单 {{ dash(current?.customsNo) }} · 核注 {{ dash(current?.checklistNo) }} · 批次 {{ dash(current?.batchNo) }}</p>
      <p>重量 {{ dash(current?.wet) }} · 金额 {{ money(current?.amount, current?.currency) }} · 备注 {{ dash(current?.remark) }}</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.ocr { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 10px; background: #f4f7fb; }
.file { display: none; }
.currency { display: flex; gap: 8px; }
.lot-box { width: 100%; }
.stack-query { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.hint { margin: 0 0 8px; color: #6b7280; font-size: 12px; }
.lot-line { margin: 8px 0 0; color: #374151; font-size: 13px; }
:deep(.is-picked) > td { background: #f7f1e6 !important; }
</style>
