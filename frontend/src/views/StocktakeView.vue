<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { stocktakeApi, warehouseApi } from '@/api'
import { downloadBlob, downloadText } from '@/mock/util'

const rows = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const month = ref(new Date().toISOString().slice(0, 7))
const open = ref(false)
const houses = ref<string[]>([])
const stacks = ref<Record<string, unknown>[]>([])
const form = reactive({ date: '', person: '', warehouses: [] as string[], stacks: [] as string[], remark: '' })
const files = ref<{ name: string; url: string; kind: string }[]>([])

const summary = computed(() => {
  if (!form.warehouses.length && !form.stacks.length) return '未选择'
  return `${form.warehouses.length} 个仓库，${form.stacks.length} 个堆位`
})

async function load() {
  loading.value = true
  const res = await stocktakeApi.list({ page: 1, pageSize: 50 })
  loading.value = false
  if (res.success && res.data) rows.value = res.data.list
}

onMounted(async () => {
  const res = await warehouseApi.stacks({ page: 1, pageSize: 200 })
  if (res.success && res.data) {
    stacks.value = res.data.list
    houses.value = [...new Set(res.data.list.map((row) => String(row.warehouse)))]
  }
  const houseRes = await warehouseApi.list({ page: 1, pageSize: 50 })
  if (houseRes.success && houseRes.data) houses.value = houseRes.data.list.map((row) => String(row.code))
  load()
})

function reset() {
  Object.assign(form, { date: '', person: '', warehouses: [], stacks: [], remark: '' })
  files.value = []
  open.value = true
}

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  for (const file of Array.from(input.files || [])) {
    files.value.push({ name: file.name, url: URL.createObjectURL(file), kind: file.type })
  }
  input.value = ''
}

function preview(file: { name: string; url: string; kind: string }) {
  const text = /\.(txt|csv)$/i.test(file.name) || file.kind.startsWith('text')
  const visual = file.kind.startsWith('image') || file.kind.includes('pdf') || /\.(png|jpe?g|gif|webp|pdf)$/i.test(file.name)
  if (visual || text) window.open(file.url, '_blank')
  else {
    const link = document.createElement('a')
    link.href = file.url
    link.download = file.name
    link.click()
  }
}

async function save() {
  if (!form.warehouses.length || !form.stacks.length) {
    ElMessage.warning('请选择仓库和堆位')
    return
  }
  const res = await stocktakeApi.create({
    month: (form.date || month.value).slice(0, 7),
    warehouses: form.warehouses,
    stacks: form.stacks,
    attachment: files.value.map((file) => file.name).join('、'),
    remark: form.person ? `${form.person}${form.remark ? `；${form.remark}` : ''}` : form.remark,
  })
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success('盘点单已归档，不回写库存')
  open.value = false
  load()
}

async function exportMonth() {
  const res = await stocktakeApi.exportMonth(month.value)
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  if (res.data.blob) downloadBlob(res.data.filename, res.data.blob)
  else if (res.data.content != null) downloadText(res.data.filename, res.data.content)
}
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="reset">新建盘点</el-button>
      <span class="spacer" />
      <span>导出月份</span>
      <el-date-picker v-model="month" type="month" value-format="YYYY-MM" />
      <el-button @click="exportMonth">导出月度在库</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="id" label="盘点单号" width="140" />
      <el-table-column label="范围" min-width="220"><template #default="{ row }">{{ row.warehouses }} / {{ row.stacks }}</template></el-table-column>
      <el-table-column prop="operator" label="盘点人" width="110" />
      <el-table-column prop="time" label="计划日期" min-width="150" />
      <el-table-column prop="attachment" label="附件" min-width="140" />
      <el-table-column label="状态" width="100"><template #default>已归档</template></el-table-column>
    </el-table>

    <el-dialog v-model="open" title="新建盘点单" width="760px" align-center>
      <el-form label-width="90px">
        <el-form-item label="计划日期"><el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="盘点人"><el-input v-model="form.person" /></el-form-item>
        <el-form-item label="盘点范围" required>
          <div class="bar">
            <el-button size="small" @click="form.warehouses = [...houses]">全选仓库</el-button>
            <el-button size="small" @click="form.stacks = stacks.map((row) => String(row.code))">全选堆位</el-button>
            <el-button size="small" @click="form.warehouses = []; form.stacks = []">清空</el-button>
            <span>{{ summary }}</span>
          </div>
          <div class="box">
            <div>
              <strong>仓库</strong>
              <el-checkbox-group v-model="form.warehouses"><el-checkbox v-for="name in houses" :key="name" :value="name">{{ name }}</el-checkbox></el-checkbox-group>
            </div>
            <div>
              <strong>堆位</strong>
              <el-checkbox-group v-model="form.stacks"><el-checkbox v-for="item in stacks" :key="String(item.id)" :value="String(item.code)">{{ item.code }}</el-checkbox></el-checkbox-group>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="附件">
          <input type="file" multiple @change="onFiles" />
          <ul>
            <li v-for="file in files" :key="file.url"><el-button link type="primary" @click="preview(file)">{{ file.name }}</el-button></li>
          </ul>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="save">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.spacer { flex: 1; }
.bar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.box { display: grid; grid-template-columns: 180px 1fr; gap: 12px; width: 100%; max-height: 240px; overflow: auto; border: 1px solid #e3eaf3; padding: 8px; }
</style>
