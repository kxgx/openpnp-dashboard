<template>
  <div class="w-full h-full relative bg-black">
    <canvas ref="canvasRef" class="w-full h-full"></canvas>

    <!-- Overlay: back button -->
    <div class="absolute top-4 left-4 z-10">
      <button
        class="px-4 py-2 rounded-lg bg-gray-800/80 text-gray-300 hover:text-white hover:bg-gray-700/80 transition-colors text-sm"
        @click="$emit('back')"
      >← 返回仪表盘</button>
    </div>

    <!-- Overlay: status info -->
    <div class="absolute bottom-4 left-4 z-10 text-xs text-gray-500">
      <div v-if="status.machineState">{{ status.machineState }}</div>
      <div v-if="coord.x !== undefined">
        X: {{ coord.x?.toFixed(1) }} Y: {{ coord.y?.toFixed(1) }} Z: {{ coord.z?.toFixed(1) }}
      </div>
    </div>

    <!-- Overlay: loading indicator -->
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
      <div class="text-gray-400 text-sm">加载模型中...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

defineEmits<{ back: [] }>()

interface Coord {
  x?: number
  y?: number
  z?: number
  rotation?: number
}

interface MachineStatus {
  machineState: string
  state: string
}

const props = defineProps<{
  status: MachineStatus
  coord: Coord
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let animationId = 0

// Group references for moving parts
let xGantryGroup: THREE.Group | null = null
let zHeadGroup: THREE.Group | null = null

function initScene() {
  if (!canvasRef.value) return

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111827)
  scene.fog = new THREE.Fog(0x111827, 2, 20)

  // Camera
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50)
  camera.position.set(3, 2.5, 4)
  camera.lookAt(0, 0, 0)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.15, 0)
  controls.update()

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 1.5)
  scene.add(ambient)

  const keyLight = new THREE.DirectionalLight(0xffffff, 2)
  keyLight.position.set(5, 8, 5)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x8899cc, 0.8)
  fillLight.position.set(-3, 2, -2)
  scene.add(fillLight)

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.5)
  rimLight.position.set(0, 1, -5)
  scene.add(rimLight)

  // Ground grid
  const grid = new THREE.GridHelper(3, 20, 0x334155, 0x1e293b)
  scene.add(grid)
}

