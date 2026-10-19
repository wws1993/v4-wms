<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { FloorPlan, PlanItem } from '@/types'
import { cargoStyle, contentFrame, hostOf, isWarehouseItem, lotsOnStack, warehouseCodeOf, warehouseMark, type CargoLot } from '@/plan/model'

const props = defineProps<{
  plan: FloorPlan
  lots: CargoLot[]
  active: boolean
  warnCodes?: string[]
}>()

const emit = defineEmits<{
  open: [item: PlanItem]
  hover: [payload: { kind: 'warehouse' | 'stack'; item: PlanItem; x: number; y: number }]
  leave: []
}>()

const root = ref<HTMLElement | null>(null)

const HOUSE_COLORS = [0x5b8cff, 0xe7c98a, 0x3ecf8e, 0xe07a3d, 0x30b0c7, 0xd46a9a, 0xb08cff, 0x8fd0ff]

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let yard: THREE.Group | null = null
let frame = 0
let alive = true
let shown = true
let framed = false
let dragging = false
let dragged = false
let downX = 0
let downY = 0
let distance = 28
const YAW = 0
const PITCH = Math.PI / 4
const target = new THREE.Vector3()
const pointer = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
let timeUniform = { value: 0 }
let lamps: { light: THREE.PointLight; phase: number; speed: number; base: number; warn?: boolean }[] = []
let minDistance = 8
let maxDistance = 80
let resizeObserver: ResizeObserver | undefined
let flyCamera = 0

function stopFly() {
  cancelAnimationFrame(flyCamera)
  flyCamera = 0
}

function updateCamera() {
  if (!camera) return
  const lift = Math.sin(PITCH)
  const span = Math.cos(PITCH)
  camera.position.set(
    target.x + distance * span * Math.sin(YAW),
    distance * lift,
    target.z + distance * span * Math.cos(YAW),
  )
  camera.lookAt(target)
}

function disposeYard() {
  if (!yard) return
  yard.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material
    const list = material ? (Array.isArray(material) ? material : [material]) : []
    for (const entry of list) {
      const map = (entry as THREE.MeshStandardMaterial).map
      map?.dispose()
      entry.dispose()
    }
  })
  scene?.remove(yard)
  yard = null
  lamps = []
}

function slab(item: PlanItem, height: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.08, item.cols), height, Math.max(0.08, item.rows)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.94 }),
  )
  mesh.position.set(item.col + item.cols / 2, height / 2, item.row + item.rows / 2)
  mesh.raycast = () => {}
  return mesh
}

function labelSprite(text: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '600 44px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f4f0e6'
  ctx.fillText(text.slice(0, 8), 128, 40)
  ctx.fillStyle = color
  ctx.fillRect(78, 68, 100, 5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.renderOrder = 4
  return sprite
}

function member(from: THREE.Vector3, to: THREE.Vector3, thick: number, material: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(to, from)
  const length = Math.max(0.04, dir.length())
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, length), material)
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize())
  return mesh
}

