<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshLeft, RefreshRight, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { readToken } from '@/api/ruoyi'

const props = withDefaults(defineProps<{
  src?: string
  title?: string
  name?: string
  lines?: string[]
  /** shot 为缩略图，link 为列表里的文字按钮，点开后才加载图片。 */
  variant?: 'shot' | 'link'
  label?: string
  thumb?: boolean
}>(), {
  variant: 'shot',
  label: '查看',
  thumb: false,
})

const open = ref(false)
const shown = ref('')
const broken = ref(false)
const loading = ref(false)
const scale = ref(1)
const rotate = ref(0)
const panX = ref(0)
const panY = ref(0)
let drag: { x: number; y: number; px: number; py: number } | null = null
let objectUrl = ''
let ticket = 0

const imageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${panX.value}px, ${panY.value}px) rotate(${rotate.value}deg) scale(${scale.value})`,
}))

function revoke() {
  if (!objectUrl) return
  URL.revokeObjectURL(objectUrl)
  objectUrl = ''
}

async function load(src: string) {
  const mine = ++ticket
  revoke()
  shown.value = ''
  broken.value = false
  if (!src) return
  if (/^(blob:|data:)/i.test(src)) {
    shown.value = src
    return
  }
  loading.value = true
  try {
    const headers: Record<string, string> = {}
    const token = readToken()
    if (token) headers.Authorization = `${import.meta.env.VITE_TOKEN_PREFIX ?? 'Bearer '}${token}`
    const response = await fetch(src, { headers })
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    if (blob.type.includes('json') || blob.type.includes('html')) throw new Error('not image')
    if (mine !== ticket) return
    objectUrl = URL.createObjectURL(blob)
    shown.value = objectUrl
  } catch {
    if (mine === ticket) broken.value = true
  } finally {
    if (mine === ticket) loading.value = false
  }
}

watch(() => props.src, (src) => {
  if (props.variant === 'link') {
    ticket += 1
    revoke()
    shown.value = ''
    broken.value = false
    loading.value = false
    return
  }
  load(src || '')
}, { immediate: true })
onBeforeUnmount(() => {
  ticket += 1
  revoke()
})

function resetView() {
  scale.value = 1
  rotate.value = 0
  panX.value = 0
  panY.value = 0
}

async function openViewer() {
  if (props.variant === 'link') {
    if (!props.src) {
      ElMessage.info('暂无图片')
      return
    }
    if (!shown.value) await load(props.src)
    if (!shown.value) {
      ElMessage.warning('图片无法打开')
      return
    }
  } else if (!shown.value) return
  resetView()
  open.value = true
}

function clampScale(value: number) {
  return Math.min(8, Math.max(0.2, value))
}

function zoomBy(factor: number) {
  scale.value = clampScale(scale.value * factor)
}

function turn(deg: number) {
  rotate.value = (rotate.value + deg + 360) % 360
}

function onWheel(event: WheelEvent) {
  const stage = event.currentTarget as HTMLElement
  const rect = stage.getBoundingClientRect()
  const ox = event.clientX - rect.left - rect.width / 2
  const oy = event.clientY - rect.top - rect.height / 2
  const next = clampScale(scale.value * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
  const ratio = next / scale.value
  panX.value = ox - (ox - panX.value) * ratio
  panY.value = oy - (oy - panY.value) * ratio
  scale.value = next
}

function onDown(event: PointerEvent) {
  if (event.button !== 0) return
  const stage = event.currentTarget as HTMLElement
  try { stage.setPointerCapture(event.pointerId) } catch { /* 捕获失败时仍按移动量平移 */ }
  drag = { x: panX.value, y: panY.value, px: event.clientX, py: event.clientY }
}

function onMove(event: PointerEvent) {
  if (!drag) return
  panX.value = drag.x + event.clientX - drag.px
  panY.value = drag.y + event.clientY - drag.py
}

function onUp(event: PointerEvent) {
  if (drag) {
    panX.value = drag.x + event.clientX - drag.px
    panY.value = drag.y + event.clientY - drag.py
  }
  drag = null
}
</script>

<template>
  <el-button v-if="variant === 'link'" class="link" link type="primary" @click="openViewer">{{ label }}</el-button>
  <button v-else class="shot" :class="{ thumb }" type="button" :disabled="!shown" @click="openViewer">
    <img v-if="shown" :src="shown" :alt="title || '识别影像'" draggable="false" />
    <span v-else class="paper">
      <small>归档影像</small>
      <strong>{{ title || '单证' }}</strong>
      <em v-for="line in lines || []" :key="line">{{ line }}</em>
      <em>{{ loading ? '影像加载中' : (broken ? '影像无法打开' : (name || '暂无识别影像')) }}</em>
    </span>
    <span v-if="shown" class="hint">点击查看</span>
  </button>
  <el-dialog
    v-model="open"
    :title="title || '识别影像'"
    width="920px"
    append-to-body
    align-center
    destroy-on-close
    @opened="resetView"
  >
    <div class="tools">
      <el-button :icon="ZoomIn" @click="zoomBy(1.2)">放大</el-button>
      <el-button :icon="ZoomOut" @click="zoomBy(1 / 1.2)">缩小</el-button>
      <el-button :icon="RefreshLeft" @click="turn(-90)">左转</el-button>
      <el-button :icon="RefreshRight" @click="turn(90)">右转</el-button>
      <el-button @click="resetView">复位</el-button>
      <span v-if="name" class="name">{{ name }}</span>
    </div>
    <div
      class="stage"
      @wheel.prevent="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <img v-if="shown" :src="shown" alt="" draggable="false" :style="imageStyle" />
    </div>
  </el-dialog>
</template>

<style scoped>
.shot {
  position: relative;
  display: block;
  width: 100%;
  min-height: 220px;
  padding: 0;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(241, 245, 249, 0.92));
  overflow: hidden;
  cursor: zoom-in;
  text-align: left;
}
.shot.thumb { width: 168px; min-height: 0; }
.shot.thumb img { width: 168px; height: 112px; }
.shot:disabled { cursor: default; }
.link { height: auto; padding: 0; }
.shot img {
  display: block;
  width: 100%;
  height: 280px;
  object-fit: contain;
  background: #1b1f27;
}
.paper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 220px;
  padding: 28px 24px;
}
.paper small { color: var(--el-text-color-secondary); letter-spacing: 0.08em; }
.paper strong { font-size: 18px; }
.paper em { color: var(--el-text-color-secondary); font-style: normal; }
.hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
}
.tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.name { margin-left: auto; color: var(--el-text-color-secondary); font-size: 12px; }
.stage {
  position: relative;
  height: min(68vh, 640px);
  overflow: hidden;
  border-radius: 8px;
  background: #1b1f27;
  cursor: grab;
  touch-action: none;
}
.stage:active { cursor: grabbing; }
.stage img {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 92%;
  max-height: 92%;
  transform-origin: center center;
  user-select: none;
  pointer-events: none;
}
</style>
