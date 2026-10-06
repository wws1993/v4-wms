<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { authApi, settingsApi } from '@/api'
import { NAV, NAV_GROUPS } from '@/nav'
import { useAuthStore } from '@/stores/auth'
import DataPage from '@/components/DataPage.vue'
import FloorPlanEditor from '@/components/FloorPlanEditor.vue'
import type { RoleKey } from '@/types'

const auth = useAuthStore()
const tab = ref('users')
const perms = reactive<Record<RoleKey, string[]>>({ admin: [], warehouse: [], customs: [] })
const counts = reactive<Record<RoleKey, number>>({ admin: 0, warehouse: 0, customs: 0 })
const params = reactive({ capacityWarn: 70, ageWarn: 90, dockDays: 7, filingUsageWarn: 80, qualities: '' })
const roles: { key: RoleKey; label: string; desc: string }[] = [
  { key: 'admin', label: '系统管理员', desc: '全量配置' },
  { key: 'warehouse', label: '仓管员', desc: '日常仓储作业' },
  { key: 'customs', label: '关务员', desc: '关务监管作业' },
]
const permOpen = ref(false)
const permRole = ref<RoleKey>('admin')
const permDraft = ref<string[]>([])

const permTitle = computed(() => `配置权限 · ${roles.find((role) => role.key === permRole.value)?.label || ''}`)

function countOf(key: string) {
  if (key === 'admin' || key === 'warehouse' || key === 'customs') return counts[key]
  return 0
}

function summary(role: RoleKey) {
  const pages = new Set(perms[role] || [])
  const titles = NAV.filter((item) => pages.has(item.id)).map((item) => item.title)
  if (!titles.length) return '未配置'
  if (titles.length === NAV.length) return '全部模块'
  return titles.length > 4 ? `${titles.slice(0, 4).join(' / ')} 等 ${titles.length} 项` : titles.join(' / ')
}

onMounted(async () => {
  const [permRes, paramRes, userRes] = await Promise.all([
    authApi.permissions(),
    settingsApi.get(),
    authApi.users({ page: 1, pageSize: 200 }),
  ])
  if (permRes.success && permRes.data) Object.assign(perms, permRes.data)
  if (paramRes.success && paramRes.data) Object.assign(params, paramRes.data)
  if (userRes.success && userRes.data) {
    for (const role of roles) counts[role.key] = 0
    for (const row of userRes.data.list) {
      const key = String(row.roleKey) as RoleKey
      if (key in counts) counts[key] += 1
    }
  }
})

function openPerm(role: RoleKey) {
  permRole.value = role
  permDraft.value = [...(perms[role] || [])]
  permOpen.value = true
}

async function saveRole() {
  const role = permRole.value
  const res = await authApi.savePermissions(role, permDraft.value)
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  perms[role] = [...permDraft.value]
  if (auth.user?.roleKey === role) auth.setPages(perms[role])
  permOpen.value = false
  ElMessage.success('权限已保存')
}

async function saveParams() {
  const res = await settingsApi.save({ ...params })
  if (res.success) ElMessage.success(res.message)
  else ElMessage.error(res.message)
}
</script>

<template>
  <el-tabs v-model="tab">
    <el-tab-pane label="账号管理" name="users">
      <DataPage v-if="tab === 'users'" name="users" />
    </el-tab-pane>
    <el-tab-pane label="角色权限" name="roles">
      <el-table :data="roles" border stripe>
        <el-table-column prop="label" label="角色" width="140" />
        <el-table-column prop="desc" label="说明" width="160" />
        <el-table-column label="权限摘要" min-width="280">
          <template #default="{ row }">{{ summary(row.key) }}</template>
        </el-table-column>
        <el-table-column label="人数" width="90">
          <template #default="{ row }">{{ countOf(row.key) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPerm(row.key)">配置权限</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-dialog v-model="permOpen" :title="permTitle" width="760px" align-center destroy-on-close>
        <p class="perm-note">按菜单模块勾选该角色可访问的页面。关务员默认菜单全开；关务员操作在审计中单独标识。</p>
        <div v-for="group in NAV_GROUPS" :key="group" class="group">
          <span>{{ group }}</span>
          <el-checkbox-group v-model="permDraft">
            <el-checkbox v-for="item in NAV.filter((nav) => nav.group === group)" :key="item.id" :value="item.id">{{ item.title }}</el-checkbox>
          </el-checkbox-group>
        </div>
        <template #footer>
          <el-button @click="permOpen = false">取消</el-button>
          <el-button type="primary" @click="saveRole">保存</el-button>
        </template>
      </el-dialog>
    </el-tab-pane>
    <el-tab-pane label="系统参数" name="params">
      <el-form label-width="180px" class="params">
        <el-form-item label="库容预警（%）"><el-input-number v-model="params.capacityWarn" :min="1" :max="100" /></el-form-item>
        <el-form-item label="原料库龄（天）"><el-input-number v-model="params.ageWarn" :min="1" /></el-form-item>
        <el-form-item label="码头超期（天）"><el-input-number v-model="params.dockDays" :min="1" /></el-form-item>
        <el-form-item label="备案用量预警（%）"><el-input-number v-model="params.filingUsageWarn" :min="1" :max="100" /></el-form-item>
        <el-form-item label="品质参数"><el-input v-model="params.qualities" /></el-form-item>
        <el-form-item><el-button type="primary" @click="saveParams">保存参数</el-button></el-form-item>
      </el-form>
    </el-tab-pane>
    <el-tab-pane label="平面图设置" name="plan">
      <FloorPlanEditor v-if="tab === 'plan'" />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.group { display: flex; gap: 12px; align-items: flex-start; margin-top: 12px; }
.group span { width: 88px; color: #5a6a7e; flex: none; line-height: 32px; }
.perm-note { margin: 0 0 4px; color: #5a6a7e; line-height: 1.6; }
.params { max-width: 640px; padding-top: 8px; }
</style>
