<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { UploadFile } from 'element-plus'
import { RefreshLeft, RefreshRight, UploadFilled, ZoomIn, ZoomOut } from '@element-plus/icons-vue'

const props = defineProps<{
  label: string
  tip: string
}>()

const emit = defineEmits<{ file: [file: UploadFile] }>()

const previewUrl = ref('')
const fileName = ref('')
const isImage = ref(false)
const scale = ref(1)
const rotate = ref(0)
const panX = ref(0)
const panY = ref(0)
let drag: { x: number; y: number; px: number; py: number } | null = null

const imageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${panX.value}px, ${panY.value}px) rotate(${rotate.value}deg) scale(${scale.value})`,
}))

function clampScale(value: number) {
  return Math.min(6, Math.max(0.3, value))
}

function resetView() {
  scale.value = 1
  rotate.value = 0
  panX.value = 0
  panY.value = 0
}

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function onFile(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  revokePreview()
  fileName.value = file.name
  isImage.value = raw.type.startsWith('image/')
  if (isImage.value) previewUrl.value = URL.createObjectURL(raw)
  resetView()
  emit('file', file)
}

function zoomBy(factor: number) {
  scale.value = clampScale(scale.value * factor)
}

function turn(deg: number) {
  rotate.value = (rotate.value + deg) % 360
}

function onWheel(event: WheelEvent) {
  if (!isImage.value) return
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
  if (!isImage.value || event.button !== 0) return
  const stage = event.currentTarget as HTMLElement
  try { stage.setPointerCapture(event.pointerId) } catch { /* 仍可根据移动事件平移 */ }
  drag = { x: panX.value, y: panY.value, px: event.clientX, py: event.clientY }
}

function onMove(event: PointerEvent) {
  if (!drag) return
  panX.value = drag.x + event.clientX - drag.px
  panY.value = drag.y + event.clientY - drag.py
}

function onUp() {
  drag = null
}

onBeforeUnmount(revokePreview)
</script>

<template>
  <el-upload
    v-if="!fileName"
    class="drop"
    drag
    :auto-upload="false"
    :show-file-list="false"
    accept=".pdf,.jpg,.jpeg,.png"
    :on-change="onFile"
  >
    <el-icon class="drop-icon"><UploadFilled /></el-icon>
    <div class="el-upload__text">将{{ label }}拖到此处，或<em>点击上传</em></div>
    <div class="drop-tip">{{ tip }}</div>
  </el-upload>
  <div v-else class="viewer">
    <div class="tools">
      <button type="button" :disabled="!isImage" title="放大" @click="zoomBy(1.2)"><el-icon><ZoomIn /></el-icon></button>
      <button type="button" :disabled="!isImage" title="缩小" @click="zoomBy(1 / 1.2)"><el-icon><ZoomOut /></el-icon></button>
      <button type="button" :disabled="!isImage" title="左转" @click="turn(-90)"><el-icon><RefreshLeft /></el-icon></button>
      <button type="button" :disabled="!isImage" title="右转" @click="turn(90)"><el-icon><RefreshRight /></el-icon></button>
      <button type="button" :disabled="!isImage" @click="resetView">复位</button>
      <span class="name">{{ fileName }}</span>
      <el-upload class="again" :auto-upload="false" :show-file-list="false" accept=".pdf,.jpg,.jpeg,.png" :on-change="onFile">
        <span>更换</span>
      </el-upload>
    </div>
    <div
      class="stage"
      :class="{ image: isImage }"
      @wheel.prevent="onWheel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <img v-if="isImage" :src="previewUrl" :style="imageStyle" alt="" draggable="false" />
      <p v-else>PDF 不能在这里预览。请上传 JPG 或 PNG 后放大查看。</p>
    </div>
    <div class="drop-tip">{{ tip }}</div>
  </div>
</template>

<style scoped>
.drop, .viewer { width: 100%; margin-bottom: 16px; }
.drop :deep(.el-upload),
.drop :deep(.el-upload-dragger) { width: 100%; }
.drop-icon { font-size: 48px; color: var(--el-color-primary); margin-bottom: 8px; }
.drop-tip { margin-top: 6px; color: #8a8a8a; font-size: 13px; }
.tools { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.tools button, .again :deep(.el-upload) {
  height: 32px;
  min-width: 32px;
  padding: 0 8px;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  background: #fff;
  color: inherit;
  font-size: 14px;
  line-height: 30px;
  cursor: pointer;
}
.stage.image:active { cursor: grabbing; }
.tools button:disabled { opacity: .4; cursor: default; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5c5c5c; font-size: 13px; }
.stage {
  position: relative;
  height: 320px;
  overflow: hidden;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #f7f7f7;
  display: grid;
  place-items: center;
  color: #8a8a8a;
}
.stage.image { cursor: grab; touch-action: none; }
.stage img {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 100%;
  max-height: 100%;
  transform-origin: center;
  user-select: none;
  pointer-events: none;
}
</style>
