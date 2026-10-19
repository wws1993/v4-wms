<script setup lang="ts">
import { onActivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ocrApi } from '@/api'

const route = useRoute()
const keyword = ref('')
const docType = ref('入库报关单')
const fileName = ref('')
const pickedFile = ref<File | null>(null)
const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const open = ref(false)
const current = ref<Record<string, unknown> | null>(null)
const form = reactive<Record<string, string>>({})
const types = ['入库报关单', '出库报关单', '提单', '品质单', '重量单']
const labels: Record<string, string> = {
  customsNo: '报关单号', checklistNo: '核注清单号', shipName: '船名', blNo: '提单号', amount: '金额',
  currency: '币种', consignee: '流向企业', consumer: '消费使用单位', wet: '湿重', dry: '干重',
  moisture: '水分', qualityNo: '证书号', cu: '铜', ag: '银', au: '金',
}
function labelOf(key: string) {
  return labels[key] || key
}

function applyKeyword() {
  if (route.name !== 'ocr') return false
  const next = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (keyword.value === next) return false
  keyword.value = next
  return true
}

async function load() {
  loading.value = true
  const res = await ocrApi.list({ page: 1, pageSize: keyword.value ? 100 : 20, keyword: keyword.value || undefined })
  loading.value = false
  if (res.success && res.data) rows.value = res.data.list
}

watch(() => route.query.keyword, () => {
  if (applyKeyword()) load()
})

onActivated(() => {
  if (applyKeyword()) load()
})

onMounted(() => {
  applyKeyword()
  load()
})

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
  const res = await ocrApi.recognize({
    docType: docType.value,
    fileName: pickedFile.value?.name || fileName.value || `${docType.value}.pdf`,
    __file: pickedFile.value || undefined,
  })
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message)
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
</script>

<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card header="上传识别">
          <el-form label-position="top">
            <el-form-item label="单据类型">
              <el-select v-model="docType"><el-option v-for="item in types" :key="item" :label="item" :value="item" /></el-select>
            </el-form-item>
            <el-form-item label="扫描件">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
              <p class="hint">支持 PDF / JPG / PNG。当前按写死样例回填。</p>
            </el-form-item>
            <el-button type="primary" @click="start">开始识别</el-button>
          </el-form>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card header="最近识别任务">
          <p v-if="keyword" class="hint">当前按 {{ keyword }} 筛选</p>
          <el-table v-loading="loading" :data="rows" border stripe>
            <el-table-column prop="id" label="任务号" width="140" />
            <el-table-column prop="docType" label="类型" width="120" />
            <el-table-column prop="customsNo" label="关联单号" min-width="160" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button v-if="row.status !== '已归档'" link type="primary" @click="openFix(row)">修正</el-button>
                <el-button v-else link type="primary" @click="openFix(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

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
.hint { color: #5a6a7e; }
.preview { min-height: 160px; border: 1px dashed #c5d0de; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; color: #5a6a7e; }
</style>
