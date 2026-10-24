<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { passwordIssue, passwordRuleText } from '@/security/policy'
import { inventoryApi, materialApi, partnerApi, roleApi, shippingApi, warehouseApi, dictApi } from '@/api'
import ImageUpload from '@/components/ImageUpload.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import StackGridPicker from '@/components/StackGridPicker.vue'
import LotDetailDialog from '@/components/LotDetailDialog.vue'
import { isMediaPath, mediaUrl } from '@/api/media'
import { downloadBlob, downloadText } from '@/api/result'
import { getSchema } from '@/modules/schemas'
import type { ColumnSchema, DetailBlock, FieldSchema, RowAction } from '@/types'

const props = defineProps<{ name: string; initialFilters?: Record<string, string> }>()
const route = useRoute()
const router = useRouter()
const host = String(route.name || '')

const schema = computed(() => getSchema(props.name))
const importInput = ref<HTMLInputElement>()
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
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailRow = ref<Record<string, unknown> | null>(null)
const detailBlocks = ref<DetailBlock[]>([])
const lotOpen = ref(false)
const lotLoading = ref(false)
const lotLedger = ref(false)
/** 票货详情初始页 */
const lotFocus = ref('basic')
const lotCurrent = ref<Record<string, unknown> | null>(null)
const actionOpen = ref(false)
const actionSaving = ref(false)
const actionDef = ref<RowAction | null>(null)
const actionRow = ref<Record<string, unknown> | null>(null)
const actionForm = reactive<Record<string, any>>({})
const monthDialog = ref(false)
const monthValue = ref('')
const stackRows = ref<Record<string, unknown>[]>([])
const materialRows = ref<Record<string, unknown>[]>([])
const shippingOptions = ref<{ label: string; value: string }[]>([])
const consignorOptions = ref<{ label: string; value: string }[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const roleOptions = ref<{ label: string; value: string }[]>([])
const dictOptions = ref<Record<string, string[]>>({})

const rules = computed<FormRules>(() => {
  const result: FormRules = {}
  for (const field of schema.value?.form || []) {
    if (field.when && !field.when(form)) continue
    const list: FormItemRule[] = []
    if (field.required) list.push({ required: true, message: `请填写${field.label}`, trigger: 'blur' })
    if (field.type === 'password') {
      list.push({
        validator: (_rule, value, callback) => {
          const message = passwordIssue(value)
          callback(message ? new Error(message) : undefined)
        },
        trigger: 'blur',
      })
    }
    if (list.length) result[field.key] = list
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
  for (const [key, value] of Object.entries(props.initialFilters || {})) {
    if (!filters[key] && value) filters[key] = value
  }
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
  if (field.optionsFrom === 'stacks') {
    return stackRows.value.map((row) => ({
      label: `${row.code}（${row.grid || '无网格'}）`,
      value: String(row.code),
    }))
  }
  if (field.optionsFrom === 'materials') {
    const exclude = field.excludeCargoTypes || []
    const rows = exclude.length
      ? materialRows.value.filter((row) => !exclude.includes(String(row.cargoType || '')))
      : materialRows.value
    return rows.map((row) => ({
      label: [row.mineArea || row.name, row.originCountry].filter(Boolean).join(' · ') || String(row.id),
      value: String(row.id),
    }))
  }
  if (field.optionsFrom === 'shipping') return shippingOptions.value
  if (field.optionsFrom === 'consignors') return consignorOptions.value
  if (field.optionsFrom === 'warehouses') return warehouseOptions.value
  if (field.optionsFrom === 'roles') return roleOptions.value
  if (field.dict) {
    const labels = dictOptions.value[field.dict] || []
    const source = typeof field.options === 'function' ? field.options(form, labels) : labels
    return source.map((item) => (typeof item === 'string' ? { label: item, value: item } : item))
  }
  const source = typeof field.options === 'function' ? field.options(form) : field.options || []
  return source.map((item) => (typeof item === 'string' ? { label: item, value: item } : item))
}

function gridOwns(field: FieldSchema) {
  return (schema.value?.form || []).some((item) => item.type === 'cells' && item.stackKey === field.key)
}

function uses(kind: FieldSchema['optionsFrom']) {
  const fields = [...(schema.value?.form || []), ...(schema.value?.filters || [])]
  return fields.some((field) => field.optionsFrom === kind || (kind === 'stacks' && field.type === 'cells'))
}

async function loadLookups() {
  if (uses('stacks')) {
    const res = await warehouseApi.stacks({ page: 1, pageSize: 200 })
    stackRows.value = res.success && res.data ? res.data.list : []
  }
  if (uses('materials')) {
    const res = await materialApi.list({ page: 1, pageSize: 200 })
    materialRows.value = res.success && res.data ? res.data.list : []
  }
  if (uses('shipping')) {
    const res = await shippingApi.list()
    shippingOptions.value = res.success && res.data
      ? res.data.list.map((row) => ({ label: String(row.name), value: String(row.name) }))
      : []
  }
  if (uses('consignors')) {
    const res = await partnerApi.consignors()
    const names = res.success && Array.isArray(res.data) ? res.data : []
    consignorOptions.value = names.map((name) => ({ label: name, value: name }))
  }
  if (uses('warehouses')) {
    const res = await warehouseApi.catalog()
    warehouseOptions.value = res.success && res.data
      ? res.data.list.map((row) => ({ label: String(row.code), value: String(row.code) }))
      : []
  }
  if (uses('roles')) {
    const res = await roleApi.options()
    roleOptions.value = res.success && Array.isArray(res.data) ? res.data : []
  }
  const dictKeys = [...new Set(
    [...(schema.value?.form || []), ...(schema.value?.filters || [])].map((field) => field.dict).filter((item): item is string => Boolean(item)),
  )]
  if (dictKeys.length) {
    const entries = await Promise.all(dictKeys.map(async (type) => {
      const res = await dictApi.labels(type)
      return [type, res.success && Array.isArray(res.data) ? res.data : []] as const
    }))
    dictOptions.value = Object.fromEntries(entries)
  }
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
  Object.assign(form, schema.value?.defaults?.() || {})
  dialog.value = true
  loadLookups()
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
  if (row.code != null && form.code == null) form.code = row.code
  if (schema.value?.key === 'stacks' && form.code && !form.stackName) {
    const parts = String(form.code).split('#')
    form.stackName = parts.length > 1 ? parts.slice(1).join('#') : ''
  }
  dialog.value = true
  loadLookups()
}

function onFieldChange(key: string) {
  schema.value?.onFormChange?.(form, key, { materials: materialRows.value })
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
  detailRow.value = row
  detailOpen.value = true
  detailLoading.value = true
  detailBlocks.value = []
  detailBlocks.value = schema.value?.detail ? await schema.value.detail(row) : []
  detailLoading.value = false
}

function canShowDetail(row: Record<string, unknown>) {
  const flag = schema.value?.showDetail
  if (typeof flag === 'function') return flag(row)
  return Boolean(flag)
}

function visibleActions(row: Record<string, unknown>) {
  return (schema.value?.actions || []).filter((action) => !action.inDetail && (!action.when || action.when(row)))
}

function detailFooterActions() {
  return (schema.value?.actions || []).filter((action) => action.inDetail)
}

function openActionDialog(action: RowAction, row: Record<string, unknown>) {
  actionDef.value = action
  actionRow.value = row
  Object.keys(actionForm).forEach((key) => delete actionForm[key])
  Object.assign(actionForm, action.dialog?.fill?.(row) || {})
  actionOpen.value = true
}

async function submitAction() {
  const action = actionDef.value
  const row = actionRow.value
  if (!action?.request || !row) return
  for (const field of action.dialog?.fields || []) {
    if (!field.required) continue
    const value = actionForm[field.key]
    if (value === '' || value == null || (Array.isArray(value) && !value.length)) {
      ElMessage.warning(`请填写${field.label}`)
      return
    }
  }
  actionSaving.value = true
  const res = await action.request(row, { ...actionForm })
  actionSaving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  const payload = res.data as { filename?: string; content?: string } | null
  if (payload && payload.filename && payload.content) downloadText(payload.filename, payload.content)
  ElMessage.success(res.message || '已完成')
  actionOpen.value = false
  load()
}

function pickImport() {
  importInput.value?.click()
}

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !schema.value?.importRows) return
  const res = await schema.value.importRows(file)
  if (res.success) ElMessage.success(res.message)
  else ElMessage.warning(res.message)
  load()
}

async function runAction(action: RowAction, row: Record<string, unknown>) {
  if (action.opensDetail) {
    openDetail(row)
    return
  }
  if (action.notice) {
    await ElMessageBox.alert(action.notice(row), '矿源备案附件', { confirmButtonText: '关闭' })
    return
  }
  if (action.path) {
    const query = action.queryKey && action.queryFrom ? { [action.queryKey]: String(row[action.queryFrom] ?? '') } : undefined
    router.push({ path: action.path, query })
    return
  }
  if (action.pathFrom) {
    router.push(String(row[action.pathFrom] || '/'))
    return
  }
  if (action.dialog) {
    openActionDialog(action, row)
    return
  }
  if (action.confirm) {
    try {
      await ElMessageBox.confirm(action.confirm, '确认', { type: 'warning' })
    } catch {
      return
    }
  }
  if (!action.request) return
  const res = await action.request(row, {})
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
  const query: Record<string, unknown> = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) query[key] = value
  })
  const res = await schema.value.exportRows(query)
  if (!res.success || !res.data) {
    ElMessage.error(res.message)
    return
  }
  if (res.data.blob) downloadBlob(res.data.filename, res.data.blob)
  else if (res.data.content != null) downloadText(res.data.filename, res.data.content)
  else {
    ElMessage.error('导出内容为空')
    return
  }
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
  if (res.data.content == null) {
    ElMessage.error('导出内容为空')
    return
  }
  downloadText(res.data.filename, res.data.content)
  ElMessage.success('已导出在库快照')
}

