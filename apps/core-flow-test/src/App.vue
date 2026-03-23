<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { NButton, NConfigProvider, NFlex, darkTheme } from 'naive-ui'
import {
  armTool,
  bootstrapPlayground,
  clearAllShapes,
  insertRandomPolygon,
  loadEngineeringDemo,
  loadStyleDemo,
  subscribePlayground,
  toolMeta,
  type PlaygroundState,
  type ShapeKind,
} from './playground'

const mountRef = ref<HTMLElement | null>(null)

const state = reactive<PlaygroundState>({
  cursorWorld: null,
  toast: '空闲',
  drawing: {
    activeTool: null,
    title: '工程图演示台已就绪',
    detail: '请选择上方工具开始绘制。',
    steps: [],
    fixedPoints: 0,
  },
})

const tools: Array<{ id: ShapeKind | 'polygon' | 'demo' | 'styleDemo' | 'clear' }> = [
  { id: 'line' },
  { id: 'polyline' },
  { id: 'rectLine' },
  { id: 'circle' },
  { id: 'arc' },
  { id: 'ellipse' },
  { id: 'ellipseArc' },
  { id: 'bspline' },
  { id: 'polygon' },
  { id: 'demo' },
  { id: 'styleDemo' },
  { id: 'clear' },
]

const hintText = computed(() => {
  const parts = [state.drawing.title, state.drawing.detail]
  return parts.filter(Boolean).join(' · ')
})

let unsubscribe: (() => void) | undefined

function applySnapshot(snapshot: PlaygroundState) {
  state.cursorWorld = snapshot.cursorWorld
  state.toast = snapshot.toast
  state.drawing = snapshot.drawing
}

function handleToolClick(id: ShapeKind | 'polygon' | 'demo' | 'styleDemo' | 'clear') {
  if (id === 'polygon') {
    insertRandomPolygon()
    return
  }
  if (id === 'demo') {
    loadEngineeringDemo()
    return
  }
  if (id === 'styleDemo') {
    loadStyleDemo()
    return
  }
  if (id === 'clear') {
    clearAllShapes()
    return
  }
  void armTool(id)
}

onMounted(() => {
  if (mountRef.value) {
    bootstrapPlayground(mountRef.value)
  }
  unsubscribe = subscribePlayground(applySnapshot)
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <n-config-provider :theme="darkTheme">
    <div class="shell">
      <div ref="mountRef" class="canvas-mount"></div>

      <header class="toolbar">
        <n-flex class="tool-grid" :wrap="true" :size="[8, 8]" justify="center">
          <n-button
            v-for="tool in tools"
            :key="tool.id"
            tertiary
            strong
            class="tool-button"
            :class="{ active: state.drawing.activeTool === tool.id }"
            @click="handleToolClick(tool.id)"
          >
            <span class="tool-label" :style="{ color: toolMeta[tool.id].accent }">
              {{ toolMeta[tool.id].label }}
            </span>
          </n-button>
        </n-flex>
      </header>

      <div class="hint">
        {{ hintText }}
      </div>
    </div>
  </n-config-provider>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #02070d;
}

:global(*) {
  box-sizing: border-box;
}

.shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #02070d;
}

.canvas-mount {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

:global(.canvas-mount canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 3;
  padding: 10px 12px;
  border-radius: 18px;
  background: rgba(4, 10, 17, 0.72);
  border: 1px solid rgba(100, 116, 139, 0.16);
  backdrop-filter: blur(16px);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
}

.tool-grid {
  width: 100%;
}

.tool-button {
  min-width: 76px;
  padding: 0 10px;
  border-radius: 12px;
  background: rgba(10, 15, 22, 0.82);
  border: 1px solid rgba(100, 116, 139, 0.14);
}

.tool-button.active {
  background: rgba(12, 19, 30, 0.96);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.32) inset;
}

.tool-label {
  font-size: 12px;
  font-weight: 700;
}

.hint {
  position: absolute;
  top: 96px;
  left: 50%;
  z-index: 3;
  width: min(720px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 12px 18px;
  border-radius: 16px;
  color: #d7e3f4;
  text-align: center;
  pointer-events: none;
  background: rgba(4, 10, 17, 0.66);
  border: 1px solid rgba(100, 116, 139, 0.14);
  backdrop-filter: blur(14px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
}

@media (max-width: 900px) {
  .toolbar {
    top: 10px;
    left: 10px;
    right: 10px;
    padding: 10px;
  }

  .tool-button {
    min-width: 68px;
    padding: 0 8px;
  }

  .hint {
    top: 122px;
    width: calc(100vw - 20px);
  }
}
</style>
