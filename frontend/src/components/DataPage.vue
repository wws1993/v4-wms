<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import { getSchema } from '@/modules/schemas'
import { downloadText } from '@/mock/util'
import type { ColumnSchema, DetailBlock, FieldSchema, RowAction } from '@/types'

const props = defineProps<{ name: string }>()
const route = useRoute()
const router = useRouter()

const schema = computed(() => getSchema(props.name))
const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive<Record<string, any>>({})
const dialog = ref(false)
const saving = ref(false)
const editingId = ref('')
const form = reactive<Record<string, any>>({})
const formRef = ref<FormInstance>()
const drawer = ref(false)
const detailBlocks = ref<DetailBlock[]>([])
const monthDialog = ref(false)
const monthValue = ref('')

const rules = computed(() => {
  const result: Record<string, { required: boolean; message: string; trigger: string }[]> = {}
  for (const field of schema.value?.form || []) {
    if (field.when && !field.when(form)) continue
    if (!field.required) continue
    result[field.key] = [{ required: true, message: `请填写${field.label}`, trigger: 'blur' }]
  }
  return result
})

function resetFilters() {
  Object.keys(filters).forEach((key) => delete filters[key])
  for (const field of schema.value?.filters || []) filters[field.key] = ''
  const query = route.query
  Object.keys(filters).forEach((key) => {
    const value = query[key]
    if (typeof value === 'string') filters[key] = value
  })
}

async function load() {
  if (!schema.value) return
  loading.value = true
  const query: Record<string, unknown> = { page: page.value, pageSize: pageSize.value }
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) query[key] = value
  })
  const res = await schema.value.list(query)
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

function fieldOptions(field: FieldSchema) {
  const source = typeof field.options === 'function' ? field.options(form) : field.options || []
  return source.map((item) => (typeof item === 'string' ? { label: item, value: item } : item))
}

function defaultValue(field: FieldSchema) {
  if (field.type === 'multi') return []
  if (field.type === 'number') return undefined
  if (field.type === 'select' && field.required) return fieldOptions(field)[0]?.value ?? ''
  return ''
}

function isDisabled(field: FieldSchema) {
  if (typeof field.disabled === 'function') return field.disabled(form, Boolean(editingId.value))
  return Boolean(field.disabled)
}

function openCreate() {
  editingId.value = ''
  Object.keys(form).forEach((key) => delete form[key])
  form.__isEdit = false
  for (const field of schema.value?.form || []) {
    form[field.key] = defaultValue(field)
  }
  dialog.value = true
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = String(row.id || '')
  Object.keys(form).forEach((key) => delete form[key])
  form.__isEdit = true
  for (const field of schema.value?.form || []) {
    const raw = row[field.key]
    form[field.key] = field.type === 'multi'
      ? (Array.isArray(raw) ? raw : String(raw || '').split('、').filter(Boolean))
      : raw ?? ''
  }
  dialog.value = true
}

function onFieldChange(key: string) {
  schema.value?.onFormChange?.(form, key)
}

async function submit() {
  await formRef.value?.validate()
  if (!schema.value) return
  saving.value = true
  const body = { ...form }
  delete body.__isEdit
  const res = editingId.value && schema.value.update
    ? await schema.value.update(editingId.value, body)
    : await schema.value.create!(body)
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已保存')
  dialog.value = false
  load()
}

async function openDetail(row: Record<string, unknown>) {
  drawer.value = true
  detailBlocks.value = schema.value?.detail ? await schema.value.detail(row) : []
}

function canShowDetail(row: Record<string, unknown>) {
  const flag = schema.value?.showDetail
  if (typeof flag === 'function') return flag(row)
  return Boolean(flag)
}

function visibleActions(row: Record<string, unknown>) {
  return (schema.value?.actions || []).filter((action) => !action.when || action.when(row))
}

