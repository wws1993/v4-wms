<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inboundApi, inventoryApi, materialApi, partnerApi, warehouseApi } from '@/api'
import LotDetailDialog from '@/components/LotDetailDialog.vue'
import { dash, money } from './ops/samples'
import InboundWizard from './inbound/InboundWizard.vue'

const route = useRoute()
const filters = reactive({ consignor: '', status: '', shipMode: '', from: '', to: '', keyword: '' })
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const consignors = ref<string[]>([])
const materials = ref<Record<string, unknown>[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const shipModes = ref<string[]>([])
const oreTypes = ref<string[]>([])
const statuses = ref<string[]>(['暂存码头', '待收货', '已入库', '混成品'])
const currencies = ref<{ label: string; value: string }[]>([{ label: '人民币 ¥', value: 'CNY' }, { label: '美元 $', value: 'USD' }])
const wizard = ref<{ start: number; seed: Record<string, unknown> | null; key: number } | null>(null)
const detailOpen = ref(false)
const detailLoading = ref(false)
const ledgerOpen = ref(false)
const focus = ref('inbound')
const current = ref<Record<string, unknown> | null>(null)

const shipOptions = computed(() => shipModes.value)

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

async function loadAllStacks() {
  const rows: Record<string, unknown>[] = []
  for (let page = 1; page <= 20; page += 1) {
    const res = await warehouseApi.stacks({ page, pageSize: 200 })
    if (!res.success || !res.data?.list.length) break
    rows.push(...res.data.list)
    if (rows.length >= Number(res.data.total || rows.length)) break
  }
  return rows
}

function applyKeyword() {
  if (route.name !== 'inbound') return false
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

onMounted(async () => {
  const [who, materialRes, stackRes] = await Promise.all([
    partnerApi.consignors(),
    materialApi.list({ page: 1, pageSize: 100 }),
    loadAllStacks(),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (materialRes.success && materialRes.data) materials.value = materialRes.data.list
  if (stackRes.length) stacks.value = stackRes
  const [statusRes, currencyRes, shipRes, oreRes] = await Promise.all([
    dictApi.labels('wms_receipt_status'),
    dictApi.data({ type: 'wms_currency_type', page: 1, pageSize: 20 }),
    dictApi.labels('wms_translate_type'),
    dictApi.labels('wms_mineral_type'),
  ])
  if (statusRes.success && statusRes.data?.length) statuses.value = statusRes.data
  if (currencyRes.success && currencyRes.data?.list.length) {
    currencies.value = currencyRes.data.list
      .filter((row) => String(row.status || '正常') !== '停用')
      .map((row) => ({ label: String(row.label), value: String(row.value) }))
  }
  if (shipRes.success && shipRes.data?.length) shipModes.value = shipRes.data
  if (oreRes.success && oreRes.data?.length) oreTypes.value = oreRes.data
  applyKeyword()
  load()
})

function openCreate() {
  wizard.value = { start: 0, seed: null, key: Date.now() }
}

async function receiptOf(row: Record<string, unknown>) {
  const id = String(row.id || '')
  if (!id) return row
  const res = await inboundApi.get(id)
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '入库单详情加载失败')
    return null
  }
  return res.data
}

async function openReceive(row: Record<string, unknown>) {
  loading.value = true
  const detail = await receiptOf(row)
  loading.value = false
  if (!detail) return
  wizard.value = { start: 2, seed: { ...detail, category: '原料' }, key: Date.now() }
}

function closeWizard() {
  wizard.value = null
}

function finishWizard() {
  wizard.value = null
  load()
}

function lotFromInbound(row: Record<string, unknown>) {
  return {
    ...row,
    batchNo: row.batchNo || row.customsNo || row.orderNo,
    batchKind: row.customsNo ? '报关单号' : '入库单号',
    stackText: row.stackCode,
    docs: {
      customs: { image: '', name: '' },
      weight: { image: '', name: '' },
      quality: { image: '', name: '' },
    },
    products: [],
    ledger: row.time ? [{ time: row.time, action: '入库', wet: row.wet, dry: row.dry, stack: row.stackCode, consignee: '' }] : [],
  }
}

async function openDetail(row: Record<string, unknown>, section = 'inbound') {
  focus.value = section
  // 列表行已是入库单摘要，不再额外 get；入场记录由弹窗直接用本行，避免 list/get 重复打同一单据。
  const base = lotFromInbound(row)
  current.value = base
  detailOpen.value = true
  detailLoading.value = true
  const batchNo = String(base.batchNo || row.customsNo || row.batchNo || '')
  if (batchNo) {
    const res = await inventoryApi.detail(batchNo)
    if (detailOpen.value && res.success && res.data) current.value = res.data
  }
  detailLoading.value = false
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
    :stacks="stacks"
    :ship-modes="shipOptions"
    :ore-types="oreTypes"
    :currencies="currencies"
    :start="wizard.start"
    :seed="wizard.seed"
    @close="closeWizard"
    @done="finishWizard"
  />
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
      <el-form-item label="货运方式">
        <el-select v-model="filters.shipMode" clearable style="width: 140px">
          <el-option v-for="item in shipOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始"><el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="结束"><el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" /></el-form-item>
      <el-form-item label="关键字"><el-input v-model="filters.keyword" placeholder="单号 / 船名 / 提单" clearable /></el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建入库预约</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <!-- <el-table-column label="单号" min-width="150"><template #default="{ row }">{{ dash(row.orderNo || row.id) }}</template></el-table-column> -->
      <el-table-column label="报关单号" min-width="150">
        <template #default="{ row }">
          <el-button v-if="row.customsNo" link type="primary" @click="openDetail(row, 'inbound')">{{ row.customsNo }}</el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="consignor" label="委托方" width="200" />
      <el-table-column prop="material" label="矿区" min-width="120" />
      <el-table-column prop="shipName" label="船名" width="110" />
      <el-table-column prop="blNo" label="提单号" min-width="140" />
      <el-table-column prop="checklistNo" label="核注清单号" width="200" />
      <el-table-column label="金额" width="130"><template #default="{ row }">{{ money(row.amount, row.currency) }}</template></el-table-column>
      <el-table-column label="提货重量" width="110"><template #default="{ row }">{{ dash(row.blWeight) }}</template></el-table-column>
      <el-table-column label="湿/干" width="200"><template #default="{ row }">{{ dash(row.wet) }} / {{ dash(row.dry) }}</template></el-table-column>
      <el-table-column prop="shipMode" label="货运方式" width="100" />
      <el-table-column prop="containerCount" label="柜数" width="70" />
      <el-table-column prop="stackCode" label="堆位" width="100" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="操作时间" width="170" fixed="right"><template #default="{ row }">{{ dash(row.operateTime || row.time) }}</template></el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canReceive(row)" link type="primary" @click="openReceive(row)">收货</el-button>
          <el-button v-else link type="primary" @click="openDetail(row, 'inbound')">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <LotDetailDialog
      v-model="detailOpen"
      v-model:ledger="ledgerOpen"
      :lot="current"
      :loading="detailLoading"
      :focus="focus"
      @open-batch="(batch, section) => openDetail({ batchNo: batch, customsNo: batch }, section || 'inbound')"
    />
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