function addWarehouse(item: PlanItem, index: number, parent: THREE.Group) {
  const color = item.type === 'idle' ? 0x6a7384 : HOUSE_COLORS[index % HOUSE_COLORS.length]
  const phase = index * 2.399963
  const breath = 0.52 + ((index * 17) % 11) / 11 * 0.78
  const accent = new THREE.Color(color)
  const group = new THREE.Group()
  group.position.set(item.col, 0, item.row)
  const width = Math.max(0.8, item.cols)
  const depth = Math.max(0.8, item.rows)
  const postH = Math.min(3.3, Math.max(2.15, Math.min(width, depth) * 0.55))
  const rise = Math.max(1.4, Math.min(2.7, (depth / 2) * 0.72))
  const warned = (props.warnCodes || []).includes(warehouseCodeOf(item.name))
  const ridgeH = postH + rise
  const steel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xb7c0cc).lerp(accent, 0.16),
    metalness: 0.82,
    roughness: 0.28,
  })
  const concrete = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x4a5160).lerp(accent, 0.08),
    roughness: 0.94,
    metalness: 0.02,
  })

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), concrete)
  floor.position.set(width / 2, 0.05, depth / 2)
  floor.userData = { kind: 'warehouse', item }
  group.add(floor)
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x2a303a, roughness: 1 })
  const joints = Math.max(1, Math.round(width / 2.6))
  for (let step = 1; step < joints; step += 1) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, depth * 0.92), jointMat)
    seam.position.set((width * step) / joints, 0.106, depth / 2)
    seam.raycast = () => {}
    group.add(seam)
  }

  const mark = (mesh: THREE.Object3D) => {
    mesh.userData = { kind: 'warehouse', item }
    group.add(mesh)
  }
  const portals = Math.max(2, Math.min(7, Math.round(width / 2.4)))
  const inset = 0.08
  const xs: number[] = []
  for (let portal = 0; portal <= portals; portal += 1) xs.push(inset + ((width - inset * 2) * portal) / portals)
  const z0 = inset
  const z1 = depth - inset
  for (const x of xs) {
    for (const z of [z0, z1]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.16, postH, 0.16), steel)
      column.position.set(x, postH / 2, z)
      mark(column)
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.24), steel)
      plate.position.set(x, 0.12, z)
      mark(plate)
    }
    mark(member(new THREE.Vector3(x, postH, z0), new THREE.Vector3(x, ridgeH, depth / 2), 0.1, steel))
    mark(member(new THREE.Vector3(x, postH, z1), new THREE.Vector3(x, ridgeH, depth / 2), 0.1, steel))
    mark(member(new THREE.Vector3(x, postH * 0.62, z0), new THREE.Vector3(x, postH, z0 + Math.min(0.7, depth * 0.18)), 0.045, steel))
    mark(member(new THREE.Vector3(x, postH * 0.62, z1), new THREE.Vector3(x, postH, z1 - Math.min(0.7, depth * 0.18)), 0.045, steel))
  }
  mark(member(new THREE.Vector3(xs[0], postH, z0), new THREE.Vector3(xs[xs.length - 1], postH, z0), 0.08, steel))
  mark(member(new THREE.Vector3(xs[0], postH, z1), new THREE.Vector3(xs[xs.length - 1], postH, z1), 0.08, steel))
  mark(member(new THREE.Vector3(xs[0], ridgeH, depth / 2), new THREE.Vector3(xs[xs.length - 1], ridgeH, depth / 2), 0.07, steel))
  for (const t of [0.38, 0.7]) {
    const y = postH + rise * t
    const zNear = z0 + (depth / 2 - z0) * t
    const zFar = z1 - (z1 - depth / 2) * t
    mark(member(new THREE.Vector3(xs[0], y, zNear), new THREE.Vector3(xs[xs.length - 1], y, zNear), 0.045, steel))
    mark(member(new THREE.Vector3(xs[0], y, zFar), new THREE.Vector3(xs[xs.length - 1], y, zFar), 0.045, steel))
  }
  if (xs.length > 2) {
    mark(member(new THREE.Vector3(xs[0], 0.2, z0), new THREE.Vector3(xs[1], postH * 0.86, z0), 0.04, steel))
    mark(member(new THREE.Vector3(xs[1], 0.2, z0), new THREE.Vector3(xs[0], postH * 0.86, z0), 0.04, steel))
  }

  const wallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: timeUniform,
      uColor: { value: accent.clone() },
      uPhase: { value: phase },
      uSpeed: { value: breath },
      uWarn: { value: warned ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uPhase;
      uniform float uSpeed;
      uniform float uWarn;
      varying vec2 vUv;
      void main() {
        float pulse = 0.5 + 0.5 * sin(uTime * uSpeed * 2.1 + uPhase);
        vec3 base = mix(vec3(0.78, 0.82, 0.88), uColor, 0.28);
        vec3 alert = vec3(1.0, 0.12, 0.08);
        vec3 col = mix(base, alert, uWarn * (0.45 + 0.55 * pulse));
        float alpha = 0.62 + uWarn * pulse * 0.3;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })
  const shell = (mesh: THREE.Mesh) => {
    mesh.userData = { shell: true, kind: 'warehouse', item }
    group.add(mesh)
  }
  const wallT = 0.07
  const front = new THREE.Mesh(new THREE.BoxGeometry(width, postH, wallT), wallMat)
  front.position.set(width / 2, postH / 2, wallT / 2)
  shell(front)
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, postH, wallT), wallMat)
  back.position.set(width / 2, postH / 2, depth - wallT / 2)
  shell(back)
  const gableShape = new THREE.Shape()
  gableShape.moveTo(0, 0.1)
  gableShape.lineTo(depth, 0.1)
  gableShape.lineTo(depth, postH)
  gableShape.lineTo(depth / 2, ridgeH - 0.04)
  gableShape.lineTo(0, postH)
  gableShape.closePath()
  for (const x of [wallT / 2, width - wallT / 2]) {
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), wallMat)
    gable.rotation.y = -Math.PI / 2
    gable.position.set(x, 0, 0)
    shell(gable)
  }

  const roofMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: timeUniform,
      uColor: { value: accent.clone() },
      uPhase: { value: phase },
      uSpeed: { value: breath },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uPhase;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        float rib = 0.82 + 0.18 * sin(vUv.x * 90.0);
        float breath = 0.5 + 0.5 * sin(uTime * uSpeed + uPhase);
        vec3 steel = vec3(0.62, 0.67, 0.74);
        vec3 col = mix(steel, uColor, 0.1 + breath * 0.42) * rib;
        gl_FragColor = vec4(col, 0.1 + breath * 0.26);
      }
    `,
  })
  const roofNear = new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, 0.03, 1), roofMat)
  const spanZ = depth / 2 - z0
  const slope = Math.hypot(spanZ, rise)
  roofNear.scale.set(1, 1, slope)
  roofNear.position.set(width / 2, postH + rise / 2, (z0 + depth / 2) / 2)
  roofNear.rotation.x = -Math.atan2(rise, spanZ)
  roofNear.userData = { shell: true, kind: 'warehouse', item }
  group.add(roofNear)
  const roofFar = roofNear.clone()
  roofFar.position.z = (z1 + depth / 2) / 2
  roofFar.rotation.x = Math.atan2(rise, spanZ)
  roofFar.userData = { shell: true, kind: 'warehouse', item }
  group.add(roofFar)

  const eaveMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: timeUniform,
      uColor: { value: accent.clone() },
      uPhase: { value: phase },
      uSpeed: { value: breath },
      uWarn: { value: warned ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uPhase;
      uniform float uSpeed;
      uniform float uWarn;
      varying vec2 vUv;
      void main() {
        float breath = 0.5 + 0.5 * sin(uTime * uSpeed + uPhase);
        float alarm = uWarn * (0.5 + 0.5 * sin(uTime * uSpeed * 2.1 + uPhase));
        vec3 col = mix(uColor * (0.35 + breath * 0.65), vec3(1.0, 0.14, 0.08), alarm);
        gl_FragColor = vec4(col, 0.28 + breath * 0.62);
      }
    `,
  })
  for (const z of [0.02, depth - 0.02]) {
    const eave = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.07), eaveMat)
    eave.position.set(width / 2, postH + 0.05, z)
    eave.userData = { shell: true, kind: 'warehouse', item }
    group.add(eave)
  }
  const ridgeLight = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.07), eaveMat)
  ridgeLight.position.set(width / 2, ridgeH + 0.05, depth / 2)
  ridgeLight.userData = { shell: true, kind: 'warehouse', item }
  group.add(ridgeLight)

  const lamp = new THREE.PointLight(color, 1.1, Math.max(width, depth) * 1.8, 2)
  lamp.position.set(width / 2, ridgeH - 0.15, depth / 2)
  group.add(lamp)
  lamps.push({ light: lamp, phase, speed: breath, base: 1.15 })
  if (warned) {
    const alarm = new THREE.PointLight(0xff2a22, 0, Math.max(width, depth) * 2.6, 1.4)
    alarm.position.set(width / 2, postH * 0.62, depth / 2)
    group.add(alarm)
    lamps.push({ light: alarm, phase, speed: breath, base: 0, warn: true })
  }

  const stacks = props.plan.items.filter((entry) => entry.type === 'stack' && hostOf(entry, props.plan.items)?.id === item.id)
  if (stacks.length) {
    for (const stack of stacks) addStack(stack, group, item)
  } else {
    layoutLooseLots(item, group)
  }

  const title = warehouseMark(item) || item.name.replace(/[\r\n]+/g, '')
  const sprite = labelSprite(title, `#${color.toString(16).padStart(6, '0')}`)
  if (sprite) {
    const labelW = Math.min(Math.max(width * 0.62, 1.8), 4.4)
    sprite.scale.set(labelW, labelW * 0.38, 1)
    sprite.position.set(width / 2, ridgeH + 0.42, depth / 2)
    sprite.userData = { kind: 'warehouse', item }
    group.add(sprite)
  }

  parent.add(group)
}

