<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { dictApi } from '@/api'

type Row = Record<string, unknown>

const statuses = ['正常', '停用']
const typeLoading = ref(false)
const dataLoading = ref(false)
const typeRows = ref<Row[]>([])
const dataRows = ref<Row[]>([])
const dataTotal = ref(0)
const dataPage = ref(1)
const dataSize = ref(10)
const selectedId = ref('')
const typeQuery = ref('')
const dataFilters = reactive({ label: '', status: '' })

const selected = computed(() => typeRows.value.find((row) => String(row.id) === selectedId.value))
const visibleTypes = computed(() => {
  const keyword = typeQuery.value.trim().toLowerCase()
  if (!keyword) return typeRows.value
  return typeRows.value.filter((row) => `${row.name || ''} ${row.type || ''}`.toLowerCase().includes(keyword))
})

function clean(source: Record<string, unknown>) {
  const params: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== '' && value != null) params[key] = value
  }
  return params
}

async function loadData() {
  if (!selected.value) {
    dataRows.value = []
    dataTotal.value = 0
    return
  }
  dataLoading.value = true
  const res = await dictApi.data({
    page: dataPage.value,
    pageSize: dataSize.value,
    type: selected.value.type,
    ...clean(dataFilters),
  })
  dataLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '字典值加载失败')
    dataRows.value = []
    dataTotal.value = 0
    return
  }
  dataRows.value = res.data.list
  dataTotal.value = res.data.total
}

async function loadTypes() {
  typeLoading.value = true
  const res = await dictApi.types({ page: 1, pageSize: 200 })
  typeLoading.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message || '字典类型加载失败')
    typeRows.value = []
    return
  }
  typeRows.value = res.data.list
  const current = typeRows.value.find((row) => String(row.id) === selectedId.value)
  const next = current || typeRows.value[0]
  if (!next) {
    selectedId.value = ''
    dataRows.value = []
    dataTotal.value = 0
    return
  }
  const changed = String(next.id) !== selectedId.value
  selectedId.value = String(next.id)
  if (changed) dataPage.value = 1
  if (changed || !dataRows.value.length) loadData()
}

function searchData() {
  dataPage.value = 1
  loadData()
}

function pick(row: Row) {
  if (String(row.id) === selectedId.value) return
  selectedId.value = String(row.id)
  dataPage.value = 1
  loadData()
}

const typeDialog = ref(false)
const typeSaving = ref(false)
const typeFormRef = ref<FormInstance>()
const typeEditing = ref('')
const typeForm = reactive({ name: '', type: '', status: '正常', remark: '' })
const typeRules: FormRules = {
  name: [{ required: true, message: '请填写字典名称', trigger: 'blur' }],
  type: [
    { required: true, message: '请填写字典类型', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]*$/, message: '以小写字母开头，只能含小写字母、数字和下划线', trigger: 'blur' },
  ],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

function openTypeCreate() {
  typeEditing.value = ''
  Object.assign(typeForm, { name: '', type: '', status: '正常', remark: '' })
  typeDialog.value = true
}

function openTypeEdit(row: Row) {
  typeEditing.value = String(row.id)
  Object.assign(typeForm, {
    name: String(row.name || ''),
    type: String(row.type || ''),
    status: String(row.status || '正常'),
    remark: String(row.remark || ''),
  })
  typeDialog.value = true
}

async function submitType() {
  await typeFormRef.value?.validate()
  typeSaving.value = true
  const res = typeEditing.value
    ? await dictApi.updateType(typeEditing.value, { ...typeForm })
    : await dictApi.createType({ ...typeForm })
  typeSaving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已保存')
  typeDialog.value = false
  loadTypes()
}

