<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { menuApi, roleApi } from '@/api'
import NavPane from '@/components/NavPane.vue'
import { pageIdsFromTitles } from '@/nav'
import { useAuthStore } from '@/stores/auth'

interface MenuNode {
  id: string
  parentId: string
  name: string
  menuType: string
  children?: MenuNode[]
}

interface RoleRow {
  id: string
  name: string
  key: string
  sort: number
  status: string
  remark: string
  dataScope: string
  admin: boolean
}

interface MenuGroup {
  name: string
  items: { id: string; name: string }[]
}

const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const roles = ref<RoleRow[]>([])
const tree = ref<MenuNode[]>([])
const selectedId = ref('')
const checked = ref<string[]>([])
const grantedIds = ref<string[]>([])
const draft = reactive({ name: '', key: '', sort: 1, status: '启用', remark: '', dataScope: '1' })
const creating = ref(false)
const creatingSave = ref(false)
const createRef = ref<FormInstance>()
const createForm = reactive({ name: '', key: '', sort: 1, status: '启用', remark: '' })
const createRules: FormRules = {
  name: [{ required: true, message: '请填写角色名称', trigger: 'blur' }],
  key: [
    { required: true, message: '请填写权限字符', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_]+$/, message: '只能包含字母、数字和下划线', trigger: 'blur' },
  ],
}

const roleItems = computed(() => roles.value.map((role) => ({
  key: role.id,
  label: role.name,
  hint: role.status,
})))
const current = computed(() => roles.value.find((role) => role.id === selectedId.value))

function leavesOf(node: MenuNode) {
  const items: { id: string; name: string }[] = []
  const walk = (currentNode: MenuNode) => {
    for (const child of currentNode.children || []) {
      if (child.menuType !== 'C') continue
      items.push({ id: child.id, name: child.name })
      walk(child)
    }
  }
  walk(node)
  return items
}

const groups = computed<MenuGroup[]>(() => {
  const list: MenuGroup[] = []
  const loose: { id: string; name: string }[] = []
  for (const node of tree.value) {
    if (node.menuType === 'M') {
      const items = leavesOf(node)
      if (items.length) list.push({ name: node.name, items })
      for (const child of node.children || []) {
        if (child.menuType !== 'M') continue
        const nested = leavesOf(child)
        if (nested.length) list.push({ name: child.name, items: nested })
      }
    } else if (node.menuType === 'C') loose.push({ id: node.id, name: node.name })
  }
  if (loose.length) list.push({ name: '其他', items: loose })
  return list
})
const leafIds = computed(() => new Set(groups.value.flatMap((group) => group.items.map((item) => item.id))))
const selectedCount = computed(() => checked.value.filter((id) => leafIds.value.has(id)).length)

function parentMap(nodes: MenuNode[]) {
  const map = new Map<string, string>()
  const walk = (list: MenuNode[], parentId: string) => {
    list.forEach((node) => {
      map.set(node.id, parentId)
      if (node.children) walk(node.children, node.id)
    })
  }
  walk(nodes, '0')
  return map
}

function withAncestors(ids: string[]) {
  const parents = parentMap(tree.value)
  const all = new Set(ids)
  ids.forEach((id) => {
    let cursor = parents.get(id)
    while (cursor && cursor !== '0') {
      all.add(cursor)
      cursor = parents.get(cursor)
    }
  })
  return [...all]
}

function checkedMenus(ids: string[]) {
  const owned = new Set(ids)
  const picked: string[] = []
  const walk = (nodes: MenuNode[]): boolean => {
    let hit = false
    nodes.forEach((node) => {
      const below = node.children?.length ? walk(node.children) : false
      const on = owned.has(node.id) || below
      if (on && leafIds.value.has(node.id)) picked.push(node.id)
      if (on) hit = true
    })
    return hit
  }
  walk(tree.value)
  return picked
}

function buttonsUnderMenus(menuIds: Set<string>) {
  const granted = new Set(grantedIds.value)
  const keep: string[] = []
  const walk = (nodes: MenuNode[], underMenu: boolean) => {
    nodes.forEach((node) => {
      const inside = node.menuType === 'C' ? menuIds.has(node.id) : underMenu
      if (node.menuType === 'F' && granted.has(node.id) && inside) keep.push(node.id)
      if (node.children) walk(node.children, inside)
    })
  }
  walk(tree.value, false)
  return keep
}

let ticket = 0
async function fill(role: RoleRow) {
  const currentTicket = ++ticket
  draft.name = role.name
  draft.key = role.key
  draft.sort = role.sort
  draft.status = role.status || '启用'
  draft.remark = role.remark
  draft.dataScope = role.dataScope || '1'
  checked.value = []
  const res = await roleApi.menus(role.id)
  if (currentTicket !== ticket) return
  const ids = res.success && Array.isArray(res.data) ? res.data.map(String) : []
  grantedIds.value = ids
  checked.value = checkedMenus(ids)
  if (!res.success) ElMessage.error(res.message)
}

async function loadRoles(preferKey = '') {
  loading.value = true
  const res = await roleApi.list()
  loading.value = false
  if (!res.success || !Array.isArray(res.data)) {
    ElMessage.error(res.message || '角色加载失败')
    roles.value = []
    return
  }
  roles.value = res.data.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    key: String(row.key || ''),
    sort: Number(row.sort || 0),
    status: String(row.status || '启用'),
    remark: String(row.remark || ''),
    dataScope: String(row.dataScope || '1'),
    admin: row.admin === true,
  })).filter((row) => row.id)
  const next = roles.value.find((role) => role.key === preferKey)
    || roles.value.find((role) => role.id === selectedId.value)
    || roles.value[0]
  if (!next) {
    selectedId.value = ''
    return
  }
  if (selectedId.value !== next.id) selectedId.value = next.id
  else fill(next)
}

