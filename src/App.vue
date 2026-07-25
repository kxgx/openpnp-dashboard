<script setup lang="ts">
import { ref, reactive } from 'vue'
import DashBoard from "./components/DashBoard.vue"
import Lumen3D from "./components/Lumen3D.vue"

const view = ref<'dashboard' | '3d'>('dashboard')

// Shared status & coords (populated by IPC from renderer)
const status3d = reactive({
  machineState: '',
  state: '',
})
const coord3d = reactive({
  x: 0, y: 0, z: 0, rotation: 0,
})

// Expose for DashBoard to update
;(window as any).__3dStatus = status3d
;(window as any).__3dCoord = coord3d
</script>

<template>
  <Lumen3D
    v-if="view === '3d'"
    :status="status3d"
    :coord="coord3d"
    @back="view = 'dashboard'"
  />
  <DashBoard v-else @switch3d="view = '3d'" />
</template>

<style></style>