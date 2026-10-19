<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import ImageViewer from './ImageViewer.vue'

const props = defineProps<{
  modelValue?: File | File[] | null
  /** 已保存的图片地址，没有新选文件时用来预览。 */
  src?: string
  multiple?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: File | File[] | null]
  clear: []
}>()

const pickerKey = ref(0)
const blobUrl = ref('')
const blobUrls = ref<{ file: File; url: string }[]>([])

const imageName = /\.(png|jpe?g|gif|webp|bmp)$/i

function isImage(file: File) {
  return file.type.startsWith('image/') || imageName.test(file.name)
}

watch(() => (props.multiple ? null : props.modelValue), (value) => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = value instanceof File ? URL.createObjectURL(value) : ''
}, { immediate: true })

watch(() => (props.multiple && Array.isArray(props.modelValue) ? props.modelValue : []), (files) => {
  const next: { file: File; url: string }[] = []
  for (const file of files) {
    const kept = blobUrls.value.find((item) => item.file === file)
    next.push(kept || { file, url: URL.createObjectURL(file) })
  }
  for (const item of blobUrls.value) {
    if (!next.includes(item)) URL.revokeObjectURL(item.url)
  }
  blobUrls.value = next
}, { immediate: true })

onBeforeUnmount(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  for (const item of blobUrls.value) URL.revokeObjectURL(item.url)
})

const previews = computed(() => {
  if (props.multiple) {
    return blobUrls.value.map((item) => ({ key: item.url, name: item.file.name, url: item.url, file: item.file }))
  }
  if (blobUrl.value && props.modelValue instanceof File) {
    return [{ key: blobUrl.value, name: props.modelValue.name, url: blobUrl.value, file: props.modelValue }]
  }
  if (props.src) {
    const name = props.src.split('?')[0].split('/').filter(Boolean).pop() || '图片'
    return [{ key: props.src, name, url: props.src }]
  }
  return []
})

function onPick(upload: UploadFile) {
  pickerKey.value += 1
  const raw = upload.raw
  if (!raw) return
  if (!isImage(raw)) {
    ElMessage.warning('请上传图片')
    return
  }
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? props.modelValue : []
    if (current.some((item) => item.name === raw.name && item.size === raw.size && item.lastModified === raw.lastModified)) return
    emit('update:modelValue', [...current, raw])
    return
  }
  emit('update:modelValue', raw)
}

function remove(item: { file?: File }) {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? props.modelValue : []
    emit('update:modelValue', current.filter((file) => file !== item.file))
    return
  }
  emit('update:modelValue', null)
  if (!item.file) emit('clear')
}
</script>

<template>
  <div class="image-upload">
    <el-upload
      :key="pickerKey"
      :auto-upload="false"
      :show-file-list="false"
      :multiple="multiple"
      :disabled="disabled"
      accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.bmp"
      :on-change="onPick"
    >
      <el-button :disabled="disabled">{{ previews.length ? (multiple ? '添加图片' : '更换图片') : '选择图片' }}</el-button>
    </el-upload>
    <p v-if="!previews.length" class="hint">支持 PNG、JPG、GIF、WEBP、BMP。选择后可预览，点击可放大、拖拽和缩放。</p>
    <div v-else class="previews">
      <div v-for="item in previews" :key="item.key" class="preview">
        <ImageViewer thumb :src="item.url" :name="item.name" title="图片预览" />
        <el-button v-if="!disabled" link type="danger" @click="remove(item)">移除</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-upload { width: 100%; }
.hint { margin: 8px 0 0; color: #8b97a8; font-size: 12px; line-height: 1.5; }
.previews { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.preview { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
</style>
