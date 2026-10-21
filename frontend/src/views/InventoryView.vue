<script setup lang="ts">
import { onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { dictApi, inventoryApi, materialApi, partnerApi, shippingApi, warehouseApi } from '@/api'
import LotDetailDialog from '@/components/LotDetailDialog.vue'
import { dash, HOURS, qualityLine, tonText } from './ops/samples'

const route = useRoute()
const filters = reactive({
  keyword: '',
  consignor: '',
  cargoType: '',
  materialId: '',
  shipMode: '',
  stack: '',
  timeMode: '',
  from: '',
  fromHour: '00',
  to: '',
  toHour: '23',
  filingNo: '',
  warehouse: '',
})
const more = ref(false)
const consignors = ref<string[]>([])
const materials = ref<Record<string, unknown>[]>([])
const cargoTypes = ref<string[]>([])
const shipModes = ref<string[]>(['集装箱', '散货'])
const houses = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const ledgerOpen = ref(false)
const focus = ref('inbound')
const current = ref<Record<string, unknown> | null>(null)

function applyRoute() {
  const warehouse = route.query.warehouse
  const keyword = route.query.keyword || route.query.batchNo
  const stack = route.query.stack
  let changed = false
  if (typeof stack === 'string' && stack) {
    const next = {
      keyword: '', consignor: '', cargoType: '', materialId: '', shipMode: '', stack, timeMode: '',
      from: '', fromHour: '00', to: '', toHour: '23',
      filingNo: '', warehouse: '',
    }
    const same = (Object.keys(next) as (keyof typeof next)[]).every((key) => filters[key] === next[key])
    if (!same) {
      Object.assign(filters, next)
      changed = true
    }
    return changed
  }
  if (typeof warehouse === 'string' && warehouse && filters.warehouse !== warehouse) {
    filters.warehouse = warehouse
    more.value = true
    changed = true
  }
  if (typeof keyword === 'string' && keyword && filters.keyword !== keyword) {
    filters.keyword = keyword
    changed = true
  }
  return changed
}

function queryBody() {
  const query: Record<string, unknown> = {
    page: page.value,
    pageSize: pageSize.value,
    keyword: filters.keyword.trim(),
    consignor: filters.consignor,
    cargoType: filters.cargoType,
    materialId: filters.materialId,
    shipMode: filters.shipMode,
    stack: filters.stack.trim(),
    filingNo: filters.filingNo.trim(),
    warehouse: filters.warehouse,
  }
  if (filters.timeMode === 'month') query.timeMode = 'month'
  if (filters.timeMode === 'custom') {
    if (filters.from) query.from = `${filters.from} ${filters.fromHour}:00:00`
    if (filters.to) query.to = `${filters.to} ${filters.toHour}:59:59`
  }
  return query
}

async function load() {
  loading.value = true
  const res = await inventoryApi.list(queryBody())
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

function search() {
  page.value = 1
  load()
}

function reset() {
  Object.assign(filters, {
    keyword: '', consignor: '', cargoType: '', materialId: '', shipMode: '', stack: '', timeMode: '',
    from: '', fromHour: '00', to: '', toHour: '23',
    filingNo: '', warehouse: '',
  })
  search()
}

function materialLabel(row: Record<string, unknown>) {
  return [row.mineArea || row.name, row.originCountry].filter(Boolean).join(' · ') || String(row.id)
}

watch(() => [route.query.warehouse, route.query.keyword, route.query.batchNo, route.query.stack], () => {
  if (route.name !== 'inventory') return
  if (applyRoute()) search()
})

onActivated(() => {
  if (route.name === 'inventory' && applyRoute()) search()
})

onMounted(async () => {
  applyRoute()
  const [who, materialRes, shipRes, houseRes, categoryRes] = await Promise.all([
    partnerApi.consignors(),
    materialApi.list({ page: 1, pageSize: 500 }),
    shippingApi.list(),
    warehouseApi.catalog(),
    dictApi.labels('wms_item_category'),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (materialRes.success && materialRes.data) materials.value = materialRes.data.list
  if (shipRes.success && shipRes.data?.list.length) {
    shipModes.value = shipRes.data.list.map((row) => String(row.name)).filter(Boolean)
  }
  if (houseRes.success && houseRes.data) houses.value = houseRes.data.list.map((row) => String(row.code))
  if (categoryRes.success && Array.isArray(categoryRes.data)) cargoTypes.value = categoryRes.data
  load()
})

function customsOf(row: Record<string, unknown>) {
  return row.batchKind === '报关单号' ? String(row.batchNo) : '—'
}
function prodOf(row: Record<string, unknown>) {
  return row.batchKind === '生产批次号' ? String(row.batchNo) : '—'
}

async function openDetail(row: Record<string, unknown>, section = 'inbound') {
  focus.value = section
  current.value = { ...row }
  detailOpen.value = true
  detailLoading.value = true
  const res = await inventoryApi.detail(String(row.batchNo))
  detailLoading.value = false
  if (!detailOpen.value || !res.success || !res.data) return
  current.value = res.data
}

async function openLedger(row: Record<string, unknown>) {
  const res = await inventoryApi.detail(String(row.batchNo))
  current.value = res.success && res.data ? res.data : row
  ledgerOpen.value = true
}
</script>

<template>
  <div>
    <el-form :inline="true" class="query" @submit.prevent="search">
      <el-form-item label="单号">
        <el-input v-model="filters.keyword" clearable placeholder="报关单号 / 生产批次" style="width: 180px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="委托方">
        <el-select v-model="filters.consignor" clearable filterable style="width: 140px">
          <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
      <el-form-item label="货物类型">
        <el-select v-model="filters.cargoType" clearable style="width: 110px">
          <el-option v-for="item in cargoTypes" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="矿区">
        <el-select v-model="filters.materialId" clearable filterable style="width: 180px">
          <el-option v-for="row in materials" :key="String(row.id)" :label="materialLabel(row)" :value="String(row.id)" />
        </el-select>
      </el-form-item>
      <el-form-item label="装运方式">
        <el-select v-model="filters.shipMode" clearable style="width: 110px">
          <el-option v-for="item in shipModes" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="堆位">
        <el-input v-model="filters.stack" clearable placeholder="如 4#A1" style="width: 120px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="时间">
        <el-select v-model="filters.timeMode" style="width: 110px">
          <el-option label="不限" value="" />
          <el-option label="本月" value="month" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button link type="primary" @click="more = !more">{{ more ? '收起条件' : '更多条件' }}</el-button>
      </el-form-item>
    </el-form>

    <el-form v-show="more || filters.timeMode === 'custom'" :inline="true" class="query">
      <el-form-item v-if="filters.timeMode === 'custom'" label="起止">
        <div class="hours">
          <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" />
          <el-select v-model="filters.fromHour" style="width: 88px">
            <el-option v-for="hour in HOURS" :key="hour" :label="`${hour}时`" :value="hour" />
          </el-select>
          <span>至</span>
          <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" />
          <el-select v-model="filters.toHour" style="width: 88px">
            <el-option v-for="hour in HOURS" :key="`t${hour}`" :label="`${hour}时`" :value="hour" />
          </el-select>
        </div>
      </el-form-item>
      <el-form-item label="矿源备案号">
        <el-input v-model="filters.filingNo" clearable placeholder="备案号" style="width: 150px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="仓库">
        <el-select v-model="filters.warehouse" clearable filterable style="width: 130px">
          <el-option v-for="name in houses" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column label="报关单号" min-width="170" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button v-if="customsOf(row) !== '—'" link type="primary" @click="openDetail(row, 'inbound')">{{ customsOf(row) }}</el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="生产批次" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button v-if="prodOf(row) !== '—'" link type="primary" @click="openDetail(row, 'production')">{{ prodOf(row) }}</el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="consignor" label="委托方" min-width="200" show-overflow-tooltip />
      <el-table-column prop="material" label="矿区" min-width="140" show-overflow-tooltip />
      <el-table-column prop="cargoType" label="货物类型" min-width="130" show-overflow-tooltip />
      <el-table-column label="矿源备案号" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ dash(row.filingNo) }}</template></el-table-column>
      <el-table-column label="本票品质" min-width="240" show-overflow-tooltip><template #default="{ row }">{{ qualityLine(row) }}</template></el-table-column>
      <el-table-column prop="originCountry" label="原产国" min-width="100" />
      <el-table-column prop="warehouse" label="仓库" min-width="120" show-overflow-tooltip />
      <el-table-column label="堆位" min-width="110"><template #default="{ row }">{{ row.status === '已出库' ? '—' : dash(row.stackText) }}</template></el-table-column>
      <el-table-column prop="areaLabel" label="片区标识" min-width="110" />
      <el-table-column label="湿重" min-width="110"><template #default="{ row }">{{ tonText(row.wet) }}</template></el-table-column>
      <el-table-column label="干重" min-width="110"><template #default="{ row }">{{ tonText(row.dry) }}</template></el-table-column>
      <el-table-column prop="inDate" label="入库时间" min-width="170" />
      <el-table-column prop="status" label="状态" width="90" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row, 'inbound')">详情</el-button>
          <el-button link type="primary" @click="openLedger(row)">台账</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </div>

    <LotDetailDialog
      v-model="detailOpen"
      v-model:ledger="ledgerOpen"
      :lot="current"
      :loading="detailLoading"
      :focus="focus"
      @open-batch="(batch, section) => openDetail({ batchNo: batch }, section || 'inbound')"
    />
  </div>
</template>

<style scoped>
.query { margin-bottom: 4px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.hours { display: flex; gap: 8px; align-items: center; }
</style>
