<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authApi, settingsApi } from '@/api'
import { NAV, NAV_GROUPS } from '@/nav'
import { useAuthStore } from '@/stores/auth'
import DataPage from '@/components/DataPage.vue'
import FloorPlanEditor from '@/components/FloorPlanEditor.vue'
import NavPane from '@/components/NavPane.vue'
import SecurityPolicyForm from '@/components/SecurityPolicyForm.vue'
import { usePageTab } from '@/hooks/pageTab'
import type { RoleKey } from '@/types'

const auth = useAuthStore()
const route = useRoute()
const openedSecurity = route.query.tab === 'security'
const tab = usePageTab('roles', ['roles', 'users', 'params', 'plan'])
const paramTab = ref<'warn' | 'quality' | 'security'>(openedSecurity ? 'security' : 'warn')
if (openedSecurity) tab.value = 'params'
const paramNav = [
  { key: 'warn' as const, label: '预警参数' },
  { key: 'quality' as const, label: '品质参数' },
  { key: 'security' as const, label: '安全策略' },
]
const paramTitle = computed(() => paramNav.find((item) => item.key === paramTab.value)?.label || '系统参数')
const perms = reactive<Record<RoleKey, string[]>>({ admin: [], warehouse: [], customs: [] })
const counts = reactive<Record<RoleKey, number>>({ admin: 0, warehouse: 0, customs: 0 })
const params = reactive({ capacityWarn: 70, ageWarn: 90, dockDays: 7, filingUsageWarn: 80, qualities: '' })
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
const roles: { key: RoleKey; label: string; desc: string }[] = [
  { key: 'admin', label: '系统管理员', desc: '全量配置' },
  { key: 'warehouse', label: '仓管员', desc: '日常仓储作业' },
  { key: 'customs', label: '关务员', desc: '关务监管，默认菜单全开' },
]
const selectedRole = ref<RoleKey>('admin')
const drafts = reactive<Record<RoleKey, string[]>>({ admin: [], warehouse: [], customs: [] })
const savingRole = ref(false)
const roleItems = computed(() => roles.map((role) => ({
  key: role.key,
  label: role.label,
  hint: `${countOf(role.key)} 人`,
})))
const currentRole = computed(() => roles.find((role) => role.key === selectedRole.value) || roles[0])
const permGroups = computed(() => NAV_GROUPS.filter((group) => NAV.some((item) => item.group === group)))

function countOf(key: string) {
  if (key === 'admin' || key === 'warehouse' || key === 'customs') return counts[key]
  return 0
}

onMounted(async () => {
  const [permRes, paramRes, userRes] = await Promise.all([
    authApi.permissions(),
    settingsApi.get(),
    authApi.users({ page: 1, pageSize: 200 }),
  ])
  if (permRes.success && permRes.data) {
    Object.assign(perms, permRes.data)
    for (const role of roles) drafts[role.key] = [...(perms[role.key] || [])]
  }
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
  if (userRes.success && userRes.data) {
    for (const role of roles) counts[role.key] = 0
    for (const row of userRes.data.list) {
      const key = String(row.roleKey) as RoleKey
      if (key in counts) counts[key] += 1
    }
  }
})

async function saveRole() {
  const role = selectedRole.value
  savingRole.value = true
  const res = await authApi.savePermissions(role, drafts[role])
  savingRole.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  perms[role] = [...drafts[role]]
  if (auth.user?.roleKey === role) auth.setPages(perms[role])
  ElMessage.success('权限已保存')
}

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
    <el-tab-pane label="角色权限" name="roles">
      <NavPane v-model="selectedRole" class="role-pane" searchable search-placeholder="查找角色" :items="roleItems">
        <div class="role-head">
          <h2>{{ currentRole.label }}</h2>
          <el-button type="primary" :loading="savingRole" @click="saveRole">保存</el-button>
        </div>
        <p class="role-desc">{{ currentRole.desc }} · {{ countOf(currentRole.key) }} 人 · 已选 {{ drafts[selectedRole].length }} 项</p>
        <div v-for="group in permGroups" :key="group" class="group">
          <h4>{{ group }}</h4>
          <el-checkbox-group v-model="drafts[selectedRole]">
            <el-checkbox v-for="item in NAV.filter((nav) => nav.group === group)" :key="item.id" :value="item.id">{{ item.title }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </NavPane>
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
  </el-tabs>
</template>

<style scoped>
.settings.fill { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.settings.fill :deep(.el-tabs__header) { flex: none; }
.settings.fill :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.settings.fill :deep(.el-tab-pane) { height: 100%; }
.role-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.role-head h2 { margin: 0; }
.role-desc { margin: 0 0 8px; color: #5d5d5d; font-size: 14px; }
.role-pane .group { margin-top: 18px; }
.role-pane .group h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #5d5d5d; }
.role-pane .group :deep(.el-checkbox) { margin: 0 18px 10px 0; height: 32px; }
.role-pane .group :deep(.el-checkbox__label) { color: #1a2332; }
.params { max-width: 860px; }
.add { margin-top: 8px; }
.save-row { margin-top: 16px; }
</style>
