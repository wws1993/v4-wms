<script setup lang="ts">
import { onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ocrApi } from '@/api'

const route = useRoute()
const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({
  docType: '',
  status: '',
  keyword: '',
})
const recognizeOpen = ref(false)
const recognizing = ref(false)
const docType = ref('入库报关单')
const fileName = ref('')
const pickedFile = ref<File | null>(null)
const open = ref(false)
const current = ref<Record<string, unknown> | null>(null)
const form = reactive<Record<string, string>>({})
const types = ['入库报关单', '出库报关单', '品质单', '重量单']
const statuses = ['待修正', '已回填', '已归档']
const labels: Record<string, string> = {
  customsNo: '报关单号', checklistNo: '核注清单号', shipName: '船名', blNo: '提单号', blWeight: '提单重量', amount: '金额',
  currency: '币种', consignee: '流向企业', consumer: '消费使用单位', wet: '湿重', dry: '干重',
  moisture: '水分', qualityNo: '证书号', cu: '铜', ag: '银', au: '金',
}

function labelOf(key: string) {
  return labels[key] || key
}

function applyKeyword() {
  if (route.name !== 'ocr') return false
  const next = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (filters.keyword === next) return false
  filters.keyword = next
  return true
}

function query() {
  const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value }
  if (filters.docType) params.docType = filters.docType
  if (filters.status) params.status = filters.status
  if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
  return params
}

async function load() {
  loading.value = true
  const res = await ocrApi.list(query())
  loading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '加载失败')
    rows.value = []
    total.value = 0
    return
  }
  rows.value = res.data.list
  total.value = res.data.total
}

function search() {
  page.value = 1
  load()
}

function openRecognize() {
  docType.value = '入库报关单'
  fileName.value = ''
  pickedFile.value = null
  recognizeOpen.value = true
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  pickedFile.value = input.files?.[0] || null
  fileName.value = pickedFile.value?.name || ''
}

async function start() {
  if (!pickedFile.value) {
    ElMessage.warning('请选择要识别的文件')
    return
  }
  recognizing.value = true
  const res = await ocrApi.recognize({
    docType: docType.value,
    fileName: pickedFile.value.name || fileName.value || `${docType.value}.pdf`,
    __file: pickedFile.value,
  })
  recognizing.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
  recognizeOpen.value = false
  openFix(res.data as Record<string, unknown>)
  load()
}

function openFix(row: Record<string, unknown>) {
  current.value = row
  Object.keys(form).forEach((key) => delete form[key])
  for (const key of Object.keys(labels)) {
    if (row[key] != null && row[key] !== '') form[key] = String(row[key])
  }
  open.value = true
}

async function save(archiveOnly: boolean) {
  if (!current.value) return
  const res = await ocrApi.update(String(current.value.id), {
    ...form,
    archiveOnly,
    orderId: current.value.orderId,
    ocrLogType: current.value.ocrLogType,
    fileName: current.value.fileName,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(archiveOnly ? '已归档附件' : '已回填并归档')
  open.value = false
  load()
}

watch(() => route.query.keyword, () => {
  if (applyKeyword()) search()
})

onActivated(() => {
  if (applyKeyword()) search()
})

onMounted(() => {
  applyKeyword()
  load()
})
</script>

<template>
  <div class="ocr-page">
    <el-form :inline="true" @submit.prevent="search">
      <el-form-item label="单据类型">
        <el-select v-model="filters.docType" clearable style="width: 140px">
          <el-option v-for="item in types" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键字">
        <el-input v-model="filters.keyword" clearable placeholder="任务号 / 报关单号 / 文件" style="width: 220px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" @click="openRecognize">OCR识别</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe empty-text="暂无识别任务">
      <el-table-column prop="id" label="任务号" min-width="160" show-overflow-tooltip />
      <el-table-column prop="docType" label="类型" width="120" />
      <el-table-column prop="customsNo" label="关联单号" min-width="160" show-overflow-tooltip />
      <el-table-column prop="fileName" label="文件" min-width="160" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="time" label="时间" width="160" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status !== '已归档'" link type="primary" @click="openFix(row)">修正</el-button>
          <el-button v-else link type="primary" @click="openFix(row)">查看</el-button>
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

    <el-dialog v-model="recognizeOpen" title="OCR识别" width="480px" align-center destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="单据类型" required>
          <el-select v-model="docType" style="width: 100%">
            <el-option v-for="item in types" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="扫描件" required>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
          <p class="hint">支持 PDF / JPG / PNG。当前按写死样例回填。</p>
          <p v-if="fileName" class="file-name">{{ fileName }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recognizeOpen = false">取消</el-button>
        <el-button type="primary" :loading="recognizing" @click="start">开始识别</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="open" title="OCR 识别结果 · 人工修正" width="820px" align-center>
      <el-row :gutter="16">
        <el-col :span="8">
          <div class="preview">
            <strong>{{ current?.fileName || '单据预览区' }}</strong>
            <span>上传后显示识别影像（示意）</span>
          </div>
        </el-col>
        <el-col :span="16">
          <p class="hint">识别字段均可手工修正后回填；修正内容写入操作日志。</p>
          <el-form label-width="110px">
            <el-row :gutter="12">
              <el-col v-for="(value, key) in form" :key="key" :span="12">
                <el-form-item :label="labelOf(String(key))"><el-input v-model="form[key]" /></el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-col>
      </el-row>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button @click="save(true)">仅归档</el-button>
        <el-button type="primary" @click="save(false)">回填并归档</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.hint { margin: 6px 0 0; color: #5a6a7e; font-size: 13px; }
.file-name { margin: 4px 0 0; color: #1a2332; font-size: 13px; }
.preview {
  min-height: 160px;
  border: 1px dashed #c5d0de;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: #5a6a7e;
}
</style>
