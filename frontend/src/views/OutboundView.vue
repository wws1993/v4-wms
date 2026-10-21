<script setup lang="ts">
import { onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { bondedApi, inventoryApi, ocrApi, outboundApi, partnerApi } from '@/api'
import { dash, money } from './ops/samples'

const route = useRoute()
const filters = reactive({ consignor: '', status: '', from: '', to: '', keyword: '' })
const consignors = ref<string[]>([])
const books = ref<Record<string, unknown>[]>([])
const batches = ref<Record<string, unknown>[]>([])
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

async function load() {
  loading.value = true
  const res = await outboundApi.list({ ...filters, page: page.value, pageSize: 10 })
  loading.value = false
  if (!res.success || !res.data) return
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

onMounted(async () => {
  const [who, bookRes, lotRes] = await Promise.all([
    partnerApi.consignors(),
    bondedApi.list({ page: 1, pageSize: 50 }),
    inventoryApi.list({ page: 1, pageSize: 100, status: '在库', kind: '成品' }),
  ])
  if (who.success && who.data) consignors.value = who.data
  if (bookRes.success && bookRes.data) {
    books.value = bookRes.data.list.filter((row) => row.status === '在用' || row.status === '新账' || row.status === '有效')
  }
  if (lotRes.success && lotRes.data) batches.value = lotRes.data.list.filter((row) => row.cargoType === '混成品')
  applyKeyword()
  load()
})

function reset() {
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, {
    consignor: '广西南国', consignee: '', consumer: '', customsNo: '', checklistNo: '',
    bondedBook: books.value[0]?.code || '', batchNo: batches.value[0]?.batchNo || '',
    wet: '', amount: '', currency: 'USD', time: '', remark: '',
  })
  recognized.value = false
  ocrStatus.value = '请先上传出库报关单'
  open.value = true
}

async function runOcr(file?: File) {
  if (!file) {
    ElMessage.warning('请选择出库报关单文件')
    return
  }
  if (!form.batchNo) form.batchNo = batches.value[0]?.batchNo || ''
  const res = await ocrApi.recognize({ docType: '出库报关单', fileName: file.name, __file: file, customsNo: form.customsNo })
  if (res.success && res.data) {
    const data = res.data as Record<string, unknown>
    for (const key of ['customsNo', 'checklistNo', 'consignee', 'consumer', 'wet', 'amount', 'currency']) {
      if (data[key] != null && data[key] !== '') form[key] = data[key]
    }
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
  if (!form.consignor || !form.consignee || !form.consumer || !form.customsNo || !form.checklistNo || !form.batchNo || !form.wet) {
    ElMessage.warning('请补全必填字段')
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

async function approve(row: Record<string, unknown>) {
  const res = await outboundApi.approve(String(row.id))
  if (!res.success) ElMessage.error(res.message)
  else ElMessage.success(res.message)
  load()
}

async function complete(row: Record<string, unknown>) {
  const res = await outboundApi.complete(String(row.id))
  if (!res.success) ElMessage.error(res.message)
  else ElMessage.success(res.message)
  load()
}
</script>

<template>
  <div>
    <el-form :inline="true">
      <el-form-item label="单号"><el-input v-model="filters.keyword" clearable placeholder="报关单 / 批次 / 出库单" style="width: 200px" /></el-form-item>
      <el-form-item label="委托方"><el-select v-model="filters.consignor" clearable style="width: 140px"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option label="待审核" value="待审核" /><el-option label="已审核" value="已审核" /><el-option label="已出库" value="已出库" />
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
      <el-table-column prop="remark" label="备注" min-width="120" />
      <el-table-column label="出库/完成时间" min-width="180"><template #default="{ row }">{{ dash(row.time) }} / {{ dash(row.finishedAt) }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="90" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === '待审核'" link type="primary" @click="approve(row)">审核</el-button>
          <el-button v-if="row.status === '已审核'" link type="primary" @click="complete(row)">出库完成</el-button>
          <el-button link type="primary" @click="current = row; detailOpen = true">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pager"><el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" background @current-change="load" /></div>

    <el-dialog v-model="open" title="新建出库订单" width="820px" align-center>
      <div class="ocr">
        <el-tag>出库报关单</el-tag>
        <el-tag type="warning">必传</el-tag>
        <el-button size="small" @click="outboundFile?.click()">上传报关单</el-button>
        <input ref="outboundFile" class="file" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onOutboundFile" />
        <span>{{ ocrStatus }}</span>
      </div>
      <el-form label-width="120px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="委托方"><el-select v-model="form.consignor"><el-option v-for="name in consignors" :key="name" :label="name" :value="name" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="流向企业"><el-input v-model="form.consignee" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="消费使用单位"><el-input v-model="form.consumer" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库报关单号"><el-input v-model="form.customsNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="匹配保税账册"><el-select v-model="form.bondedBook"><el-option v-for="book in books" :key="String(book.id)" :label="String(book.code)" :value="String(book.code)" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="核注清单号"><el-input v-model="form.checklistNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生产批次"><el-select v-model="form.batchNo"><el-option v-for="item in batches" :key="String(item.batchNo)" :label="`${item.batchNo} ${item.material}`" :value="String(item.batchNo)" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="出库重量"><el-input v-model="form.wet" type="number" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="报关单金额">
              <div class="currency">
                <el-select v-model="form.currency" style="width: 120px"><el-option label="人民币 ¥" value="CNY" /><el-option label="美元 $" value="USD" /></el-select>
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
        <el-button type="primary" @click="save">提交审核</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="出库详情" width="640px" align-center>
      <p>单号 {{ dash(current?.orderNo || current?.id) }} · 状态 {{ dash(current?.status) }}</p>
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
</style>
