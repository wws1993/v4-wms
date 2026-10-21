<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { settingsApi } from '@/api'
import DataPage from '@/components/DataPage.vue'
import FloorPlanEditor from '@/components/FloorPlanEditor.vue'
import NavPane from '@/components/NavPane.vue'
import SecurityPolicyForm from '@/components/SecurityPolicyForm.vue'
import { usePageTab } from '@/hooks/pageTab'
import CacheManage from '@/views/settings/CacheManage.vue'
import MenuManage from '@/views/settings/MenuManage.vue'
import RoleManage from '@/views/settings/RoleManage.vue'

const route = useRoute()
const openedSecurity = route.query.tab === 'security'
const tab = usePageTab('roles', ['roles', 'menus', 'users', 'params', 'plan', 'cache'])
const paramTab = ref<'warn' | 'quality' | 'security'>(openedSecurity ? 'security' : 'warn')
if (openedSecurity) tab.value = 'params'
const paramNav = [
  { key: 'warn' as const, label: '预警参数' },
  { key: 'quality' as const, label: '品质参数' },
  { key: 'security' as const, label: '安全策略' },
]
const paramTitle = computed(() => paramNav.find((item) => item.key === paramTab.value)?.label || '系统参数')
const params = reactive({ capacityWarn: 70, ageWarn: 90, dockDays: 7, filingUsageWarn: 80, refreshInterval: 3, qualities: '' })
const qualityNames: Record<string, string> = { Cu: '铜', Ag: '银', Au: '金', As: '砷', Pb: '铅', Cd: '镉', F: '氟', Hg: '汞' }
const harmfulSymbols = new Set(['As', 'Pb', 'Cd', 'F', 'Hg'])
const taxableSymbols = new Set(['Cu', 'Ag', 'Au'])

interface QualityRow {
  name: string
  symbol: string
  harmful: boolean
  taxable: boolean
  isRequired: string
}

const qualityRows = ref<QualityRow[]>([])

function qualityFromSymbol(symbol: string): QualityRow {
  return {
    symbol,
    name: qualityNames[symbol] || symbol,
    harmful: harmfulSymbols.has(symbol),
    taxable: taxableSymbols.has(symbol),
    isRequired: '0',
  }
}
onMounted(async () => {
  const paramRes = await settingsApi.get()
  if (paramRes.success && paramRes.data) {
    Object.assign(params, paramRes.data)
    const saved = paramRes.data.qualityItems
    qualityRows.value = Array.isArray(saved) && saved.length
      ? saved.map((item) => {
        const row = item as Partial<QualityRow>
        const symbol = String(row.symbol || '')
        const known = qualityFromSymbol(symbol)
        return {
          name: String(row.name || known.name),
          symbol,
          harmful: row.harmful == null ? known.harmful : Boolean(row.harmful),
          taxable: row.taxable == null ? known.taxable : Boolean(row.taxable),
          isRequired: String(row.isRequired || '0'),
        }
      })
      : String(params.qualities || '').split(/[、,，\s]+/).filter(Boolean).map(qualityFromSymbol)
  }
})

function addQuality() {
  qualityRows.value.push({ name: '', symbol: '', harmful: false, taxable: false, isRequired: '0' })
}

function syncQualities() {
  params.qualities = qualityRows.value.map((row) => row.symbol.trim()).filter(Boolean).join('、')
}

async function saveParams() {
  syncQualities()
  const res = await settingsApi.save({ ...params, qualityItems: qualityRows.value })
  if (res.success) ElMessage.success(res.message)
  else ElMessage.error(res.message)
}
</script>

<template>
  <el-tabs v-model="tab" class="settings fill">
    <el-tab-pane label="角色管理" name="roles">
      <RoleManage v-if="tab === 'roles'" />
    </el-tab-pane>
    <el-tab-pane label="菜单管理" name="menus">
      <MenuManage v-if="tab === 'menus'" />
    </el-tab-pane>
    <el-tab-pane label="账号管理" name="users">
      <DataPage v-if="tab === 'users'" name="users" />
    </el-tab-pane>
    <el-tab-pane label="系统参数" name="params">
      <NavPane v-model="paramTab" :items="paramNav">
          <h2>{{ paramTitle }}</h2>
          <el-form v-if="paramTab === 'warn'" label-width="180px" class="params">
            <el-form-item label="库存预警阈值（%）"><el-input-number v-model="params.capacityWarn" :min="1" :max="100" /></el-form-item>
            <el-form-item label="原料库龄预警（天）"><el-input-number v-model="params.ageWarn" :min="1" /></el-form-item>
            <el-form-item label="码头仓库预警（天）"><el-input-number v-model="params.dockDays" :min="1" /></el-form-item>
            <el-form-item label="矿源备案用量预警（%）"><el-input-number v-model="params.filingUsageWarn" :min="1" :max="100" /></el-form-item>
            <el-form-item label="首页数据刷新时效（分钟）"><el-input-number v-model="params.refreshInterval" :min="1" /></el-form-item>
            <el-form-item><el-button type="primary" @click="saveParams">保存参数</el-button></el-form-item>
          </el-form>
          <el-form v-else-if="paramTab === 'quality'" label-width="0" class="params">
            <el-table :data="qualityRows" border size="small">
              <el-table-column label="元素名称" min-width="120"><template #default="{ row }"><el-input v-model="row.name" /></template></el-table-column>
              <el-table-column label="符号" width="120"><template #default="{ row }"><el-input v-model="row.symbol" /></template></el-table-column>
              <el-table-column label="是否有害元素" width="120"><template #default="{ row }"><el-checkbox v-model="row.harmful" /></template></el-table-column>
              <el-table-column label="是否报税元素" width="120"><template #default="{ row }"><el-checkbox v-model="row.taxable" /></template></el-table-column>
              <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="primary" @click="qualityRows.splice($index, 1)">删除</el-button></template></el-table-column>
            </el-table>
            <el-button class="add" size="small" @click="addQuality">新增参数</el-button>
            <div class="save-row"><el-button type="primary" @click="saveParams">保存参数</el-button></div>
          </el-form>
          <SecurityPolicyForm v-else />
      </NavPane>
    </el-tab-pane>
    <el-tab-pane label="平面图设置" name="plan">
      <FloorPlanEditor v-if="tab === 'plan'" />
    </el-tab-pane>
    <el-tab-pane label="本机缓存管理" name="cache">
      <CacheManage v-if="tab === 'cache'" />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.settings.fill { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.settings.fill :deep(.el-tabs__header) { flex: none; }
.settings.fill :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.settings.fill :deep(.el-tab-pane) { height: 100%; }
.params { max-width: 860px; }
.add { margin-top: 8px; }
.save-row { margin-top: 16px; }
</style>