function houseLots(house: PlanItem) {
  const code = warehouseCodeOf(house.name)
  return props.lots.filter((lot) => lot.status === '在库' && warehouseCodeOf(lot.warehouse) === code)
}

/** 平面图还没画堆位时，按库存票的堆位编码在仓库内排成网格。 */
function layoutLooseLots(house: PlanItem, group: THREE.Group) {
  const grouped = new Map<string, CargoLot[]>()
  for (const lot of houseLots(house)) {
    const key = lot.stackText || '未分堆'
    const list = grouped.get(key) || []
    list.push(lot)
    grouped.set(key, list)
  }
  const entries = [...grouped.entries()]
  if (!entries.length) return
  const width = Math.max(0.8, house.cols)
  const depth = Math.max(0.8, house.rows)
  const cols = Math.ceil(Math.sqrt(entries.length))
  const rows = Math.ceil(entries.length / cols)
  const inset = 0.28
  const cellW = Math.max(0.35, (width - inset * 2) / cols)
  const cellH = Math.max(0.35, (depth - inset * 2) / rows)
  const mark = warehouseMark(house)
  entries.forEach(([stackText, lots], index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const slot = stackText.startsWith(mark) ? stackText.slice(mark.length) : stackText
    const stack: PlanItem = {
      id: `${house.id}-lot-${index}`,
      type: 'stack',
      name: slot,
      col: house.col + inset + col * cellW,
      row: house.row + inset + row * cellH,
      cols: Math.max(0.3, cellW * 0.86),
      rows: Math.max(0.3, cellH * 0.86),
    }
    addStack(stack, group, house, lots)
  })
}

