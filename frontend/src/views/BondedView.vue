<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { bondedApi } from '@/api'
import { downloadText } from '@/api/result'

type Row = Record<string, unknown>

const bookLoading = ref(false)
const lotLoading = ref(false)
const books = ref<Row[]>([])
const lots = ref<Row[]>([])
const bookNote = ref('')
const lotNote = ref('')
const selectedId = ref('')
const bookQuery = ref('')
const lotQuery = ref('')
const lotPage = ref(1)
const lotSize = ref(10)

const selected = computed(() => books.value.find((row) => String(row.id) === selectedId.value))
const visibleBooks = computed(() => {
  const keyword = bookQuery.value.trim().toLowerCase()
  if (!keyword) return books.value
  return books.value.filter((row) => `${row.code || ''} ${row.name || ''}`.toLowerCase().includes(keyword))
})
const activeBook = computed(() => books.value.find((row) => row.status === '在用' || row.status === '新账'))
const filteredLots = computed(() => {
  const keyword = lotQuery.value.trim().toLowerCase()
  if (!keyword) return lots.value
  return lots.value.filter((row) => `${row.direction || ''} ${row.customsNo || ''} ${row.blNo || ''} ${row.consignor || ''}`.toLowerCase().includes(keyword))
})
const pagedLots = computed(() => {
  const start = (lotPage.value - 1) * lotSize.value
  return filteredLots.value.slice(start, start + lotSize.value)
})
const subtitle = computed(() => {
  const row = selected.value
  if (!row) return '左侧选择账册，右侧查看账册记录'
  const parts = [row.code, row.status].filter(Boolean).map(String)
  if (row.prevBook) parts.push(`衔接 ${row.prevBook}`)
  if (row.warnDate) parts.push(`预警 ${row.warnDate}`)
  return parts.join(' · ')
})
function shortError(message: string | undefined, fallback: string) {
  const text = (message || '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > 80 || /sql|exception/i.test(text)) return fallback
  return text
}

async function loadLots() {
  const book = selected.value
  if (!book) {
    lots.value = []
    lotNote.value = ''
    return
  }
  lotLoading.value = true
  const res = await bondedApi.lots(String(book.code))
  lotLoading.value = false
  if (!res.success || !res.data) {
    lots.value = []
    lotNote.value = shortError(res.message, '账册记录暂时无法读取')
    return
  }
  lots.value = res.data
  lotNote.value = ''
}

async function loadBooks() {
  bookLoading.value = true
  const res = await bondedApi.list({ page: 1, pageSize: 200 })
  bookLoading.value = false
  if (!res.success || !res.data) {
    bookNote.value = shortError(res.message, '账册暂时无法读取')
    ElMessage.error(bookNote.value)
    books.value = []
    selectedId.value = ''
    lots.value = []
    return
  }
  bookNote.value = ''
  books.value = res.data.list
  const current = books.value.find((row) => String(row.id) === selectedId.value)
  const next = current || books.value[0]
  if (!next) {
    selectedId.value = ''
    lots.value = []
    lotNote.value = ''
    return
  }
  const changed = String(next.id) !== selectedId.value
  selectedId.value = String(next.id)
  if (changed) lotPage.value = 1
  if (changed || !lots.value.length) loadLots()
}

function pick(row: Row) {
  if (String(row.id) === selectedId.value) return
  selectedId.value = String(row.id)
  lotQuery.value = ''
  lotPage.value = 1
  loadLots()
}

function searchLots() {
  lotPage.value = 1
}

const dialog = ref(false)
const saving = ref(false)
const exporting = ref(false)
const formRef = ref<FormInstance>()
const editingId = ref('')
const form = reactive({
  code: '',
  name: '',
  warnDate: '',
})
const rules: FormRules = {
  code: [{ required: true, message: '请填写账册编号', trigger: 'blur' }],
  name: [{ required: true, message: '请填写账册名称', trigger: 'blur' }],
  warnDate: [{
    validator: (_rule, value, callback) => {
      const linking = editingId.value ? !!selected.value?.prevBook : !!activeBook.value
      if (linking && !value) callback(new Error('衔接旧账册须填写旧账预警日期'))
      else callback()
    },
    trigger: 'change',
  }],
}
const filingHint = computed(() => {
  if (editingId.value) return ''
  if (bookNote.value) return '账册列表暂时读不到，保存时会按当前在用账册自动衔接。'
  const book = activeBook.value
  if (!book) return '当前没有在用账册，本账册作为首本备案。'
  return `将衔接 ${book.code} ${book.name || ''}。保存后该账册停用，只把在册未出库的票货转入新账册。`
})

function openCreate() {
  editingId.value = ''
  Object.assign(form, { code: '', name: '', warnDate: '' })
  dialog.value = true
}

function openEdit() {
  const row = selected.value
  if (!row) return
  editingId.value = String(row.id)
  Object.assign(form, {
    code: String(row.code || ''),
    name: String(row.name || ''),
    warnDate: String(row.warnDate || ''),
  })
  dialog.value = true
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  const body = { code: form.code, name: form.name, warnDate: form.warnDate }
  const res = editingId.value
    ? await bondedApi.update(editingId.value, body)
    : await bondedApi.create(body)
  saving.value = false
  if (!res.success) {
    ElMessage.error(shortError(res.message, '保存失败'))
    return
  }
  ElMessage.success(res.message || '已保存')
  dialog.value = false
  const createdCode = editingId.value ? '' : form.code
  await loadBooks()
  if (createdCode) {
    const matched = books.value.find((row) => String(row.code) === createdCode)
    if (matched && String(matched.id) !== selectedId.value) {
      selectedId.value = String(matched.id)
      lotPage.value = 1
      loadLots()
    }
  }
}

async function exportLots() {
  const book = selected.value
  if (!book) return
  exporting.value = true
  const res = await bondedApi.exportLots(String(book.code))
  exporting.value = false
  if (!res.success || !res.data?.content) {
    ElMessage.error(res.message || '导出失败')
    return
  }
  downloadText(res.data.filename || `${book.code}-票矿.csv`, res.data.content)
}

onMounted(loadBooks)
</script>

<template>
  <div class="book-page">
    <aside class="nav" v-loading="bookLoading">
      <el-input v-model="bookQuery" class="find" clearable placeholder="查找账册" />
      <div class="nav-list">
        <button
          v-for="row in visibleBooks"
          :key="String(row.id)"
          type="button"
          class="nav-item"
          :class="{ on: String(row.id) === selectedId }"
          @click="pick(row)"
        >
          <span class="nav-name">{{ row.name || row.code }}</span>
          <span class="nav-code">{{ row.code }} · {{ row.status || '—' }}</span>
        </button>
        <p v-if="!bookLoading && !visibleBooks.length" class="nav-empty">{{ books.length ? '没有匹配的账册' : (bookNote || '还没有账册') }}</p>
      </div>
    </aside>

    <section class="body">
      <header class="head">
        <div>
          <h2>{{ selected?.name || '保税账册' }}</h2>
          <p>{{ subtitle }}</p>
        </div>
        <div class="head-actions">
          <el-button v-if="selected" @click="openEdit">编辑</el-button>
          <el-button type="primary" @click="openCreate">备案账册</el-button>
        </div>
      </header>

      <div v-if="selected" class="card">
        <div class="card-head">
          <h3>账册记录</h3>
          <div class="card-tools">
            <el-input v-model="lotQuery" clearable placeholder="报关单号 / 提单号" style="width: 200px" @input="searchLots" @clear="searchLots" />
            <el-button :loading="exporting" @click="exportLots">导出</el-button>
          </div>
        </div>
        <p v-if="lotNote" class="lot-note">{{ lotNote }}</p>
        <el-table v-loading="lotLoading" :data="pagedLots" empty-text="暂无账册记录">
          <el-table-column prop="direction" label="方向" width="80" />
          <el-table-column prop="customsNo" label="报关单号" min-width="160" show-overflow-tooltip />
          <el-table-column prop="blNo" label="提单号" min-width="120" show-overflow-tooltip />
          <el-table-column prop="consignor" label="委托方" min-width="120" show-overflow-tooltip />
          <el-table-column prop="wet" label="湿吨" width="90" />
          <el-table-column prop="dry" label="干吨" width="90" />
          <el-table-column prop="time" label="时间" min-width="150" />
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="lotPage"
            v-model:page-size="lotSize"
            :total="filteredLots.length"
            layout="total, prev, pager, next"
            background
          />
        </div>
      </div>
      <p v-else class="placeholder">{{ bookNote || '还没有账册，请在右侧备案。' }}</p>
    </section>

    <el-dialog v-model="dialog" :title="editingId ? '编辑账册' : '备案账册'" width="520" destroy-on-close>
      <p v-if="filingHint" class="filing-hint">{{ filingHint }}</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="账册编号" prop="code">
          <el-input v-model="form.code" maxlength="64" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item label="账册名称" prop="name">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="旧账预警日" prop="warnDate">
          <el-date-picker v-model="form.warnDate" type="date" value-format="YYYY-MM-DD" placeholder="衔接旧账册时必填" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.book-page {
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
.head-actions { display: flex; gap: 8px; padding-top: 6px; flex: none; }
.card {
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 8px 16px 12px;
}
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 12px; flex-wrap: wrap; }
.card-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.card-tools { display: flex; align-items: center; gap: 8px; }
.lot-note { margin: 0 0 8px; color: #8a5a00; font-size: 13px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.placeholder { margin: 8px 0 0; color: #616161; }
.filing-hint { margin: 0 0 16px; color: #5d5d5d; font-size: 13px; line-height: 1.6; }
@media (max-width: 1100px) {
  .book-page { flex-direction: column; height: auto; min-height: calc(100vh - 56px); overflow: visible; }
  .nav { width: auto; max-height: 320px; }
}
</style>
