<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { bondedApi, inventoryApi, partnerApi } from '@/api'
import { dash, HOURS, qualityLine } from './ops/samples'
import { downloadText } from '@/mock/util'

const router = useRouter()
const filters = reactive({
  consignor: '', cargoType: '', filingNo: '', kind: '', originCountry: '', book: '', stack: '',
  timeMode: 'custom', from: '', fromHour: '00', to: '', toHour: '23',
})
const consignors = ref<string[]>([])
const books = ref<string[]>([])
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const detailOpen = ref(false)
const ledgerOpen = ref(false)
const detailTab = ref('customs')
const current = ref<Record<string, unknown> | null>(null)
const ledger = ref<Record<string, unknown>[]>([])
const products = ref<Record<string, unknown>[]>([])

async function load() {
  loading.value = true
  const query: Record<string, unknown> = {
    page: page.value, pageSize: 10,
    consignor: filters.consignor, cargoType: filters.cargoType, filingNo: filters.filingNo,
    kind: filters.kind, originCountry: filters.originCountry, book: filters.book, stack: filters.stack, keyword: filters.stack,
  }
  if (filters.timeMode === 'month') query.timeMode = 'month'
  else {
    query.from = filters.from
    query.to = filters.to
  }
  const res = await inventoryApi.list(query)
  loading.value = false
  if (!res.success || !res.data) return
  rows.value = res.data.list
  total.value = res.data.total
}

onMounted(async () => {
  const [who, bookRes] = await Promise.all([partnerApi.consignors(), bondedApi.list({ page: 1, pageSize: 100 })])
  if (who.success && who.data) consignors.value = who.data
  if (bookRes.success && bookRes.data) books.value = bookRes.data.list.map((row) => String(row.code))
  load()
})

function customsOf(row: Record<string, unknown>) {
  return row.batchKind === '报关单号' ? String(row.batchNo) : '—'
}
function prodOf(row: Record<string, unknown>) {
  return row.batchKind === '生产批次号' ? String(row.batchNo) : '—'
}

async function openDetail(row: Record<string, unknown>) {
  const res = await inventoryApi.detail(String(row.batchNo))
  current.value = res.success && res.data ? res.data : row
  products.value = (current.value?.products as Record<string, unknown>[]) || []
  detailTab.value = 'customs'
  detailOpen.value = true
}

async function openLedger(row: Record<string, unknown>) {
  const res = await inventoryApi.detail(String(row.batchNo))
  current.value = res.success && res.data ? res.data : row
  ledger.value = (current.value?.ledger as Record<string, unknown>[]) || []
  ledgerOpen.value = true
}

function exportLedger() {
  const lines = ['时间,业务,湿吨,干吨,堆位,流向企业', ...ledger.value.map((row) => [row.time, row.action, row.wet, row.dry, row.stack, row.consignee].join(','))]
  downloadText(`${current.value?.batchNo || '台账'}.csv`, lines.join('\n'))
}
</script>