async function runAction(action: RowAction, row: Record<string, unknown>) {
  if (action.path) {
    const query = action.queryKey && action.queryFrom ? { [action.queryKey]: String(row[action.queryFrom] ?? '') } : undefined
    router.push({ path: action.path, query })
    return
  }
  if (action.pathFrom) {
    router.push(String(row[action.pathFrom] || '/'))
    return
  }
  if (action.confirm) await ElMessageBox.confirm(action.confirm, '确认')
  const extra: Record<string, unknown> = {}
  if (action.prompt) {
    const answer = await ElMessageBox.prompt(action.prompt.message, action.prompt.title)
    extra[action.prompt.key] = answer.value
  }
  if (!action.request) return
  const res = await action.request(row, extra)
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  const payload = res.data as { filename?: string; content?: string } | null
  if (payload && payload.filename && payload.content) downloadText(payload.filename, payload.content)
  ElMessage.success(res.message || '已完成')
  load()
}

async function runToolbar(run: () => Promise<{ success: boolean; message: string }> | void) {
  const res = await run()
  if (!res) return
  if (res.success) ElMessage.success(res.message)
  else ElMessage.warning(res.message)
}

async function exportAll() {
  if (!schema.value?.exportRows) return
  const res = await schema.value.exportRows()
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  downloadText(res.data.filename, res.data.content)
  ElMessage.success('已导出')
}

async function exportMonth() {
  if (!schema.value?.monthExport || !monthValue.value) return
  const res = await schema.value.monthExport(monthValue.value)
  monthDialog.value = false
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  downloadText(res.data.filename, res.data.content)
  ElMessage.success('已导出在库快照')
}

function bindFile(key: string) {
  return (file: { name: string }) => {
    form[key] = file.name
  }
}

function applyAssist() {
  const fill = schema.value?.assist?.fill()
  if (!fill) return
  Object.assign(form, fill)
  ElMessage.success('已回填识别结果，可继续手工修正')
}

function tagType(value: unknown) {
  const text = String(value)
  if (['启用', '已入库', '已审核', '一致', '成品', '已回填', '已修正', '有效', '在库'].includes(text)) return 'success'
  if (['待收货', '暂存码头', '待审核', '待检', '待修正', '有差异', '投料', '加工'].includes(text)) return 'warning'
  if (['停用', '旧账', '已出库', '混成品'].includes(text)) return 'info'
  if (['库容', '库龄', '码头超期', '备案用量'].includes(text)) return 'danger'
  return 'info'
}

function showEdit(row: Record<string, unknown>) {
  if (!schema.value?.form || !schema.value.update) return false
  return schema.value.canEdit ? schema.value.canEdit(row) : true
}

watch(() => [props.name, route.query.warehouse, route.query.keyword] as const, () => {
  page.value = 1
  resetFilters()
  load()
}, { immediate: true })

const usageText = (row: Record<string, unknown>) => `${row.used ?? 0} / ${row.rate ?? 0}%`
const columnBind = (column: ColumnSchema) => ({ prop: column.prop, label: column.label, width: column.width, minWidth: column.minWidth })
</script>