async function loadMenus() {
  const res = await menuApi.tree()
  tree.value = res.success && Array.isArray(res.data) ? res.data as MenuNode[] : []
  if (!res.success) ElMessage.error(res.message)
}

watch(selectedId, (id) => {
  const role = roles.value.find((item) => item.id === id)
  if (role) fill(role)
})

onMounted(async () => {
  await loadMenus()
  await loadRoles()
})

function openCreate() {
  Object.assign(createForm, { name: '', key: '', sort: roles.value.length + 1, status: '启用', remark: '' })
  creating.value = true
}

async function submitCreate() {
  await createRef.value?.validate()
  const first = groups.value.flatMap((group) => group.items)[0]
  if (!first) {
    ElMessage.error('还没有可绑定的菜单')
    return
  }
  creatingSave.value = true
  const res = await roleApi.create({ ...createForm, dataScope: '1', menuIds: withAncestors([first.id]) })
  creatingSave.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '角色已创建')
  creating.value = false
  await loadRoles(createForm.key)
}

async function save() {
  if (!current.value) return
  saving.value = true
  const selectedMenus = checked.value.filter((id) => leafIds.value.has(id))
  const menuIds = withAncestors([...selectedMenus, ...buttonsUnderMenus(new Set(selectedMenus))])
  const res = await roleApi.update(current.value.id, { ...draft, menuIds })
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  const names = groups.value.flatMap((group) => group.items).filter((item) => checked.value.includes(item.id)).map((item) => item.name)
  const mine = auth.user && (auth.user.roleName === draft.name || auth.user.roleKey === draft.key)
  if (mine) auth.setPages(pageIdsFromTitles(names, 'dashboard'))
  ElMessage.success(res.message || '角色已保存')
  await loadRoles(draft.key)
}

async function remove() {
  if (!current.value || current.value.admin) return
  try {
    await ElMessageBox.confirm(`确认删除角色「${current.value.name}」？`, '确认')
  } catch {
    return
  }
  const res = await roleApi.remove(current.value.id)
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已删除')
  selectedId.value = ''
  await loadRoles()
}
</script>

<template>
  <div v-loading="loading" class="role-manage">
  <NavPane v-model="selectedId" class="role-pane" searchable search-placeholder="查找角色" :items="roleItems">
    <template v-if="current">
      <div class="role-head">
        <h2>{{ draft.name || current.name }}</h2>
        <div class="role-actions">
          <el-button @click="openCreate">新增角色</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>
      <p class="role-desc">{{ draft.key }} · {{ draft.status }} · 已选 {{ selectedCount }} 项</p>
      <el-form label-width="90px" class="role-form">
        <el-form-item label="角色名称"><el-input v-model="draft.name" maxlength="30" /></el-form-item>
        <el-form-item label="权限字符"><el-input v-model="draft.key" maxlength="100" /></el-form-item>
        <el-form-item label="显示顺序"><el-input-number v-model="draft.sort" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="draft.status">
            <el-radio value="启用">启用</el-radio>
            <el-radio value="停用">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="draft.remark" maxlength="200" /></el-form-item>
      </el-form>
      <p v-if="!groups.length" class="empty">还没有菜单。请先在「菜单管理」中初始化。</p>
      <div v-for="group in groups" :key="group.name" class="group">
        <h4>{{ group.name }}</h4>
        <el-checkbox-group v-model="checked">
          <el-checkbox v-for="item in group.items" :key="item.id" :value="item.id">{{ item.name }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <div v-if="!current.admin" class="remove-row">
        <el-button link type="danger" @click="remove">删除角色</el-button>
      </div>
    </template>
    <div v-else class="empty-role">
      <p>还没有角色</p>
      <el-button type="primary" @click="openCreate">新增角色</el-button>
    </div>
  </NavPane>
  </div>

  <el-dialog v-model="creating" title="新增角色" width="480px" destroy-on-close>
    <el-form ref="createRef" :model="createForm" :rules="createRules" label-width="90px">
      <el-form-item label="角色名称" prop="name"><el-input v-model="createForm.name" maxlength="30" /></el-form-item>
      <el-form-item label="权限字符" prop="key"><el-input v-model="createForm.key" maxlength="100" placeholder="如 warehouse" /></el-form-item>
      <el-form-item label="显示顺序"><el-input-number v-model="createForm.sort" :min="0" /></el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="createForm.status">
          <el-radio value="启用">启用</el-radio>
          <el-radio value="停用">停用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注"><el-input v-model="createForm.remark" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="creating = false">取消</el-button>
      <el-button type="primary" :loading="creatingSave" @click="submitCreate">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.role-manage, .role-pane { height: 100%; min-height: 420px; }
.role-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.role-head h2 { margin: 0; }
.role-actions { display: flex; gap: 8px; }
.role-desc { margin: 0 0 12px; color: #5d5d5d; font-size: 14px; }
.role-form { max-width: 560px; }
.group { margin-top: 8px; }
.group h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #5d5d5d; }
.group :deep(.el-checkbox) { margin: 0 18px 10px 0; height: 32px; }
.group :deep(.el-checkbox__label) { color: #1a2332; }
.remove-row { margin-top: 12px; }
.empty, .empty-role { color: #5d5d5d; }
.empty-role { padding-top: 24px; }
</style>
