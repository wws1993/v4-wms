<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { dictApi, inboundApi, inventoryApi, materialApi, partnerApi, shippingApi, warehouseApi } from '@/api'
import { isLiveModule } from '@/api/http'
import { dash, money, qualityLine } from './ops/samples'
import InboundWizard from './inbound/InboundWizard.vue'

const filters = reactive({ consignor: '', status: '', shipMode: '', oreType: '', from: '', to: '', keyword: '' })
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const consignors = ref<string[]>([])
const materials = ref<Record<string, unknown>[]>([])
const filings = ref<Record<string, unknown>[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const methods = ref<{ name: string; containers: number }[]>([])
const minerals = ref<string[]>([])
const statuses = ref<string[]>(['暂存码头', '待收货', '已入库', '混成品'])
const currencies = ref<{ label: string; value: string }[]>([{ label: '人民币 ¥', value: 'CNY' }, { label: '美元 $', value: 'USD' }])

const wizard = ref<{ start: number; seed: Record<string, unknown> | null; key: number } | null>(null)
const detailOpen = ref(false)
const detailTab = ref('customs')
const detailRow = ref<Record<string, unknown> | null>(null)
const products = ref<Record<string, unknown>[]>([])

const shipOptions = computed(() => {
  if (methods.value.length) return methods.value
  if (isLiveModule('shipping')) return []
  return [{ name: '散货', containers: 0 }, { name: '集装箱', containers: 0 }]
})

async function load() {
  loading.value = true
  const res = await inboundApi.list({ ...filters, page: page.value, pageSize: 10 })
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

onMounted(async () => {
  const [who, materialRes, filingRes, stackRes, shipRes] = await Promise.all([
    partnerApi.consignors(),
    materialApi.list({ page: 1, pageSize: 100 }),
    materialApi.filings({ page: 1, pageSize: 100 }),
    warehouseApi.stacks({ page: 1, pageSize: 200 }),
    shippingApi.list(),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (materialRes.success && materialRes.data) materials.value = materialRes.data.list
  if (filingRes.success && filingRes.data) filings.value = filingRes.data.list
  if (stackRes.success && stackRes.data) stacks.value = stackRes.data.list
  if (shipRes.success && shipRes.data) {
    methods.value = shipRes.data.list.map((row) => ({ name: String(row.name), containers: Number(row.containers || 0) }))
  }
  if (isLiveModule('inbound')) {
    const [mineralRes, statusRes, currencyRes] = await Promise.all([
      dictApi.labels('wms_mineral_type'),
      dictApi.labels('wms_receipt_status'),
      dictApi.data({ type: 'wms_currency_type', page: 1, pageSize: 20 }),
    ])
    if (mineralRes.success && mineralRes.data?.length) minerals.value = mineralRes.data
    if (statusRes.success && statusRes.data?.length) statuses.value = statusRes.data
    if (currencyRes.success && currencyRes.data?.list.length) {
      currencies.value = currencyRes.data.list
        .filter((row) => String(row.status || '正常') !== '停用')
        .map((row) => ({ label: String(row.label), value: String(row.value) }))
    }
  } else {
    minerals.value = ['铜精矿', '冰铜']
  }
  load()
})

function openCreate() {
  wizard.value = { start: 0, seed: null, key: Date.now() }
}

function openReceive(row: Record<string, unknown>) {
  wizard.value = { start: 2, seed: { ...row, category: '原料' }, key: Date.now() }
}

function closeWizard() {
  wizard.value = null
}

function finishWizard() {
  wizard.value = null
  load()
}

async function openDetail(row: Record<string, unknown>) {
  detailRow.value = row
  detailTab.value = 'customs'
  products.value = []
  const batchNo = String(row.customsNo || '')
  if (batchNo) {
    const res = await inventoryApi.detail(batchNo)
    if (res.success && res.data) products.value = (res.data.products as Record<string, unknown>[]) || []
  }
  detailOpen.value = true
}

function canReceive(row: Record<string, unknown>) {
  return row.status === '待收货' || row.status === '暂存码头'
}
</script>

<template>
  <div>
  <InboundWizard
    v-if="wizard"
    :key="wizard.key"
    :consignors="consignors"
    :materials="materials"
    :filings="filings"
    :stacks="stacks"
    :methods="shipOptions"
    :minerals="minerals"
    :currencies="currencies"
    :start="wizard.start"
    :seed="wizard.seed"
    @close="closeWizard"
    @done="finishWizard"
  />
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建入库</el-button>
    </div>
    <el-form :inline="true">
      <el-form-item label="委托方">
        <el-select v-model="filters.consignor" clearable style="width: 140px">
          <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="装运">
        <el-select v-model="filters.shipMode" clearable style="width: 140px">
          <el-option v-for="item in shipOptions" :key="item.name" :label="item.name" :value="item.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="矿种">
        <el-select v-model="filters.oreType" clearable style="width: 110px">
          <el-option v-for="item in minerals" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="关键字"><el-input v-model="filters.keyword" placeholder="单号 / 船名 / 提单" clearable /></el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column label="单号" min-width="150"><template #default="{ row }">{{ dash(row.orderNo || row.id) }}</template></el-table-column>
      <el-table-column prop="consignor" label="委托方" width="110" />
      <el-table-column prop="oreType" label="矿种" width="90" />
      <el-table-column prop="shipName" label="船名" width="110" />
      <el-table-column prop="blNo" label="提单" min-width="140" />
      <el-table-column prop="customsNo" label="报关单" min-width="150" />
      <el-table-column prop="checklistNo" label="核注" width="120" />
      <el-table-column label="金额" width="130"><template #default="{ row }">{{ money(row.amount, row.currency) }}</template></el-table-column>
      <el-table-column label="湿/干" width="110"><template #default="{ row }">{{ dash(row.wet) }} / {{ dash(row.dry) }}</template></el-table-column>
      <el-table-column prop="shipMode" label="装运" width="90" />
      <el-table-column prop="containerCount" label="柜数" width="70" />
      <el-table-column prop="stackCode" label="堆位" width="100" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canReceive(row)" link type="primary" @click="openReceive(row)">收货</el-button>
          <el-button v-else link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <el-dialog v-model="detailOpen" :title="`本票详情 · ${dash(detailRow?.customsNo || detailRow?.orderNo)}`" width="760px" align-center>
      <el-tabs v-model="detailTab">
        <el-tab-pane label="报关单" name="customs">
          <p>船名 {{ dash(detailRow?.shipName) }} · 提单 {{ dash(detailRow?.blNo) }} · 核注 {{ dash(detailRow?.checklistNo) }}</p>
          <p>金额 {{ money(detailRow?.amount, detailRow?.currency) }} · 堆位 {{ dash(detailRow?.stackCode) }} · 格子 {{ dash(detailRow?.cells) }}</p>
        </el-tab-pane>
        <el-tab-pane label="重量证书" name="weight">
          <p>湿重 {{ dash(detailRow?.wet) }} 吨 · 干重 {{ dash(detailRow?.dry) }} 吨 · 水分 {{ dash(detailRow?.moisture) }}</p>
        </el-tab-pane>
        <el-tab-pane label="品质证书" name="quality">
          <p>证书号 {{ dash(detailRow?.qualityNo) }}</p>
          <p>{{ detailRow ? qualityLine(detailRow) : '—' }}</p>
        </el-tab-pane>
        <el-tab-pane label="成品" name="product">
          <el-table :data="products" border>
            <el-table-column prop="prodBatch" label="成品批次" />
            <el-table-column prop="output" label="产量" />
            <el-table-column prop="stock" label="库存" />
            <el-table-column prop="outbound" label="出库" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