function addStack(item: PlanItem, group: THREE.Group, house: PlanItem, preset?: CargoLot[]) {
  const localX = item.col - house.col
  const localZ = item.row - house.row
  const lots = preset || lotsOnStack(item, props.plan.items, props.lots)
  const padW = Math.max(0.2, item.cols * 0.92)
  const padD = Math.max(0.2, item.rows * 0.92)
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(padW, 0.04, padD),
    new THREE.MeshStandardMaterial({ color: lots.length ? 0x2a3142 : 0x343c50, roughness: 0.9 }),
  )
  pad.position.set(localX + item.cols / 2, 0.12, localZ + item.rows / 2)
  pad.userData = { kind: 'stack', item, house }
  group.add(pad)
  if (!lots.length) return
  const tons = lots.reduce((sum, lot) => sum + lot.wet, 0)
  const cap = item.capacity || 0
  const ratio = cap > 0 ? Math.min(1, tons / cap) : 0.55
  const height = 0.34 + ratio * 1.15
  const weight = lots.reduce((sum, lot) => sum + Math.max(lot.wet, 1), 0)
  let y = 0.14
  lots.forEach((lot, layer) => {
    const piece = Math.max(0.12, height * (Math.max(lot.wet, 1) / weight))
    const paint = cargoStyle(lot.consignor, lot.cargoType)
    const taper = 1 - layer * 0.14
    const radius = Math.max(0.12, Math.min(padW, padD) * 0.28 * taper)
    const heap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.28, radius, piece, 8),
      new THREE.MeshStandardMaterial({ color: paint.fill, roughness: 0.9, metalness: 0.02 }),
    )
    heap.position.set(localX + item.cols / 2, y + piece / 2, localZ + item.rows / 2)
    heap.scale.set(padW >= padD ? 1.35 : 1, 1, padD > padW ? 1.35 : 1)
    heap.userData = { kind: 'stack', item, house }
    group.add(heap)
    y += piece * 0.92
  })
}

