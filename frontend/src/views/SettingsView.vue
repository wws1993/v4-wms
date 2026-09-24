<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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
const params = reactive({ capacityWarn: 70, ageWarn: 90, dockDays: 7, filingUsageWarn: 80, qualities: '' })
const roles: { key: RoleKey; label: string }[] = [
  { key: 'admin', label: '系统管理员' },
  { key: 'warehouse', label: '仓管员' },
  { key: 'customs', label: '关务员' },
]

onMounted(async () => {
  const [permRes, paramRes] = await Promise.all([authApi.permissions(), settingsApi.get()])
  if (permRes.success && permRes.data) Object.assign(perms, permRes.data)
  if (paramRes.success && paramRes.data) Object.assign(params, paramRes.data)
})

async function saveRole(role: RoleKey) {
  const res = await authApi.savePermissions(role, perms[role])
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  if (auth.user?.roleKey === role) auth.setPages(perms[role])
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
      <div v-for="role in roles" :key="role.key" class="role">
        <div class="role-head">
          <strong>{{ role.label }}</strong>
          <el-button type="primary" @click="saveRole(role.key)">保存</el-button>
        </div>
        <div v-for="group in NAV_GROUPS" :key="group" class="group">
          <span>{{ group }}</span>
          <el-checkbox-group v-model="perms[role.key]">
            <el-checkbox v-for="item in NAV.filter((nav) => nav.group === group)" :key="item.id" :value="item.id">{{ item.title }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </div>
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
.role { padding: 8px 0 16px; border-bottom: 1px solid #d8dee8; }
.role-head, .group { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.group { margin-top: 8px; }
.group span { width: 88px; color: #5a6a7e; flex: none; }
.params { max-width: 640px; padding-top: 8px; }
</style>
