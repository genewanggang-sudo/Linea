<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NDivider,
  NFlex,
  NGradientText,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NSpace,
  NTag,
  NText,
  darkTheme,
} from 'naive-ui'
import {
  armTool,
  bootstrapPlayground,
  cancelActiveCommand,
  clearAllShapes,
  insertRandomPolygon,
  loadEngineeringDemo,
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
    detail: '请选择上方工具，支持滚轮缩放、拖拽平移与命令预览。',
    steps: [],
    fixedPoints: 0,
  },
})

const tools: Array<{ id: ShapeKind | 'polygon' | 'demo' | 'clear' }> = [
  { id: 'line' },
  { id: 'circle' },
  { id: 'arc' },
  { id: 'ellipse' },
  { id: 'ellipseArc' },
  { id: 'bspline' },
  { id: 'polygon' },
  { id: 'demo' },
  { id: 'clear' },
]

const cursorLabel = computed(() => {
  if (!state.cursorWorld) {
    return '--'
  }
  return `${state.cursorWorld.x.toFixed(2)}, ${state.cursorWorld.y.toFixed(2)}`
})

let unsubscribe: (() => void) | undefined

function applySnapshot(snapshot: PlaygroundState) {
  state.cursorWorld = snapshot.cursorWorld
  state.toast = snapshot.toast
  state.drawing = snapshot.drawing
}

function handleToolClick(id: ShapeKind | 'polygon' | 'demo' | 'clear') {
  if (id === 'polygon') {
    insertRandomPolygon()
    return
  }
  if (id === 'demo') {
    loadEngineeringDemo()
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
    <n-layout class="shell">
      <n-layout-header bordered class="topbar">
        <div class="brand">
          <n-text depth="3" class="eyebrow">工程图客户演示</n-text>
          <n-gradient-text class="headline" type="info">二维工程图绘制台</n-gradient-text>
          <n-text depth="3" class="subline">
            黑色主题、全屏画布、完整图框、投影视图、临时预览与命令提示。
          </n-text>
        </div>

        <n-flex class="toolbar" :wrap="true" :size="[12, 12]">
          <n-button
            v-for="tool in tools"
            :key="tool.id"
            tertiary
            strong
            class="tool-button"
            :class="{ active: state.drawing.activeTool === tool.id }"
            @click="handleToolClick(tool.id)"
          >
            <div class="tool-copy">
              <span class="tool-label" :style="{ color: toolMeta[tool.id].accent }">
                {{ toolMeta[tool.id].label }}
              </span>
              <span class="tool-subtitle">{{ toolMeta[tool.id].subtitle }}</span>
            </div>
          </n-button>
        </n-flex>
      </n-layout-header>

      <div class="status-strip">
        <n-alert type="info" :bordered="false" class="status-alert">
          <template #header>
            {{ state.drawing.title }}
          </template>
          {{ state.drawing.detail }}
        </n-alert>

        <n-space class="chips" :wrap="true">
          <n-tag round :bordered="false" type="info">光标：{{ cursorLabel }}</n-tag>
          <n-tag round :bordered="false">状态：{{ state.toast }}</n-tag>
          <n-tag round :bordered="false">鼠标中键拖拽，滚轮缩放</n-tag>
        </n-space>
      </div>

      <n-layout-content class="stage">
        <div ref="mountRef" class="canvas-mount"></div>

        <div class="overlay">
          <n-card class="command-card" :bordered="false">
            <template #header>
              <div class="card-header">
                <span>当前命令</span>
                <n-tag size="small" :bordered="false" type="success" v-if="state.drawing.activeTool">
                  进行中
                </n-tag>
                <n-tag size="small" :bordered="false" v-else>
                  空闲
                </n-tag>
              </div>
            </template>

            <div class="command-title">{{ state.drawing.title }}</div>
            <div class="command-detail">{{ state.drawing.detail }}</div>

            <n-divider />

            <div v-if="state.drawing.steps.length" class="steps">
              <div
                v-for="(step, index) in state.drawing.steps"
                :key="step"
                class="step"
                :class="{ done: index < state.drawing.fixedPoints }"
              >
                <span class="step-index">{{ index + 1 }}</span>
                <span>{{ step }}</span>
              </div>
            </div>
            <div v-else class="empty-copy">
              已准备好下一条绘图命令。
            </div>

            <n-divider />

            <n-flex justify="space-between" align="center">
              <n-text depth="3">按 Esc 或点击右侧按钮可取消当前命令。</n-text>
              <n-button tertiary type="warning" :disabled="!state.drawing.activeTool" @click="cancelActiveCommand">
                取消命令
              </n-button>
            </n-flex>
          </n-card>
        </div>
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.shell {
  height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 22%),
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 20%),
    linear-gradient(180deg, #02070d 0%, #060b12 45%, #04070d 100%);
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 24px;
  background: rgba(3, 7, 13, 0.92);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.brand {
  display: grid;
  gap: 6px;
  min-width: 280px;
}

.eyebrow {
  letter-spacing: 0.12em;
  font-size: 11px;
}

.headline {
  font-size: 28px;
  font-weight: 700;
}

.subline {
  max-width: 560px;
  line-height: 1.6;
}

.toolbar {
  justify-content: flex-end;
}

.tool-button {
  min-width: 154px;
  height: auto;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(10, 15, 22, 0.94);
  border: 1px solid rgba(100, 116, 139, 0.18);
}

.tool-button.active {
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.34) inset;
  background: rgba(12, 19, 30, 0.98);
}

.tool-copy {
  display: grid;
  text-align: left;
  gap: 4px;
}

.tool-label {
  font-size: 14px;
  font-weight: 700;
}

.tool-subtitle {
  color: #8ea0b7;
  font-size: 12px;
}

.status-strip {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  align-items: center;
}

.status-alert {
  flex: 1;
  min-width: 0;
  background: rgba(4, 10, 17, 0.78);
  border: 1px solid rgba(100, 116, 139, 0.14);
}

.chips {
  justify-content: flex-end;
}

.stage {
  position: relative;
  height: calc(100vh - 146px);
}

.canvas-mount {
  position: absolute;
  inset: 0;
}

.overlay {
  position: absolute;
  left: 20px;
  bottom: 20px;
  width: min(420px, calc(100vw - 40px));
  pointer-events: none;
}

.command-card {
  pointer-events: auto;
  border-radius: 22px;
  background: rgba(5, 10, 16, 0.88);
  border: 1px solid rgba(100, 116, 139, 0.18);
  box-shadow: 0 26px 48px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(18px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.command-title {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

.command-detail {
  margin-top: 6px;
  color: #9db0c7;
  line-height: 1.6;
}

.steps {
  display: grid;
  gap: 10px;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #8ea0b7;
}

.step.done {
  color: #e2e8f0;
}

.step-index {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.14);
  font-size: 12px;
  font-weight: 700;
}

.empty-copy {
  color: #8ea0b7;
}

@media (max-width: 960px) {
  .topbar,
  .status-strip {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar,
  .chips {
    justify-content: flex-start;
  }

  .stage {
    height: calc(100vh - 222px);
  }
}
</style>