function rebuild() {
  if (!scene) return
  disposeYard()
  timeUniform = { value: 0 }
  const next = new THREE.Group()
  const bounds = contentFrame(props.plan, 0.4)
  target.set(bounds.x + bounds.w / 2, 0, bounds.y + bounds.h / 2)
  const span = Math.max(bounds.w, bounds.h, 8)
  minDistance = Math.max(6, span * 0.35)
  maxDistance = span * 3.2
  if (!framed) {
    distance = Math.min(maxDistance, Math.max(minDistance, span * 0.92))
    framed = true
  }
  distance = Math.min(maxDistance, Math.max(minDistance, distance))

  for (const item of props.plan.items) {
    if (item.type === 'road') next.add(slab(item, 0.05, 0x2a3140))
    else if (item.type === 'bush') next.add(slab(item, 0.16, 0x24382c))
    else if (item.type === 'office') next.add(slab(item, 1.05, 0x3d4c66))
    else if (item.type === 'zone') next.add(slab(item, 0.07, 0x31384a))
    else if (item.type === 'line') next.add(slab(item, 0.1, 0x6d5a3e))
    else if (item.type === 'door') next.add(slab(item, 0.5, 0x62646e))
  }

  const houses = props.plan.items.filter(isWarehouseItem).slice().sort((a, b) => a.row - b.row || a.col - b.col)
  houses.forEach((item, index) => addWarehouse(item, index, next))
  scene.add(next)
  yard = next
  updateCamera()
}

function resize() {
  const el = root.value
  if (!el || !renderer || !camera) return
  const width = Math.max(1, el.clientWidth)
  const height = Math.max(1, el.clientHeight)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

function tick() {
  if (!alive || !shown || !props.active) return
  timeUniform.value = performance.now() / 1000
  for (const lamp of lamps) {
    const wave = 0.5 + 0.5 * Math.sin(timeUniform.value * lamp.speed * (lamp.warn ? 2.1 : 1) + lamp.phase)
    lamp.light.intensity = lamp.warn ? wave * 7 : lamp.base * (0.22 + wave * 0.9)
  }
  renderer?.render(scene!, camera!)
  frame = requestAnimationFrame(tick)
}

function start() {
  cancelAnimationFrame(frame)
  if (alive && shown && props.active) frame = requestAnimationFrame(tick)
}

function readHit(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    const kind = current.userData?.kind
    if (kind === 'warehouse' || kind === 'stack') {
      return {
        kind: kind as 'warehouse' | 'stack',
        item: current.userData.item as PlanItem,
        house: current.userData.house as PlanItem | undefined,
        shell: Boolean(object.userData?.shell),
      }
    }
    current = current.parent
  }
  return null
}

function pick(event: { clientX: number; clientY: number }, hover = false) {
  const canvas = renderer?.domElement
  if (!canvas || !camera || !yard) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(yard.children, true)
  let shellHit: ReturnType<typeof readHit> = null
  for (const hit of hits) {
    const found = readHit(hit.object)
    if (!found) continue
    if (hover && found.shell) {
      if (!shellHit) shellHit = found
      continue
    }
    return found
  }
  return hover ? shellHit : null
}