const dataDialog = ref(false)
const dataSaving = ref(false)
const dataFormRef = ref<FormInstance>()
const dataEditing = ref('')
const dataForm = reactive({
  label: '',
  value: '',
  sort: 0,
  status: '正常',
  isDefault: '否',
  remark: '',
  cssClass: '',
  listClass: '',
})
const dataRules: FormRules = {
  label: [{ required: true, message: '请填写字典标签', trigger: 'blur' }],
  value: [{ required: true, message: '请填写字典键值', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

function openDataCreate() {
  if (!selected.value) return
  dataEditing.value = ''
  Object.assign(dataForm, { label: '', value: '', sort: 0, status: '正常', isDefault: '否', remark: '', cssClass: '', listClass: '' })
  dataDialog.value = true
}

function openDataEdit(row: Row) {
  dataEditing.value = String(row.id)
  Object.assign(dataForm, {
    label: String(row.label || ''),
    value: String(row.value || ''),
    sort: Number(row.sort || 0),
    status: String(row.status || '正常'),
    isDefault: String(row.isDefault || '否'),
    remark: String(row.remark || ''),
    cssClass: String(row.cssClass || ''),
    listClass: String(row.listClass || ''),
  })
  dataDialog.value = true
}

async function submitData() {
  if (!selected.value) return
  await dataFormRef.value?.validate()
  dataSaving.value = true
  const body = { ...dataForm, type: selected.value.type }
  const res = dataEditing.value ? await dictApi.updateData(dataEditing.value, body) : await dictApi.createData(body)
  dataSaving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已保存')
  dataDialog.value = false
  loadData()
}

async function removeType(row: Row) {
  try {
    await ElMessageBox.confirm('确认删除该字典类型？', '确认')
  } catch {
    return
  }
  const res = await dictApi.removeType(String(row.id))
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已删除')
  if (selectedId.value === String(row.id)) selectedId.value = ''
  loadTypes()
}

async function removeData(row: Row) {
  try {
    await ElMessageBox.confirm('确认删除该字典值？', '确认')
  } catch {
    return
  }
  const res = await dictApi.removeData(String(row.id))
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已删除')
  loadData()
}

function tagType(status: unknown) {
  return status === '正常' ? 'success' : 'info'
}

onMounted(loadTypes)
</script>

<template>
  <div class="dict-page">
    <aside class="nav" v-loading="typeLoading">
      <el-input v-model="typeQuery" class="find" clearable placeholder="查找字典" />
      <button type="button" class="nav-add" @click="openTypeCreate">新建类型</button>
      <div class="nav-list">
        <button
          v-for="row in visibleTypes"
          :key="String(row.id)"
          type="button"
          class="nav-item"
          :class="{ on: String(row.id) === selectedId }"
          @click="pick(row)"
        >
          <span class="nav-name">{{ row.name }}</span>
          <span class="nav-code">{{ row.type }}</span>
        </button>
        <p v-if="!typeLoading && !visibleTypes.length" class="nav-empty">没有匹配的字典</p>
      </div>
    </aside>

    <section v-if="selected" class="body">
      <header class="head">
        <div>
          <h2>{{ selected.name }}</h2>
          <p>{{ selected.type }} · {{ selected.status }}<template v-if="selected.remark"> · {{ selected.remark }}</template></p>
        </div>
        <div class="head-actions">
          <el-button link type="primary" @click="openTypeEdit(selected)">编辑</el-button>
          <el-button link type="danger" @click="removeType(selected)">删除</el-button>
        </div>
      </header>

      <div class="card">
        <div class="card-head">
          <h3>字典值</h3>
          <div class="card-tools">
            <el-input v-model="dataFilters.label" clearable placeholder="搜索标签" style="width: 180px" @change="searchData" @clear="searchData" @keyup.enter="searchData" />
            <el-select v-model="dataFilters.status" clearable placeholder="状态" style="width: 110px" @change="searchData">
              <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
            </el-select>
            <el-button type="primary" @click="openDataCreate">新建字典值</el-button>
          </div>
        </div>
        <el-table v-loading="dataLoading" :data="dataRows" row-key="id" empty-text="暂无字典值">
          <el-table-column prop="sort" label="排序" width="70" />
          <el-table-column prop="label" label="标签" min-width="110" show-overflow-tooltip />
          <el-table-column prop="value" label="键值" min-width="90" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="tagType(row.status)" effect="light">{{ row.status || '—' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="isDefault" label="默认" width="70" />
          <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDataEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="removeData(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="dataPage"
            v-model:page-size="dataSize"
            :total="dataTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, prev, pager, next"
            background
            @current-change="loadData"
            @size-change="searchData"
          />
        </div>
      </div>
    </section>
    <section v-else class="body">
      <p class="placeholder">请选择左侧字典类型</p>
    </section>

    <el-dialog v-model="typeDialog" :title="typeEditing ? '编辑字典类型' : '新建字典类型'" width="480" destroy-on-close>
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="90px">
        <el-form-item label="字典名称" prop="name">
          <el-input v-model="typeForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="字典类型" prop="type">
          <el-input v-model="typeForm.type" maxlength="100" placeholder="如 wms_item_category" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="typeForm.status" style="width: 100%">
            <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialog = false">取消</el-button>
        <el-button type="primary" :loading="typeSaving" @click="submitType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dataDialog" :title="dataEditing ? '编辑字典值' : '新建字典值'" width="480" destroy-on-close>
      <el-form ref="dataFormRef" :model="dataForm" :rules="dataRules" label-width="90px">
        <el-form-item label="字典类型">
          <el-input :model-value="selected?.type || ''" disabled />
        </el-form-item>
        <el-form-item label="字典标签" prop="label">
          <el-input v-model="dataForm.label" maxlength="100" />
        </el-form-item>
        <el-form-item label="字典键值" prop="value">
          <el-input v-model="dataForm.value" maxlength="100" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dataForm.sort" :min="0" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="dataForm.status" style="width: 100%">
            <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否默认">
          <el-select v-model="dataForm.isDefault" style="width: 100%">
            <el-option label="是" value="是" />
            <el-option label="否" value="否" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dataForm.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dataDialog = false">取消</el-button>
        <el-button type="primary" :loading="dataSaving" @click="submitData">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dict-page {
  display: flex;
  align-items: stretch;
  height: calc(100vh - 56px);
  min-height: 0;
  overflow: hidden;
  margin: -16px -20px -20px;
  background: #f3f3f3;
}
.nav {
  width: 280px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 10px 12px;
  background: var(--el-color-primary-light-9);
}
.find { margin: 0 6px 8px; }
.nav-add {
  margin: 0 6px 8px;
  border: 0;
  background: transparent;
  border-radius: 4px;
  padding: 8px 12px;
  text-align: left;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 14px;
}
.nav-add:hover { background: var(--el-color-primary-light-8); }
.nav-list { flex: 1; min-height: 0; overflow: auto; padding: 0 2px; }
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  margin: 1px 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #1a1a1a;
  cursor: pointer;
  text-align: left;
}
.nav-item:hover { background: var(--el-color-primary-light-8); }
.nav-item.on {
  background: #fff;
  color: var(--el-color-primary-dark-2);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}
.nav-name { font-size: 14px; line-height: 20px; }
.nav-code { margin-top: 1px; font-size: 12px; font-weight: 400; color: #616161; }
.nav-item.on .nav-code { color: var(--el-color-primary); }
.nav-empty { margin: 12px; color: #616161; font-size: 13px; }
.body { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 28px 36px 32px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.head h2 { margin: 0; font-size: 28px; font-weight: 600; line-height: 1.25; color: #1a1a1a; }
.head p { margin: 6px 0 0; font-size: 14px; color: #5d5d5d; }
.head-actions { display: flex; gap: 4px; padding-top: 8px; flex: none; }
.card {
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 8px 16px 12px;
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; }
.card-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.card-tools { display: flex; align-items: center; gap: 8px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.placeholder { margin: 48px 0 0; color: #616161; }
@media (max-width: 1100px) {
  .dict-page { flex-direction: column; height: auto; min-height: calc(100vh - 56px); overflow: visible; }
  .nav { width: auto; max-height: 320px; }
}
</style>
