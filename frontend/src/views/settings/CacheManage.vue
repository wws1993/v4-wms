<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cacheApi } from '@/api'
import type { CacheEntry } from '@/api/catalogCache'
import NavPane from '@/components/NavPane.vue'

const entries = ref<CacheEntry[]>([])
const selectedKey = ref('')

const navItems = computed(() => entries.value.map((item) => ({
  key: item.key,
  label: item.label,
  hint: item.key,
})))

const current = computed(() => entries.value.find((item) => item.key === selectedKey.value) || null)

const tableRows = computed(() => {
  const entry = current.value
  if (!entry?.present) return [] as Record<string, unknown>[]
  try {
    const parsed = JSON.parse(entry.json) as unknown
    return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : []
  } catch {
    return []
  }
})

const columns = computed(() => {
  const keys = new Set<string>()
  tableRows.value.forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => keys.add(key))
    }
  })
  return [...keys]
})

function cellText(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}

function reload() {
  const keep = selectedKey.value
  entries.value = cacheApi.list()
  if (keep && entries.value.some((item) => item.key === keep)) selectedKey.value = keep
  else selectedKey.value = entries.value[0]?.key || ''
}

watch(navItems, (items) => {
  if (!items.length) {
    selectedKey.value = ''
    return
  }
  if (!items.some((item) => item.key === selectedKey.value)) selectedKey.value = items[0].key
})

async function clearCurrent() {
  const entry = current.value
  if (!entry?.present) return
  try {
    await ElMessageBox.confirm(`确认清空「${entry.label}」？`, '清空缓存')
  } catch {
    return
  }
  const res = await cacheApi.clearKey(entry.key)
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已清空')
  reload()
}

async function clearAll() {
  try {
    await ElMessageBox.confirm('确认清空全部本机会话缓存？字典后端缓存会一并刷新。', '全部清空')
  } catch {
    return
  }
  const res = await cacheApi.clearAll()
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已全部清空')
  reload()
}

onMounted(reload)
onActivated(reload)
</script>

<template>
  <div class="cache-manage">
    <NavPane
      v-model="selectedKey"
      class="cache-pane"
      searchable
      search-placeholder="查找缓存"
      :items="navItems"
    >
      <template v-if="current">
        <div class="cache-head">
          <h2>{{ current.label }}</h2>
          <div class="cache-actions">
            <el-button @click="reload">刷新列表</el-button>
            <el-button :disabled="!current.present" type="danger" plain @click="clearCurrent">清空此项</el-button>
            <el-button type="danger" plain @click="clearAll">全部清空</el-button>
          </div>
        </div>
        <p class="cache-desc">
          {{ current.key }}
          ·
          <template v-if="current.present">已缓存 {{ current.count }} 条</template>
          <template v-else>未缓存</template>
        </p>
        <el-table
          :data="tableRows"
          border
          :empty-text="current.present ? '缓存为空' : '尚未写入本机缓存'"
        >
          <el-table-column
            v-for="col in columns"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ cellText(row[col]) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <div v-else class="empty-cache">暂无缓存项</div>
    </NavPane>
  </div>
</template>

<style scoped>
.cache-manage, .cache-pane { height: 100%; min-height: 420px; }
.cache-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.cache-head h2 { margin: 0; }
.cache-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cache-desc { margin: 0 0 16px; color: #5d5d5d; font-size: 14px; }
.empty-cache { padding-top: 24px; color: #5d5d5d; }
</style>