function bindFile(key: string) {
  return (file: { name: string; raw?: File }) => {
    form[key] = file.name
    form.__file = file.raw
  }
}

function imageFieldFile() {
  return form.__file instanceof File ? form.__file : null
}

function imageFieldSrc(key: string) {
  if (imageFieldFile()) return ''
  const value = form[key]
  return isMediaPath(value) ? mediaUrl(value) : ''
}

function onImageFile(file: File | File[] | null) {
  form.__file = file instanceof File ? file : undefined
}

function fileNameOf(value: unknown) {
  return String(value || '').split('?')[0].split('/').filter(Boolean).pop() || ''
}

function applyAssist() {
  const fill = schema.value?.assist?.fill()
  if (!fill) return
  Object.assign(form, fill)
  ElMessage.success('已回填识别结果，可继续手工修正')
}

function tagType(value: unknown) {
  const text = String(value)
  if (['启用', '已入库', '已审核', '一致', '成品', '已回填', '已修正', '有效', '在用', '新账', '在库', '已出清', '本期账册', '纳入库存'].includes(text)) return 'success'
  if (['待收货', '暂存码头', '待审核', '待检', '待修正', '有差异', '投料', '加工', '未出清', '下期账册'].includes(text)) return 'warning'
  if (['停用', '旧账', '已出库', '已用尽', '已核销'].includes(text)) return 'info'
  if (['达标矿', '混成品'].includes(text)) return 'success'
  if (text === '原料') return 'primary'
  if (['报备矿', '即将用尽', '已投料'].includes(text)) return 'warning'
  if (['库容', '库龄', '码头超期', '备案用量'].includes(text)) return 'danger'
  return 'info'
}

