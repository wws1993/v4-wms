<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, type ElTree } from 'element-plus'
import { stocktakeApi, warehouseApi } from '@/api'
import ImageUpload from '@/components/ImageUpload.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { downloadText } from '@/api/result'

const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const queried = ref(true)
const filters = reactive({ keyword: '', person: '', date: '' })
const saving = ref(false)
const exporting = ref(false)
const open = ref(false)
type AreaNode = {
  id: string
  label: string
  warehouseId?: string
  areaId?: string
  children?: AreaNode[]
}

const form = reactive({ date: '', person: '' })
const files = ref<File[]>([])
const areaNodes = ref<AreaNode[]>([])
const areaTree = ref<InstanceType<typeof ElTree>>()

function stocktakeDay(value: unknown) {
  const day = String(value ?? '').replace('T', ' ').slice(0, 10).replace(/-/g, '/')
  return /^\d{4}\/\d{2}\/\d{2}$/.test(day) ? day : '—'
}

function queryParams() {
  return {
    page: page.value,
    pageSize: pageSize.value,
    keyword: filters.keyword || undefined,
    person: filters.person || undefined,
    date: filters.date || undefined,
  }
}

async function load() {
  loading.value = true
  const res = await stocktakeApi.list(queryParams())
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
  queried.value = true
  if (page.value !== 1) {
    page.value = 1
    return
  }
  load()
}

function onPage() {
  if (queried.value) load()
}

function onSize() {
  if (!queried.value) return
  if (page.value !== 1) page.value = 1
  else load()
}

function clearFilters() {
  filters.keyword = ''
  filters.person = ''
  filters.date = ''
  search()
}

onMounted(load)

async function loadAreaNodes() {
  const [houseRes, stackRes] = await Promise.all([
    warehouseApi.catalog(),
    warehouseApi.stackCatalog(),
  ])
  const stacks = stackRes.success && Array.isArray(stackRes.data) ? stackRes.data : []
  const houses = houseRes.success && houseRes.data ? houseRes.data.list : []
  const houseName = new Map(houses.map((row) => [String(row.id), String(row.code || row.id)]))
  const groups = new Map<string, AreaNode>()
  for (const stack of stacks) {
    const warehouseId = String(stack.warehouseId || '')
    const areaId = String(stack.id || '')
    if (!warehouseId || !areaId) continue
    if (!groups.has(warehouseId)) {
      groups.set(warehouseId, {
        id: `house:${warehouseId}`,
        label: houseName.get(warehouseId) || String(stack.warehouse || warehouseId),
        children: [],
      })
    }
    groups.get(warehouseId)?.children?.push({
      id: areaId,
      label: String(stack.code || areaId),
      warehouseId,
      areaId,
    })
  }
  const ordered: AreaNode[] = []
  houses.forEach((row) => {
    const node = groups.get(String(row.id))
    if (node) ordered.push(node)
  })
  groups.forEach((node) => {
    if (!ordered.includes(node)) ordered.push(node)
  })
  areaNodes.value = ordered
}

function selectedAreas() {
  const nodes = (areaTree.value?.getCheckedNodes(true) || []) as AreaNode[]
  return nodes
    .filter((node) => node.warehouseId && node.areaId)
    .map((node) => ({ warehouseId: node.warehouseId, areaId: node.areaId }))
}

async function reset() {
  form.date = ''
  form.person = ''
  files.value = []
  open.value = true
  if (!areaNodes.value.length) await loadAreaNodes()
  await nextTick()
  areaTree.value?.setCheckedKeys([])
}

function imageList(row: Record<string, unknown>) {
  const urls = Array.isArray(row.attachmentUrls) ? row.attachmentUrls.map(String).filter(Boolean) : []
  const names = Array.isArray(row.attachmentNames) ? row.attachmentNames.map(String) : []
  return urls.map((url, index) => ({ url, name: names[index] || '' }))
}

async function save() {
  const areas = selectedAreas()
  if (!areas.length) {
    ElMessage.warning('请选择盘点区域')
    return
  }
  if (!files.value.length) {
    ElMessage.warning('请上传附件')
    return
  }
  saving.value = true
  const res = await stocktakeApi.create({
    date: form.date,
    person: form.person,
    areas,
    __files: files.value,
  })
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '盘点记录已提交')
  open.value = false
  search()
}

async function exportRows() {
  exporting.value = true
  const res = await stocktakeApi.exportRows(queryParams())
  exporting.value = false
  if (!res.success || !res.data || res.data.content == null) {
    ElMessage.error(res.message || '导出失败')
    return
  }
  downloadText(res.data.filename, res.data.content)
  ElMessage.success('已导出')
}
</script>

<template>
  <div>
    <el-form :inline="true" @submit.prevent="search">
      <el-form-item label="盘点单号">
        <el-input v-model="filters.keyword" clearable placeholder="盘点单号" style="width: 180px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="盘点人">
        <el-input v-model="filters.person" clearable placeholder="盘点人" style="width: 140px" @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="盘点日期">
        <el-date-picker v-model="filters.date" type="date" value-format="YYYY-MM-DD" placeholder="盘点日期" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="clearFilters">重置</el-button>
      </el-form-item>
    </el-form>
    <div class="toolbar">
      <el-button type="primary" @click="reset">新建盘点</el-button>
      <span class="spacer" />
      <el-button :loading="exporting" @click="exportRows">导出</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe empty-text="暂无盘点记录">
      <el-table-column prop="id" label="盘点单号" min-width="160" />
      <el-table-column prop="operator" label="盘点人" width="120" />
      <el-table-column label="盘点日期" min-width="140"><template #default="{ row }">{{ stocktakeDay(row.time) }}</template></el-table-column>
      <el-table-column prop="areaText" label="盘点区域" min-width="200" />
      <el-table-column label="附件" min-width="180">
        <template #default="{ row }">{{ row.attachment || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" width="140">
        <template #default="{ row }">
          <div class="attach-links">
            <ImageViewer
              v-for="(item, index) in imageList(row)"
              :key="item.url"
              variant="link"
              :label="imageList(row).length > 1 ? `查看附件${index + 1}` : '查看附件'"
              :src="item.url"
              :name="item.name"
              title="盘点附件"
            />
            <ImageViewer v-if="!imageList(row).length" variant="link" label="查看附件" title="盘点附件" />
          </div>
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
        @current-change="onPage"
        @size-change="onSize"
      />
    </div>

    <el-dialog v-model="open" title="新建盘点单" width="640px" align-center>
      <el-form label-width="90px">
        <el-form-item label="盘点日期"><el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="盘点人"><el-input v-model="form.person" /></el-form-item>
        <el-form-item label="盘点区域" required>
          <el-tree
            ref="areaTree"
            class="area-tree"
            :data="areaNodes"
            show-checkbox
            node-key="id"
            default-expand-all
            empty-text="暂无仓库堆位"
          />
        </el-form-item>
        <el-form-item label="附件" required>
          <ImageUpload v-model="files" multiple />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.spacer { flex: 1; }
.attach-links { display: flex; flex-wrap: wrap; gap: 8px; }
.area-tree { width: 100%; max-height: 280px; overflow: auto; border: 1px solid var(--el-border-color); border-radius: 4px; padding: 8px; }
</style>