function onPointerDown(event: PointerEvent) {
  dragging = true
  dragged = false
  downX = event.clientX
  downY = event.clientY
  renderer?.domElement.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (dragging) {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 10) dragged = true
    return
  }
  const hit = pick(event, true)
  if (!hit) {
    if (root.value) root.value.style.cursor = 'default'
    emit('leave')
    return
  }
  if (root.value) root.value.style.cursor = 'pointer'
  emit('hover', { kind: hit.kind, item: hit.item, x: event.clientX, y: event.clientY })
}

function houseOf(hit: NonNullable<ReturnType<typeof pick>>) {
  if (hit.kind === 'warehouse') return hit.item
  return hit.house || hostOf(hit.item, props.plan.items)
}

function onPointerUp(event: PointerEvent) {
  const moved = dragged
  dragging = false
  if (renderer?.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
  if (moved || event.button !== 0) return
  const hit = pick(event)
  const house = hit ? houseOf(hit) : undefined
  if (house && isWarehouseItem(house)) emit('open', house)
}

function onPointerLeave() {
  if (dragging) return
  emit('leave')
}

function onWheel(event: WheelEvent) {
  stopFly()
  const factor = event.deltaY > 0 ? 1.08 : 0.92
  distance = Math.min(maxDistance, Math.max(minDistance, distance * factor))
  updateCamera()
}

function flyFromHouse(item: PlanItem) {
  if (!camera) return
  stopFly()
  resize()
  const bounds = contentFrame(props.plan, 0.4)
  const span = Math.max(bounds.w, bounds.h, 8)
  const endDistance = Math.min(maxDistance, Math.max(minDistance, span * 0.92))
  const end = new THREE.Vector3(bounds.x + bounds.w / 2, 0, bounds.y + bounds.h / 2)
  const fromTarget = new THREE.Vector3(item.col + item.cols / 2, 0.4, item.row + item.rows / 2)
  const fromDistance = Math.min(endDistance * 0.72, Math.max(minDistance, Math.max(item.cols, item.rows, 3) * 1.15))
  target.copy(fromTarget)
  distance = fromDistance
  updateCamera()
  const started = performance.now()
  const step = (now: number) => {
    resize()
    const t = Math.min(1, (now - started) / 520)
    const e = 1 - (1 - t) ** 3
    target.lerpVectors(fromTarget, end, e)
    distance = fromDistance + (endDistance - fromDistance) * e
    updateCamera()
    if (t < 1) flyCamera = requestAnimationFrame(step)
  }
  flyCamera = requestAnimationFrame(step)
}

defineExpose({ flyFromHouse })

function boot() {
  const el = root.value
  if (!el || renderer) return
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x14181d, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  el.appendChild(renderer.domElement)
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800)
  scene.add(new THREE.HemisphereLight(0xd5e2f2, 0x1a140c, 0.9))
  scene.add(new THREE.AmbientLight(0x90a4bf, 0.35))
  const sun = new THREE.DirectionalLight(0xfff6e4, 1.2)
  sun.position.set(18, 32, 10)
  scene.add(sun)
  rebuild()
  resize()
  resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(el)
  start()
}

onMounted(() => {
  boot()
})

onDeactivated(() => {
  shown = false
  stopFly()
  cancelAnimationFrame(frame)
})

onActivated(() => {
  shown = true
  resize()
  start()
})

watch(() => props.active, (on) => {
  if (on) {
    resize()
    start()
  } else {
    cancelAnimationFrame(frame)
  }
})

watch(() => [props.plan.items, props.lots, props.warnCodes] as const, () => rebuild(), { deep: true })

onBeforeUnmount(() => {
  alive = false
  stopFly()
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  disposeYard()
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = null
})
</script>

<template>
  <div
    ref="root"
    class="scene-view"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
    @wheel.prevent="onWheel"
  />
</template>

<style scoped>
.scene-view { position: absolute; inset: 0; touch-action: none; cursor: default; }
.scene-view :deep(canvas) { display: block; width: 100%; height: 100%; }
</style>
