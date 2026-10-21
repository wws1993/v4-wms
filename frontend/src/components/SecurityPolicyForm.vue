<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { settingsApi } from '@/api'
import { DEFAULT_POLICY, loadPolicy, normalizePolicy, passwordRuleText, savePolicy, type SecurityPolicy } from '@/security/policy'

const form = reactive<SecurityPolicy>(loadPolicy())
const saving = ref(false)

onMounted(async () => {
  const res = await settingsApi.get()
  if (res.success && res.data) {
    Object.assign(form, normalizePolicy(res.data as Partial<SecurityPolicy>))
    savePolicy(form)
  }
})

async function persist(next: SecurityPolicy, okText: string) {
  saving.value = true
  try {
    const policy = normalizePolicy(next)
    const res = await settingsApi.save({ ...policy })
    if (!res.success) {
      ElMessage.error(res.message)
      return
    }
    Object.assign(form, savePolicy(policy))
    ElMessage.success(okText)
  } finally {
    saving.value = false
  }
}

function save() {
  void persist(form, '安全策略已保存')
}

function reset() {
  void persist({ ...DEFAULT_POLICY }, '已恢复默认策略')
}
</script>

<template>
  <el-form label-width="180px" class="policy">
    <p class="note">策略随系统参数同步到服务端，本机缓存用于登录锁定、空闲退出和密码校验。注册账号、修改密码按这里执行。丰联若拒绝口令或返回账号锁定，以服务端提示为准。</p>
    <el-form-item label="密码长度">
      <el-input-number v-model="form.minLength" :min="8" :max="32" />
      <span class="unit">至 32 位</span>
    </el-form-item>
    <el-form-item label="密码复杂度">
      <div class="checks">
        <el-checkbox v-model="form.requireUpper">大写字母</el-checkbox>
        <el-checkbox v-model="form.requireLower">小写字母</el-checkbox>
        <el-checkbox v-model="form.requireDigit">数字</el-checkbox>
        <el-checkbox v-model="form.requireSpecial">特殊字符</el-checkbox>
      </div>
    </el-form-item>
    <el-form-item label="当前规则">
      <span class="rule">密码须为 {{ passwordRuleText(form) }}</span>
    </el-form-item>
    <el-form-item label="连续失败次数">
      <el-input-number v-model="form.maxRetry" :min="3" :max="10" />
      <span class="unit">次后锁定</span>
    </el-form-item>
    <el-form-item label="锁定时长">
      <el-input-number v-model="form.lockMinutes" :min="1" :max="120" />
      <span class="unit">分钟</span>
    </el-form-item>
    <el-form-item label="空闲退出">
      <el-input-number v-model="form.idleMinutes" :min="5" :max="480" />
      <span class="unit">分钟，提前 1 分钟提示</span>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="saving" @click="save">保存策略</el-button>
      <el-button :disabled="saving" @click="reset">恢复默认</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.policy { max-width: 760px; padding-top: 8px; }
.note { margin: 0 0 16px; color: #5a6a7e; line-height: 1.6; }
.unit { margin-left: 8px; color: #5a6a7e; }
.rule { color: #1a2332; }
.checks { display: flex; flex-wrap: wrap; gap: 4px 16px; }
</style>