function buildProceduralModel() {
  if (!scene) return

  // Materials
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.3, roughness: 0.5 })
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 })
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.4 })
  const bedMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.2, roughness: 0.7 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.5 })

  // === Staging plate (fixed bed) ===
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.2), bedMaterial)
  bed.position.set(0, -0.35, 0)
  bed.receiveShadow = true
  scene.add(bed)

  // === Y gantry pillars (fixed) ===
  const pillarGeom = new THREE.BoxGeometry(0.06, 0.55, 0.06)
  // Left pillar
  const leftPillar = new THREE.Mesh(pillarGeom, frameMaterial)
  leftPillar.position.set(-0.65, -0.05, -0.5)
  leftPillar.castShadow = true
  scene.add(leftPillar)
  // Right pillar
  const rightPillar = new THREE.Mesh(pillarGeom, frameMaterial)
  rightPillar.position.set(0.65, -0.05, -0.5)
  rightPillar.castShadow = true
  scene.add(rightPillar)

  // Y rails on top of pillars
  const yRailGeom = new THREE.BoxGeometry(0.04, 0.02, 0.9)
  const yRailL = new THREE.Mesh(yRailGeom, railMaterial)
  yRailL.position.set(-0.65, 0.24, -0.45)
  scene.add(yRailL)
  const yRailR = new THREE.Mesh(yRailGeom, railMaterial)
  yRailR.position.set(0.65, 0.24, -0.45)
  scene.add(yRailR)

  // === X gantry group (moves along Y) ===
  xGantryGroup = new THREE.Group()
  xGantryGroup.position.set(0, 0.24, -0.45)
  scene.add(xGantryGroup)

  // X beam
  const xBeam = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.03), frameMaterial)
  xGantryGroup.add(xBeam)

  // X rail
  const xRail = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.015, 0.025), railMaterial)
  xRail.position.set(0, -0.02, 0)
  xGantryGroup.add(xRail)

  // Motor mounts on beam ends
  const motorGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8)
  const motorL = new THREE.Mesh(motorGeom, accentMaterial)
  motorL.position.set(-0.62, 0, 0)
  motorL.rotation.x = Math.PI / 2
  xGantryGroup.add(motorL)
  const motorR = new THREE.Mesh(motorGeom, accentMaterial)
  motorR.position.set(0.62, 0, 0)
  motorR.rotation.x = Math.PI / 2
  xGantryGroup.add(motorR)

  // === Z head group (moves along X, on the beam) ===
  zHeadGroup = new THREE.Group()
  zHeadGroup.position.set(0, -0.08, 0)
  xGantryGroup.add(zHeadGroup)

  // Carriage plate
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), frameMaterial)
  zHeadGroup.add(carriage)

  // Z column
  const zColumn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), railMaterial)
  zColumn.position.set(0, -0.07, 0)
  zHeadGroup.add(zColumn)

  // === Nozzle 1 (N1) ===
  const n1Group = new THREE.Group()
  n1Group.position.set(-0.015, -0.16, 0)
  n1Group.name = 'N1'
  zHeadGroup.add(n1Group)

  const n1Body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), nozzleMaterial)
  n1Body.position.y = 0.02
  n1Group.add(n1Body)
  const n1Tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.015, 8), accentMaterial)
  n1Tip.position.y = -0.005
  n1Group.add(n1Tip)

  // === Nozzle 2 (N2) ===
  const n2Group = new THREE.Group()
  n2Group.position.set(0.015, -0.16, 0)
  n2Group.name = 'N2'
  zHeadGroup.add(n2Group)

  const n2Body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), nozzleMaterial)
  n2Body.position.y = 0.02
  n2Group.add(n2Body)
  const n2Tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.015, 8), accentMaterial)
  n2Tip.position.y = -0.005
  n2Group.add(n2Tip)

  // Top camera (fixed on frame)
  const camGroup = new THREE.Group()
  camGroup.position.set(0, 0.35, 0.35)
  scene.add(camGroup)
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), accentMaterial)
  camGroup.add(camBody)
  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), railMaterial)
  camLens.position.y = -0.045
  camGroup.add(camLens)

  loading.value = false
}

function animate() {
  if (!renderer || !scene || !camera || !controls) return

  animationId = requestAnimationFrame(animate)
  controls.update()

  // Animate nozzle up/down in non-job mode
  if (!props.status.state && zHeadGroup) {
    const t = Date.now() * 0.001
    zHeadGroup.position.y = -0.08 + Math.sin(t * 1.5) * 0.02
  }

  renderer.render(scene, camera)
}

function onResize() {
  if (!canvasRef.value || !renderer || !camera) return
  const parent = canvasRef.value.parentElement
  if (!parent) return
  const w = parent.clientWidth
  const h = parent.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
}

// Watch coord changes
watch(() => props.coord, (c) => {
  if (!c) return
  // Map OpenPnP mm coords to scene units (scale 1mm = 0.001 scene units)
  // X gantry moves on Y rail, Z head moves on X beam
  if (xGantryGroup && c.y !== undefined) {
    xGantryGroup.position.z = -0.45 + (c.y - 250) * 0.0008 // center around 250mm
  }
  if (zHeadGroup && c.x !== undefined) {
    zHeadGroup.position.x = (c.x - 250) * 0.0008
  }
  if (zHeadGroup && c.z !== undefined) {
    // Z: nozzle down/up
    const nozzles = zHeadGroup.children.filter(g => (g as THREE.Group).name === 'N1' || (g as THREE.Group).name === 'N2')
    for (const n of nozzles) {
      n.position.y = -0.16 - c.z * 0.001
    }
  }
}, { deep: true })

onMounted(() => {
  initScene()
  buildProceduralModel()
  animate()
  window.addEventListener('resize', onResize)
  onResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (animationId) cancelAnimationFrame(animationId)
  if (renderer) renderer.dispose()
})
</script>

<style scoped>
canvas {
  display: block;
}
</style>