<template>
  <div>
    <el-form :inline="true">
      <el-form-item label="委托方"><el-select v-model="filters.consignor" clearable style="width: 130px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
      <el-form-item label="货物类型"><el-select v-model="filters.cargoType" clearable style="width: 110px"><el-option v-for="item in ['达标矿', '报备矿', '混成品']" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      <el-form-item label="矿源备案号"><el-input v-model="filters.filingNo" placeholder="如 JG-2023-KY04" clearable /></el-form-item>
      <el-form-item label="物料类型"><el-select v-model="filters.kind" clearable style="width: 100px"><el-option label="原料" value="原料" /><el-option label="成品" value="成品" /></el-select></el-form-item>
      <el-form-item label="原产国"><el-select v-model="filters.originCountry" clearable style="width: 110px"><el-option v-for="item in ['智利', '秘鲁', '澳大利亚', '—']" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      <el-form-item label="保税账册"><el-select v-model="filters.book" clearable style="width: 140px"><el-option v-for="code in books" :key="code" :label="code" :value="code" /></el-select></el-form-item>
      <el-form-item label="堆位"><el-input v-model="filters.stack" placeholder="如 4#A1" clearable /></el-form-item>
      <el-form-item label="时间">
        <el-select v-model="filters.timeMode" style="width: 110px"><el-option label="本月" value="month" /><el-option label="自定义" value="custom" /></el-select>
      </el-form-item>
      <el-form-item v-if="filters.timeMode === 'custom'" label="起止">
        <div class="hours">
          <el-date-picker v-model="filters.from" type="date" value-format="YYYY-MM-DD" />
          <el-select v-model="filters.fromHour" style="width: 88px"><el-option v-for="hour in HOURS" :key="hour" :label="`${hour}时`" :value="hour" /></el-select>
          <span>至</span>
          <el-date-picker v-model="filters.to" type="date" value-format="YYYY-MM-DD" />
          <el-select v-model="filters.toHour" style="width: 88px"><el-option v-for="hour in HOURS" :key="`t${hour}`" :label="`${hour}时`" :value="hour" /></el-select>
        </div>
      </el-form-item>
      <el-form-item><el-button type="primary" @click="page = 1; load()">查询</el-button></el-form-item>
    </el-form>
    <div class="toolbar">
      <el-button @click="router.push('/alert-logs')">预警日志</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column label="报关单号" min-width="160"><template #default="{ row }">{{ customsOf(row) }}</template></el-table-column>
      <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ prodOf(row) }}</template></el-table-column>
      <el-table-column prop="consignor" label="委托方" width="100" />
      <el-table-column prop="material" label="物料" width="110" />
      <el-table-column prop="cargoType" label="货物类型" width="100" />
      <el-table-column label="矿源备案号" width="130"><template #default="{ row }">{{ dash(row.filingNo) }}</template></el-table-column>
      <el-table-column label="本票品质" min-width="220"><template #default="{ row }">{{ qualityLine(row) }}</template></el-table-column>
      <el-table-column prop="originCountry" label="原产国" width="90" />
      <el-table-column label="账册" width="120"><template #default="{ row }">{{ dash(row.book) }}</template></el-table-column>
      <el-table-column label="堆位" width="100"><template #default="{ row }">{{ row.status === '已出库' ? '—' : dash(row.stackText) }}</template></el-table-column>
      <el-table-column prop="areaLabel" label="片区标识" width="100" />
      <el-table-column prop="wet" label="湿重" width="80" />
      <el-table-column prop="dry" label="干重" width="80" />
      <el-table-column prop="inDate" label="入库时间" width="120" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" @click="openLedger(row)">台账</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <el-dialog v-model="detailOpen" :title="`本票详情 · ${dash(current?.batchNo)}`" width="760px" align-center>
      <el-tabs v-model="detailTab">
        <el-tab-pane label="报关单" name="customs">
          <p>委托方 {{ dash(current?.consignor) }} · 物料 {{ dash(current?.material) }} · 货物类型 {{ dash(current?.cargoType) }}</p>
          <p>原产国 {{ dash(current?.originCountry) }} · 堆位 {{ dash(current?.stackText) }} · 片区 {{ dash(current?.areaLabel) }}</p>
        </el-tab-pane>
        <el-tab-pane label="重量证书" name="weight"><p>湿重 {{ dash(current?.wet) }} 吨 · 干重 {{ dash(current?.dry) }} 吨</p></el-tab-pane>
        <el-tab-pane label="品质证书" name="quality"><p>{{ current ? qualityLine(current) : '—' }}</p></el-tab-pane>
        <el-tab-pane label="成品" name="product">
          <el-table :data="products" border empty-text="本票暂无成品去向">
            <el-table-column prop="prodBatch" label="生产批次号" />
            <el-table-column prop="output" label="产量" />
            <el-table-column prop="stock" label="库存" />
            <el-table-column prop="outbound" label="出库" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="detailOpen = false">关闭</el-button>
        <el-button type="primary" @click="detailOpen = false; current && openLedger(current)">查看台账</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ledgerOpen" :title="`重量台账 · ${dash(current?.batchNo)}`" width="860px" align-center>
      <el-table :data="ledger" border empty-text="暂无台账">
        <el-table-column prop="time" label="时间" min-width="150" />
        <el-table-column prop="action" label="业务类型" width="110" />
        <el-table-column prop="consignee" label="流向企业" min-width="120" />
        <el-table-column prop="stack" label="堆位" width="100" />
        <el-table-column prop="wet" label="湿重" width="80" />
        <el-table-column prop="dry" label="干重" width="80" />
      </el-table>
      <template #footer>
        <el-button @click="ledgerOpen = false">关闭</el-button>
        <el-button type="primary" @click="exportLedger">导出台账</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.hours { display: flex; gap: 8px; align-items: center; }
</style>
