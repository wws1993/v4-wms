<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { menuApi } from '@/api'

interface MenuNode {
  id: string
  parentId: string
  name: string
  menuType: string
  orderNum: number
  path: string
  perms: string
  icon: string
  visible: string
  status: string
  children?: MenuNode[]
}

const typeOptions = [
  { label: '目录', value: 'M' },
  { label: '菜单', value: 'C' },
  { label: '按钮', value: 'F' },
]
const typeLabel: Record<string, string> = { M: '目录', C: '菜单', F: '按钮' }

const loading = ref(false)
const seeding = ref(false)
const saving = ref(false)
const tree = ref<MenuNode[]>([])
const dialog = ref(false)
const editingId = ref('')
const formRef = ref<FormInstance>()
const form = reactive({
  parentId: '0',
  name: '',
  menuType: 'C',
  orderNum: 1,
  path: '',
  perms: '',
  icon: '',
  visible: '显示',
  status: '正常',
})
const rules: FormRules = {
  name: [{ required: true, message: '请填写菜单名称', trigger: 'blur' }],
  menuType: [{ required: true, message: '请选择菜单类型', trigger: 'change' }],
  perms: [{
    validator: (_rule, value, callback) => {
      const text = String(value || '').trim()
      if (!text || /^([A-Za-z0-9_]+:){2}[A-Za-z0-9_]+$/.test(text)) callback()
      else callback(new Error('格式为 模块:资源:操作'))
    },
    trigger: 'blur',
  }],
}

function mapOptions(nodes: MenuNode[], skip: string): { value: string; label: string; children?: { value: string; label: string }[] }[] {
  return nodes.filter((node) => node.id !== skip).map((node) => {
    const children = node.children ? mapOptions(node.children, skip) : undefined
    return { value: node.id, label: node.name, children: children?.length ? children : undefined }
  })
}

const parentOptions = computed(() => [
  { value: '0', label: '根目录', children: mapOptions(tree.value, editingId.value) },
])

async function load() {
  loading.value = true
  const res = await menuApi.tree()
  loading.value = false
  if (!res.success || !Array.isArray(res.data)) {
    ElMessage.error(res.message || '菜单加载失败')
    tree.value = []
    return
  }
  tree.value = res.data as MenuNode[]
}

function resetForm() {
  Object.assign(form, {
    parentId: '0',
    name: '',
    menuType: 'C',
    orderNum: 1,
    path: '',
    perms: '',
    icon: '',
    visible: '显示',
    status: '正常',
  })
}

function openCreate(parent?: MenuNode) {
  editingId.value = ''
  resetForm()
  if (parent) form.parentId = parent.id
  dialog.value = true
}

function openEdit(row: MenuNode) {
  editingId.value = row.id
  Object.assign(form, {
    parentId: row.parentId || '0',
    name: row.name,
    menuType: row.menuType || 'C',
    orderNum: Number(row.orderNum || 0),
    path: row.path,
    perms: row.perms,
    icon: row.icon === '#' ? '' : row.icon,
    visible: row.visible || '显示',
    status: row.status || '正常',
  })
  dialog.value = true
}

async function submit() {
  await formRef.value?.validate()
  saving.value = true
  const body = { ...form, icon: form.icon || '#' }
  const res = editingId.value ? await menuApi.update(editingId.value, body) : await menuApi.create(body)
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已保存')
  dialog.value = false
  load()
}

async function remove(row: MenuNode) {
  try {
    await ElMessageBox.confirm(`确认删除菜单「${row.name}」？`, '确认')
  } catch {
    return
  }
  const res = await menuApi.remove(row.id)
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '已删除')
  load()
}

async function initMenus() {
  try {
    await ElMessageBox.confirm('按概览、基础数据、仓储作业、生产与关务、账务、系统补齐缺失菜单。同级已有同名菜单不会覆盖。', '初始化菜单')
  } catch {
    return
  }
  seeding.value = true
  const res = await menuApi.init()
  seeding.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '菜单已初始化')
  load()
}

onMounted(load)
</script>

<template>
  <div class="menu-page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate()">新增菜单</el-button>
      <el-button :loading="seeding" @click="initMenus">初始化菜单</el-button>
    </div>
    <el-table v-loading="loading" :data="tree" row-key="id" default-expand-all :tree-props="{ children: 'children' }" empty-text="暂无菜单">
      <el-table-column prop="name" label="菜单名称" min-width="180" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">{{ typeLabel[row.menuType] || row.menuType }}</template>
      </el-table-column>
      <el-table-column prop="orderNum" label="排序" width="70" />
      <el-table-column prop="path" label="路由" min-width="140" show-overflow-tooltip />
      <el-table-column prop="perms" label="权限标识" min-width="160" show-overflow-tooltip />
      <el-table-column prop="visible" label="显示" width="80" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === '正常' ? 'success' : 'info'" effect="light">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openCreate(row)">新增</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editingId ? '编辑菜单' : '新增菜单'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="上级菜单">
          <el-tree-select v-model="form.parentId" :data="parentOptions" check-strictly :render-after-expand="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="菜单名称" prop="name"><el-input v-model="form.name" maxlength="50" /></el-form-item>
        <el-form-item label="菜单类型" prop="menuType">
          <el-radio-group v-model="form.menuType">
            <el-radio v-for="item in typeOptions" :key="item.value" :value="item.value">{{ item.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="显示顺序"><el-input-number v-model="form.orderNum" :min="0" /></el-form-item>
        <el-form-item label="路由地址"><el-input v-model="form.path" maxlength="200" placeholder="如 warehouses" /></el-form-item>
        <el-form-item v-if="form.menuType !== 'M'" label="权限标识" prop="perms">
          <el-input v-model="form.perms" maxlength="100" placeholder="如 wms:warehouse:list" />
        </el-form-item>
        <el-form-item label="图标"><el-input v-model="form.icon" maxlength="50" placeholder="如 Grid" /></el-form-item>
        <el-form-item label="显示状态">
          <el-radio-group v-model="form.visible">
            <el-radio value="显示">显示</el-radio>
            <el-radio value="隐藏">隐藏</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="菜单状态">
          <el-radio-group v-model="form.status">
            <el-radio value="正常">正常</el-radio>
            <el-radio value="停用">停用</el-radio>
          </el-radio-group>
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
.menu-page { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; flex: none; }
.menu-page :deep(.el-table) { flex: 1; min-height: 0; }
</style>
