<template>
  <div class="flex flex-col w-full h-full overflow-hidden relative">
    <!-- Ambient glow ring -->
    <div
      :class="{
        'ring-transparent scale-150': !['ERROR', 'COMPLETED'].includes(status.state),
        'ring-red-300': status.state === 'ERROR',
        'ring-green-300': status.state === 'COMPLETED',
      }"
      class="transition-all duration-500 absolute w-full h-full ring-[10vw] mix-blend-hard-light animate-pulse blur-[4vw]"
    ></div>

    <!-- Header: State & Title -->
    <div class="z-20 flex items-center justify-between px-[5%] pt-[2%] select-none">
      <div class="flex items-center gap-3">
        <span
          class="px-3 py-0.5 rounded-full text-xs font-semibold tracking-wide"
          :class="stateBadgeClass"
        >{{ stateLabel }}</span>
        <span class="text-gray-400 text-sm">{{ elapsedText }}</span>
      </div>
      <div class="text-gray-500 text-xs">OpenPnP Dashboard</div>
    </div>

    <!-- Main Content -->
    <div class="flex flex-1 w-full overflow-hidden">
      <!-- Left: Progress Circle -->
      <div class="z-10 p-[3%] flex w-1/2 justify-center h-full items-center">
        <div class="flex items-center justify-center w-full h-full">
          <div class="relative w-full h-full">
            <svg class="w-full h-full" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.915" fill="none" class="stroke-sky-950" stroke-width="4" />
            </svg>
            <svg class="w-full h-full absolute top-0 left-0" viewBox="0 0 36 36">
              <circle
                cx="18" cy="18" r="15.915" fill="none"
                :class="progressColorClass"
                stroke-width="4" stroke-dasharray="100"
                :stroke-dashoffset="100 - progress"
                stroke-linecap="round"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <div class="font-bold text-gray-100" :style="{ fontSize: `clamp(0.5rem, 10vw, 15vh)` }">{{ progress }}%</div>
              <div class="absolute top-[60%] text-gray-300 mt-1" :style="{ fontSize: `clamp(0.25rem, 2vw, 8vh)` }">{{ status.done }} / {{ status.total }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Nozzles -->
      <div class="z-10 p-[3%] w-1/2 flex">
        <div :key="nozzle.id" v-for="nozzle in status.nozzles" class="gap-x-2 gap-y-2 flex flex-col justify-around items-center w-full">
          <span class="text-gray-300" :style="{ fontSize: `clamp(0.25rem, 4vw, 8vh)` }">{{ nozzle.id }}</span>
          <div class="h-3/5 relative" :class="nozzle.isPicking || nozzle.isPlacing ? 'motion-translate-y-loop-[15%] motion-loop-once' : ''">
            <img class="h-full" src="/nozzle.svg" />
            <Vue3Lottie class="transition-opacity top-0 absolute" :class="nozzle.isVacActive ? 'opacity-100' : 'opacity-0'" :animationData="airFlow" />
            <div style="margin-top: -0.28rem" :class="nozzle.hasComponent ? 'motion-opacity-in-0' : 'motion-opacity-out-0'" class="motion-delay-200 motion-duration-200 mx-auto w-1/3 h-[4%] border-2 border-white"></div>
          </div>
          <!-- Nozzle detail tags -->
          <div class="flex flex-col gap-0.5 items-center text-[0.6vw]">
            <span v-if="nozzle.isPicking" class="text-amber-400">PICKING</span>
            <span v-if="nozzle.isPlacing" class="text-emerald-400">PLACING</span>
            <span v-if="nozzle.isVacActive && !nozzle.isPicking && !nozzle.isPlacing" class="text-sky-400">VACUUM</span>
            <span v-if="nozzle.hasComponent" class="text-purple-400">HAS PART</span>
            <span v-if="!nozzle.isVacActive && !nozzle.hasComponent && !nozzle.isPicking && !nozzle.isPlacing" class="text-gray-600">IDLE</span>
          </div>
          <!-- Vacuum indicator -->
          <div class="z-50 w-1/4 relative">
            <div v-if="nozzle.isVacActive" class="w-full aspect-[2/1] z-0 bg-sky-500 animate-ping rounded-lg absolute"></div>
            <div class="transition-colors z-50 w-full aspect-[2/1] rounded-lg" :class="nozzle.isVacActive ? 'bg-sky-500 ' : 'bg-sky-950'"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer: Connection Info -->
    <div class="z-20 flex items-center justify-between px-[5%] pb-[2%] text-gray-400 select-none"
      :style="{ fontSize: `clamp(0.5rem, 1.2vw, 1rem)` }">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        <span>{{ connectionInfo.host }}:{{ connectionInfo.httpPort }}</span>
        <span class="text-gray-600">| UDP :{{ connectionInfo.discoveryPort }}</span>
      </div>
      <span class="text-gray-600 text-xs">{{ connectionInfo.host !== '...' ? '已连接' : '检测中...' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import airFlow from '../assets/airFlow.json'

interface Nozzle {
  id: string
  isPicking?: boolean
  isPlacing?: boolean
  isVacActive?: boolean
  hasComponent?: boolean
}

interface MachineStatus {
  done: number
  total: number
  nozzles: Nozzle[]
  state: string
}

interface ConnectionInfo {
  host: string
  httpPort: number
  discoveryPort: number
}

const status = reactive<MachineStatus>({
  done: 0,
  total: 0,
  nozzles: [{ id: 'N1' }, { id: 'N2' }],
  state: '',
})

const connectionInfo = reactive<ConnectionInfo>({
  host: '...',
  httpPort: 10064,
  discoveryPort: 10065,
})

const progress = computed(() => {
  if (status.total === 0) return 0
  return Math.floor((status.done / status.total) * 100)
})

const stateLabel = computed(() => {
  switch (status.state) {
    case 'RUNNING': return '运行中'
    case 'COMPLETED': return '已完成'
    case 'ERROR': return '出错'
    default: return '待机'
  }
})

const stateBadgeClass = computed(() => {
  switch (status.state) {
    case 'RUNNING': return 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
    case 'COMPLETED': return 'bg-green-500/20 text-green-300 border border-green-500/30'
    case 'ERROR': return 'bg-red-500/20 text-red-300 border border-red-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }
})

const progressColorClass = computed(() => {
  switch (status.state) {
    case 'COMPLETED': return 'stroke-green-500'
    case 'ERROR': return 'stroke-red-500'
    default: return 'stroke-sky-500'
  }
})

const elapsedText = computed(() => {
  if (status.state !== 'RUNNING') return ''
  if (status.total === 0) return ''
  const pct = progress.value
  if (pct === 0) return '开始...'
  return `进度 ${pct}%`
})

let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollStatus() {
  try {
    const res = await fetch('http://127.0.0.1:10064/status')
    if (res.ok) {
      const data = await res.json()
      Object.assign(status, data)
    }
  } catch { /* server not ready yet */ }
}

function handleConnectionInfo(_event: unknown, info: ConnectionInfo) {
  Object.assign(connectionInfo, info)
}

onMounted(() => {
  window.ipcRenderer.on('connection-info', handleConnectionInfo)
  pollTimer = setInterval(pollStatus, 500)
  pollStatus()
})

onBeforeUnmount(() => {
  window.ipcRenderer.off('connection-info', handleConnectionInfo)
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
/* Add smooth animation for progress updates */
circle {
  transition: stroke-dashoffset 0.35s;
  transform: rotate(-90deg);
  transform-origin: center;
}
</style>
