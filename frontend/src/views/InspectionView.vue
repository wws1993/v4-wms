<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { partnerApi, productionApi } from '@/api'
import ImageUpload from '@/components/ImageUpload.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { dash } from './ops/samples'

type Doc = Record<string, unknown>

const filters = reactive({ keyword: '', consignor: '' })
const consignors = ref<string[]>([])
const rows = ref<Doc[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const dialogOpen = ref(false)
const saving = ref(false)
const lots = ref<Doc[]>([])
const lotsLoading = ref(false)
const lotKeyword = ref('')
const files = ref<File[]>([])
const form = reactive({
  id: '',
  productionOrderId: '',
  prodBatch: '',
  orderNo: '',
  consignor: '',
  stackCode: '',
  customsNos: '',
  outputDry: '',
  remark: '',
  fileUrl: '',
  attachmentUrls: [] as string[],
  attachmentNames: [] as string[],
})

function num(value: unknown) {
  const parsed = Number(value || 0)
  return parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

async function load() {
  loading.value = true
  const res = await productionApi.inspections({
    page: page.value,
    pageSize: pageSize.value,
    keyword: filters.keyword || undefined,
    consignor: filters.consignor || undefined,
  })
  loading.value = false
  if (!res.success || !res.data) {
    rows.value = []
    total.value = 0
    if (!res.success) ElMessage.error(res.message || '加载送检记录失败')
    return false
  }
  rows.value = res.data.list
  total.value = res.data.total
  return true
}

function attachmentLinks(row: Doc) {
  const urls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls.map(String).filter(Boolean) : []
  const names = Array.isArray(row.attachmentNames) ? row.attachmentNames.map(String) : []
  return urls.map((url, index) => ({ url, name: names[index] || '' }))
}

function resetForm() {
  form.id = ''
  form.productionOrderId = ''
  form.prodBatch = ''
  form.orderNo = ''
  form.consignor = ''
  form.stackCode = ''
  form.customsNos = ''
  form.outputDry = ''
  form.remark = ''
  form.fileUrl = ''
  form.attachmentUrls = []
  form.attachmentNames = []
  files.value = []
  lotKeyword.value = ''
  lots.value = []
}

async function loadLots() {
  lotsLoading.value = true
  const res = await productionApi.inspectLots({
    keyword: lotKeyword.value.trim() || undefined,
    page: 1,
  })
  lotsLoading.value = false
  if (!res.success || !res.data) {
    lots.value = []
    if (!res.success) ElMessage.error(res.message || '加载待检区票货失败')
    return
  }
  lots.value = res.data.list
}

function pickLot(row: Doc) {
  if (form.id) return
  form.productionOrderId = String(row.productionOrderId || row.id || '')
  form.prodBatch = String(row.prodBatch || '')
  form.orderNo = String(row.orderNo || '')
  form.consignor = String(row.consignor || '')
  form.stackCode = String(row.stackCode || '')
  form.customsNos = String(row.customsNos || '')
  form.outputDry = String(row.outputDry ?? '')
}

async function createInspection() {
  resetForm()
  dialogOpen.value = true
  await loadLots()
}

async function editInspection(row: Doc) {
  resetForm()
  form.id = String(row.id || '')
  form.productionOrderId = String(row.productionOrderId || '')
  form.prodBatch = String(row.prodBatch || '')
  form.orderNo = String(row.orderNo || '')
  form.consignor = String(row.consignor || '')
  form.stackCode = String(row.stackCode || '')
  form.customsNos = String(row.customsNos || '')
  form.outputDry = String(row.outputDry ?? '')
  form.remark = String(row.remark || '')
  form.fileUrl = String(row.fileUrl || '')
  form.attachmentUrls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls.map(String) : []
  form.attachmentNames = Array.isArray(row.attachmentNames) ? row.attachmentNames.map(String) : []
  dialogOpen.value = true
  if (!form.prodBatch && form.id) {
    const res = await productionApi.getInspection(form.id)
    if (res.success && res.data) {
      const detail = res.data
      form.productionOrderId = String(detail.productionOrderId || form.productionOrderId)
      form.prodBatch = String(detail.prodBatch || '')
      form.orderNo = String(detail.orderNo || '')
      form.consignor = String(detail.consignor || '')
      form.stackCode = String(detail.stackCode || '')
      form.customsNos = String(detail.customsNos || '')
      form.outputDry = String(detail.outputDry ?? '')
      form.remark = String(detail.remark || '')
      form.fileUrl = String(detail.fileUrl || '')
      form.attachmentUrls = Array.isArray(detail.attachmentUrls) ? detail.attachmentUrls.map(String) : []
      form.attachmentNames = Array.isArray(detail.attachmentNames) ? detail.attachmentNames.map(String) : []
    }
  }
}

async function saveInspection() {
  if (!form.productionOrderId) {
    ElMessage.warning('请选择待检区票货')
    return
  }
  if (!form.id && !files.value.length && !form.fileUrl) {
    ElMessage.warning('请上传附件')
    return
  }
  saving.value = true
  const body = {
    productionOrderId: form.productionOrderId,
    prodBatch: form.prodBatch,
    remark: form.remark,
    fileUrl: form.fileUrl,
    __files: files.value,
  }
  const res = form.id
    ? await productionApi.updateInspection(form.id, body)
    : await productionApi.createInspection(body)
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || (form.id ? '已保存' : '送检已完成'))
  dialogOpen.value = false
  await load()
}

async function search() {
  page.value = 1
  const done = await load()
  if (!done) return
  ElMessage.success(total.value ? `已查询，共 ${total.value} 条` : '该条件下暂无送检记录')
}

async function changePageSize(size: number) {
  pageSize.value = size
  page.value = 1
  await load()
}

onMounted(async () => {
  const partnerRes = await partnerApi.consignors()
  if (partnerRes.success && Array.isArray(partnerRes.data) && partnerRes.data.length) {
    consignors.value = partnerRes.data
  }
  await load()
})
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="createInspection">新增送检</el-button>
    </div>
    <el-form :inline="true" @submit.prevent="search">
      <el-form-item label="单号">
        <el-input v-model="filters.keyword" clearable placeholder="生产批次 / 报关单" style="width: 180px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="委托方">
        <el-select v-model="filters.consignor" clearable placeholder="全部" style="width: 140px">
          <el-option v-for="name in consignors" :key="name" :label="name" :value="name" />
        </el-select>
      </el-form-item>
      <el-form-item><el-button type="primary" @click="search">查询</el-button></el-form-item>
    </el-form>
    <el-table v-loading="loading" :data="rows" border stripe empty-text="暂无送检记录">
      <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
      <el-table-column prop="orderNo" label="完工单号" min-width="140" />
      <el-table-column prop="consignor" label="委托方" width="120" />
      <el-table-column label="关联报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNos) }}</template></el-table-column>
      <el-table-column prop="stackCode" label="堆位" width="100" />
      <el-table-column label="产量(干吨)" width="110"><template #default="{ row }">{{ num(row.outputDry) }}</template></el-table-column>
      <el-table-column prop="time" label="送检时间" min-width="150" />
      <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
      <el-table-column label="附件" min-width="160">
        <template #default="{ row }">
          <div class="attach-links">
            <ImageViewer
              v-for="(item, index) in attachmentLinks(row)"
              :key="item.url"
              variant="link"
              :label="attachmentLinks(row).length > 1 ? `查看附件${index + 1}` : '查看附件'"
              :src="item.url"
              :name="item.name"
              title="送检附件"
            />
            <span v-if="!attachmentLinks(row).length">{{ row.attachment || '—' }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="80">
        <template #default="{ row }">
          <el-button link type="primary" @click="editInspection(row)">编辑</el-button>
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
        @size-change="changePageSize"
      />
    </div>

    <el-dialog v-model="dialogOpen" :title="form.id ? '编辑抽样送检' : '新增抽样送检'" width="980px" align-center>
      <p class="hint">选择一条待检区票货，上传附件并填写备注后完成。编辑时不可更换票货。</p>
      <template v-if="form.id">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="生产批次"><el-input :model-value="form.prodBatch" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="完工单号"><el-input :model-value="form.orderNo" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="委托方"><el-input :model-value="form.consignor" disabled /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="堆位"><el-input :model-value="form.stackCode" disabled /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="关联报关单号"><el-input :model-value="form.customsNos" disabled /></el-form-item></el-col>
        </el-row>
      </template>
      <template v-else>
        <div class="panel-title">选择待检区票货</div>
        <el-form :inline="true" @submit.prevent="loadLots">
          <el-form-item label="关键词">
            <el-input v-model="lotKeyword" clearable placeholder="生产批次 / 报关单 / 堆位" style="width: 220px" @keyup.enter="loadLots" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="loadLots">查询</el-button></el-form-item>
        </el-form>
        <el-table
          v-loading="lotsLoading"
          :data="lots"
          border
          max-height="280"
          highlight-current-row
          empty-text="暂无待检区票货"
          @row-click="pickLot"
        >
          <el-table-column label="选择" width="70">
            <template #default="{ row }">
              <el-radio :model-value="form.productionOrderId" :value="String(row.productionOrderId || row.id)" @click.stop="pickLot(row)" />
            </template>
          </el-table-column>
          <el-table-column label="生产批次" min-width="130"><template #default="{ row }">{{ dash(row.prodBatch) }}</template></el-table-column>
          <el-table-column prop="orderNo" label="完工单号" min-width="140" />
          <el-table-column prop="consignor" label="委托方" width="110" />
          <el-table-column label="关联报关单号" min-width="160"><template #default="{ row }">{{ dash(row.customsNos) }}</template></el-table-column>
          <el-table-column prop="stackCode" label="堆位" width="100" />
          <el-table-column label="产量(干吨)" width="110"><template #default="{ row }">{{ num(row.outputDry) }}</template></el-table-column>
        </el-table>
      </template>
      <el-form-item label="附件" required class="remark">
        <ImageUpload v-model="files" multiple :src="form.attachmentUrls[0]" />
        <div v-if="form.id && form.attachmentUrls.length && !files.length" class="attach-links">
          <ImageViewer
            v-for="(url, index) in form.attachmentUrls"
            :key="url"
            variant="link"
            :label="form.attachmentUrls.length > 1 ? `已有附件${index + 1}` : '已有附件'"
            :src="url"
            :name="form.attachmentNames[index] || ''"
            title="送检附件"
          />
        </div>
      </el-form-item>
      <el-form-item label="备注" class="remark"><el-input v-model="form.remark" type="textarea" :rows="3" placeholder="选填" /></el-form-item>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveInspection">{{ form.id ? '保存' : '完成' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.hint { color: #5a6a7e; margin: 0 0 12px; }
.panel-title { margin: 16px 0 8px; font-weight: 600; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.attach-links { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.remark { margin-top: 8px; }
</style>
