<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { authApi } from '@/api'
import { passwordIssue, passwordRuleText } from '@/security/policy'

const open = defineModel<boolean>({ default: false })
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请填写原密码', trigger: 'blur' }],
  newPassword: [{
    validator: (_rule, value, callback) => {
      if (!value) {
        callback(new Error('请填写新密码'))
        return
      }
      if (value === form.oldPassword) {
        callback(new Error('新密码不能与原密码相同'))
        return
      }
      const message = passwordIssue(value)
      callback(message ? new Error(message) : undefined)
    },
    trigger: 'blur',
  }],
  confirm: [{
    validator: (_rule, value, callback) => {
      if (!value) callback(new Error('请再次填写新密码'))
      else if (value !== form.newPassword) callback(new Error('两次输入的密码不一致'))
      else callback()
    },
    trigger: 'blur',
  }],
}

function reset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirm = ''
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  const res = await authApi.changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword })
  saving.value = false
  if (!res.success) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(res.message || '密码已更新')
  open.value = false
}
</script>

<template>
  <el-dialog v-model="open" title="修改密码" width="460px" align-center destroy-on-close @closed="reset">
    <p class="hint">密码须为 {{ passwordRuleText() }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" @submit.prevent="submit">
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint { margin: 0 0 16px; color: #5a6a7e; line-height: 1.6; }
</style>