<template>
  <div v-if="schema" class="data-page">
    <el-form :inline="true" class="filters" @submit.prevent="search">
      <el-form-item v-for="field in schema.filters" :key="field.key" :label="field.label">
        <el-select v-if="field.type === 'select'" v-model="filters[field.key]" clearable :placeholder="field.label" style="width: 160px">
          <el-option v-for="opt in fieldOptions(field)" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-date-picker v-else-if="field.type === 'date'" v-model="filters[field.key]" type="date" value-format="YYYY-MM-DD" :placeholder="field.label" />
        <el-input v-else v-model="filters[field.key]" clearable :placeholder="field.placeholder || field.label" style="width: 180px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button v-if="schema.create && schema.form" type="primary" @click="openCreate">{{ schema.createLabel || '新建' }}</el-button>
      <el-button v-if="schema.exportRows" @click="exportAll">导出</el-button>
      <el-button v-if="schema.monthExport" @click="monthDialog = true">按月导出在库</el-button>
      <el-button v-for="tool in schema.toolbar || []" :key="tool.label" @click="runToolbar(tool.run)">{{ tool.label }}</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column v-for="column in schema.columns" :key="column.prop" v-bind="columnBind(column)" show-overflow-tooltip>
        <template #default="{ row }">
          <template v-if="column.usage">
            <div class="usage">{{ usageText(row) }}</div>
            <el-progress :percentage="Number(row.rate || 0)" :stroke-width="8" :show-text="false" />
          </template>
          <el-tag v-else-if="column.tag" :type="tagType(row[column.prop])" effect="light">{{ row[column.prop] || '—' }}</el-tag>
          <span v-else>{{ row[column.prop] === '' || row[column.prop] == null ? '—' : row[column.prop] }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="schema.form || schema.showDetail || schema.actions?.length" label="操作" fixed="right" min-width="200">
        <template #default="{ row }">
          <el-button v-if="showEdit(row)" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canShowDetail(row)" link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-for="action in visibleActions(row)" :key="action.label" link type="primary" @click="runAction(action, row)">{{ action.label }}</el-button>
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

    <el-dialog v-model="dialog" :title="editingId ? '编辑' : (schema.createLabel || '新建')" :width="schema.formWidth || 720" destroy-on-close>
      <el-button v-if="schema.assist && !editingId" class="assist" @click="applyAssist">{{ schema.assist.label }}</el-button>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="16">
          <el-col v-for="field in schema.form" v-show="!field.when || field.when(form)" :key="field.key" :span="field.span || (field.type === 'textarea' ? 24 : 12)">
            <el-form-item :label="field.label" :prop="field.key">
              <el-select v-if="field.type === 'select' || field.type === 'multi'" v-model="form[field.key]" :multiple="field.type === 'multi'" :disabled="isDisabled(field)" style="width: 100%" @change="onFieldChange(field.key)">
                <el-option v-for="opt in fieldOptions(field)" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <el-input-number v-else-if="field.type === 'number'" v-model="form[field.key]" :disabled="isDisabled(field)" :min="0" style="width: 100%" />
              <el-date-picker v-else-if="field.type === 'date'" v-model="form[field.key]" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              <el-date-picker v-else-if="field.type === 'datetime'" v-model="form[field.key]" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width: 100%" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.key]" type="textarea" :rows="3" />
              <el-upload v-else-if="field.type === 'file'" :auto-upload="false" :limit="1" :on-change="bindFile(field.key)">
                <el-button>选择文件</el-button>
                <span class="file-name">{{ form[field.key] }}</span>
              </el-upload>
              <el-input v-else v-model="form[field.key]" :disabled="isDisabled(field)" :placeholder="field.placeholder" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawer" title="详情" size="640px">
      <section v-for="block in detailBlocks" :key="block.title" class="detail-block">
        <h3>{{ block.title }}</h3>
        <el-descriptions v-if="block.fields?.length" :column="2" border>
          <el-descriptions-item v-for="item in block.fields" :key="item.label" :label="item.label">{{ item.value }}</el-descriptions-item>
        </el-descriptions>
        <el-table v-if="block.table" :data="block.table.rows" border size="small" class="detail-table">
          <el-table-column v-for="column in block.table.columns" :key="column.prop" :prop="column.prop" :label="column.label" :width="column.width" :min-width="column.minWidth" />
        </el-table>
      </section>
    </el-drawer>

    <el-dialog v-model="monthDialog" title="按月导出在库" width="420px">
      <el-date-picker v-model="monthValue" type="month" value-format="YYYY-MM" placeholder="选择月份" />
      <template #footer>
        <el-button @click="monthDialog = false">取消</el-button>
        <el-button type="primary" @click="exportMonth">导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filters { margin-bottom: 4px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.usage { margin-bottom: 4px; font-size: 13px; }
.assist { margin-bottom: 12px; }
.file-name { margin-left: 8px; color: #5a6a7e; }
.detail-block + .detail-block { margin-top: 20px; }
.detail-block h3 { margin: 0 0 10px; font-size: 15px; }
.detail-table { margin-top: 12px; }
</style>