function showEdit(row: Record<string, unknown>) {
  if (!schema.value?.form || !schema.value.update) return false
  return schema.value.canEdit ? schema.value.canEdit(row) : true
}

watch(() => [form.warehouse, form.stackName], () => {
  if (schema.value?.key !== 'stacks') return
  const name = String(form.stackName || '').trim()
  const house = String(form.warehouse || '')
  if (!name || !house) return
  const prefix = house === '码头仓库' ? '码头' : house.replace(/^#/, '').replace(/仓$/, '')
  form.code = `${prefix}#${name}`
})

watch(() => [props.name, route.query.warehouse, route.query.keyword] as const, () => {
  if (String(route.name || '') !== host) return
  page.value = 1
  resetFilters()
  loadLookups()
  load()
}, { immediate: true })

const usageText = (row: Record<string, unknown>) => row.occupyText ? String(row.occupyText) : `${row.used ?? 0} / ${row.rate ?? 0}%`
const columnBind = (column: ColumnSchema) => ({ prop: column.prop, label: column.label, width: column.width, minWidth: column.minWidth })
function lotText(value: unknown) {
  const text = String(value ?? '').trim()
  return text && text !== '—' && text !== '-' ? text : ''
}

async function openLot(row: Record<string, unknown>) {
  const customsNo = lotText(row.customsNo)
  const batchNo = customsNo || lotText(row.batchNo) || lotText(row.prodBatch)
  lotFocus.value = 'basic'
  lotOpen.value = true
  lotLoading.value = true
  lotCurrent.value = {
    ...row,
    batchNo,
    customsNo,
    batchKind: customsNo ? '报关单号' : '生产批次号',
    stackText: row.stackText || row.stack,
    inDate: row.inDate || row.inAt,
  }
  if (batchNo) {
    const res = await inventoryApi.detail(batchNo)
    if (lotOpen.value && res.success && res.data) lotCurrent.value = res.data
  }
  lotLoading.value = false
}

const detailTitle = computed(() => detailBlocks.value[0]?.title || '详情')
const detailWidth = computed(() => (detailBlocks.value.some((block) => block.table) ? 920 : 640))
</script>

<template>
  <div v-if="schema" class="data-page">
    <el-form :inline="true" class="filters" @submit.prevent="search">
      <el-form-item v-for="field in schema.filters" :key="field.key" :label="field.label">
        <el-select v-if="field.type === 'select'" v-model="filters[field.key]" clearable :placeholder="field.placeholder || field.label" style="width: 160px">
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
      <el-button v-if="schema.importRows" @click="pickImport">导入</el-button>
      <input ref="importInput" type="file" accept=".csv,text/csv" hidden @change="onImport" />
      <el-button v-if="schema.exportRows" @click="exportAll">{{ schema.exportLabel || '导出' }}</el-button>
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
          <el-button v-else-if="schema.detailColumn === column.prop" link type="primary" @click="openDetail(row)">{{ row[column.prop] || '—' }}</el-button>
          <el-tag v-else-if="column.tag" :type="tagType(row[column.prop])" effect="light">{{ row[column.prop] || '—' }}</el-tag>
          <ImageViewer v-else-if="column.image && row[column.prop]" variant="link" :src="String(row[column.prop])" :name="fileNameOf(row[column.prop])" title="附件" />
          <span v-else-if="column.image">—</span>
          <span v-else>{{ row[column.prop] === '' || row[column.prop] == null ? '—' : row[column.prop] }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="schema.form || schema.showDetail || schema.actions?.length" label="操作" fixed="right" min-width="240">
        <template #default="{ row }">
          <el-button v-if="showEdit(row)" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canShowDetail(row) && !schema.detailColumn" link type="primary" @click="openDetail(row)">详情</el-button>
          <template v-for="action in visibleActions(row)" :key="action.label">
            <ImageViewer v-if="action.image" variant="link" :label="action.label" :src="action.image(row)" title="附件" />
            <el-button v-else link :type="action.danger ? 'danger' : 'primary'" @click="runAction(action, row)">{{ action.label }}</el-button>
          </template>
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

    <el-dialog v-model="dialog" :title="schema.dialogTitle || (editingId ? '编辑' : (schema.createLabel || '新建'))" :width="schema.formWidth || (schema.form?.some((field) => field.type === 'cells') ? 1080 : 720)" destroy-on-close>
      <el-button v-if="schema.assist && !editingId" class="assist" @click="applyAssist">{{ schema.assist.label }}</el-button>
      <el-form ref="formRef" class="edit-form" :model="form" :rules="rules" :label-width="schema.labelWidth || '120px'">
        <el-row :gutter="16">
          <el-col v-for="field in schema.form" v-show="(!field.when || field.when(form)) && !gridOwns(field)" :key="field.key" :span="field.type === 'cells' ? 24 : (field.span || (field.type === 'textarea' ? 24 : 12))">
            <el-form-item :label="field.label" :prop="field.key">
              <el-select v-if="field.type === 'select' || field.type === 'multi'" v-model="form[field.key]" :multiple="field.type === 'multi'" :disabled="isDisabled(field)" clearable filterable :placeholder="field.placeholder || '请选择'" style="width: 100%" @change="onFieldChange(field.key)">
                <el-option v-for="opt in fieldOptions(field)" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <div v-else-if="field.type === 'number'" class="number-field">
                <el-input-number v-model="form[field.key]" :disabled="isDisabled(field)" :min="0" :placeholder="field.placeholder" />
                <span v-if="field.unit" class="unit">{{ field.unit }}</span>
              </div>
              <el-date-picker v-else-if="field.type === 'date'" v-model="form[field.key]" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              <el-date-picker v-else-if="field.type === 'datetime'" v-model="form[field.key]" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width: 100%" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.key]" type="textarea" :rows="3" />
              <el-upload v-else-if="field.type === 'file'" :auto-upload="false" :limit="1" :on-change="bindFile(field.key)">
                <el-button>选择文件</el-button>
                <span class="file-name">{{ form[field.key] }}</span>
              </el-upload>
              <ImageUpload
                v-else-if="field.type === 'image'"
                :src="imageFieldSrc(field.key)"
                :model-value="imageFieldFile()"
                :disabled="isDisabled(field)"
                @update:model-value="onImageFile"
                @clear="form[field.key] = ''"
              />
              <StackGridPicker
                v-else-if="field.type === 'cells'"
                class="grid-pick"
                :stack-code="String(form[field.stackKey || 'stackCode'] || '')"
                :cells="String(form[field.key] || '')"
                :stacks="stackRows"
                @update:stack-code="form[field.stackKey || 'stackCode'] = $event"
                @update:cells="form[field.key] = $event"
              />
              <div v-else-if="field.type === 'password'" class="password-field">
                <el-input v-model="form[field.key]" type="password" show-password :disabled="isDisabled(field)" :placeholder="field.placeholder" autocomplete="new-password" />
                <p class="field-hint">密码须为 {{ passwordRuleText() }}</p>
              </div>
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

    <el-dialog v-model="detailOpen" :title="detailTitle" :width="detailWidth" align-center destroy-on-close>
      <div v-loading="detailLoading">
        <section v-for="block in detailBlocks" :key="block.title" class="detail-block">
          <h3 v-if="detailBlocks.length > 1">{{ block.title }}</h3>
          <el-descriptions v-if="block.fields?.length" :column="2" border>
            <el-descriptions-item v-for="item in block.fields" :key="item.label" :label="item.label">{{ item.value }}</el-descriptions-item>
          </el-descriptions>
          <el-table v-if="block.table" :data="block.table.rows" border size="small" class="detail-table">
            <el-table-column v-for="column in block.table.columns" :key="column.prop" :label="column.label" :width="column.width" :min-width="column.minWidth">
              <template #default="{ row }">
                <el-button v-if="column.lot && lotText(row[column.prop])" link type="primary" @click="openLot(row)">{{ row[column.prop] }}</el-button>
                <span v-else>{{ row[column.prop] || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
      <template #footer>
        <el-button v-for="action in detailFooterActions()" :key="action.label" :disabled="!detailRow" @click="detailRow && runAction(action, detailRow)">{{ action.label }}</el-button>
        <el-button @click="detailOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <LotDetailDialog
      v-model="lotOpen"
      v-model:ledger="lotLedger"
      :lot="lotCurrent"
      :loading="lotLoading"
      :focus="lotFocus"
      @open-batch="(batch) => openLot({ batchNo: batch, customsNo: batch })"
    />

    <el-dialog v-if="actionDef?.dialog" v-model="actionOpen" :title="actionDef.dialog.title" width="720px" align-center destroy-on-close>
      <p v-if="actionDef.dialog.message" class="action-note">{{ actionDef.dialog.message }}</p>
      <el-form label-width="120px">
        <el-row :gutter="16">
          <el-col v-for="field in actionDef.dialog.fields" :key="field.key" :span="field.span || (field.type === 'textarea' ? 24 : 12)">
            <el-form-item :label="field.label">
              <el-select v-if="field.type === 'select'" v-model="actionForm[field.key]" :disabled="isDisabled(field)" style="width: 100%">
                <el-option v-for="opt in fieldOptions(field)" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
              <el-input v-else-if="field.type === 'textarea'" v-model="actionForm[field.key]" type="textarea" :rows="3" :placeholder="field.placeholder" />
              <el-input v-else v-model="actionForm[field.key]" :disabled="isDisabled(field)" :placeholder="field.placeholder" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="actionOpen = false">取消</el-button>
        <el-button type="primary" :loading="actionSaving" @click="submitAction">{{ actionDef.dialog.confirmLabel || '确定' }}</el-button>
      </template>
    </el-dialog>

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
.edit-form :deep(.el-form-item__label) { white-space: nowrap; }
.file-name { margin-left: 8px; color: #5a6a7e; }
.password-field { width: 100%; }
.field-hint { margin: 6px 0 0; color: #5a6a7e; font-size: 12px; line-height: 1.5; }
.number-field { display: flex; align-items: center; gap: 8px; width: 100%; }
.number-field :deep(.el-input-number) { flex: 1; width: auto; }
.unit { flex: none; color: #5a6a7e; }
.grid-pick { height: 420px; }
.detail-block + .detail-block { margin-top: 20px; }
.detail-block h3 { margin: 0 0 10px; font-size: 15px; }
.detail-table { margin-top: 12px; }
.action-note { margin: 0 0 16px; color: #5a6a7e; line-height: 1.6; }
</style>
