<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api'
import ChangePasswordDialog from '@/components/ChangePasswordDialog.vue'
import SessionGuard from '@/components/SessionGuard.vue'
import { NAV, NAV_GROUPS, pageIdsFor } from '@/nav'
import { useAuthStore } from '@/stores/auth'
import {
  ArrowDown, Calendar, Collection, Document, Download, Files, Finished, Grid, Medal, Notebook, Odometer,
  OfficeBuilding, Search, Setting, SetUp, Sort, Tickets, Upload, User, Warning,
} from '@element-plus/icons-vue'

const icons: Record<string, unknown> = {
  ArrowDown, Calendar, Collection, Document, Download, Files, Finished, Grid, Medal, Notebook, Odometer,
  OfficeBuilding, Search, Setting, SetUp, Sort, Tickets, Upload, User, Warning,
}
const groupIcons: Record<string, string> = {
  基础数据: 'Grid',
  仓储作业: 'Download',
  账务: 'Notebook',
  系统: 'Setting',
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isDash = computed(() => route.name === 'dashboard')
const title = computed(() => String(route.meta.title || ''))
const folded = ref<string[]>([])
const passwordOpen = ref(false)

watch(isDash, (value) => {
  document.documentElement.classList.toggle('is-dashboard', value)
}, { immediate: true })

onBeforeUnmount(() => {
  document.documentElement.classList.remove('is-dashboard')
})

function toggleGroup(name: string) {
  folded.value = folded.value.includes(name)
    ? folded.value.filter((item) => item !== name)
    : [...folded.value, name]
}

function isSingle(group: { group: string; items: { title: string }[] }) {
  return group.items.length === 1 && group.items[0].title === group.group
}

const groups = computed(() => {
  const pages = pageIdsFor(auth.user)
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV.filter((item) => item.group === group && pages.has(item.id)),
  })).filter((group) => group.items.length)
})

async function logout() {
  await authApi.logout()
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin" :class="{ 'is-dashboard': isDash }">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">W</span>WWS系统</div>
      <nav class="menu">
        <section v-for="group in groups" :key="group.group">
          <router-link v-if="isSingle(group)" :to="group.items[0].path" class="nav-link">
            <el-icon><component :is="icons[group.items[0].icon]" /></el-icon>
            <span>{{ group.items[0].title }}</span>
          </router-link>
          <template v-else>
            <button type="button" class="group-title" @click="toggleGroup(group.group)">
              <span>
                <el-icon><component :is="icons[groupIcons[group.group]]" /></el-icon>
                {{ group.group }}
              </span>
              <el-icon class="caret" :class="{ folded: folded.includes(group.group) }"><ArrowDown /></el-icon>
            </button>
            <div v-show="!folded.includes(group.group)">
              <router-link v-for="item in group.items" :key="item.id" :to="item.path" class="nav-link">
                <el-icon><component :is="icons[item.icon]" /></el-icon>
                <span>{{ item.title }}</span>
              </router-link>
            </div>
          </template>
        </section>
      </nav>
    </aside>
    <section class="main">
      <header v-if="!isDash" class="topbar">
        <h1>{{ title }}</h1>
        <el-dropdown>
          <span class="user-btn">
            <span>{{ auth.user?.name }}</span>
            <img class="user-avatar" src="/avatar.png" alt="" />
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="passwordOpen = true">修改密码</el-dropdown-item>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <div class="content">
        <router-view />
      </div>
    </section>
    <SessionGuard />
    <ChangePasswordDialog v-model="passwordOpen" />
  </div>
</template>
