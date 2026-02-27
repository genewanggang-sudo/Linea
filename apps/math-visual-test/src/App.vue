<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ElButton,
  ElCard,
  ElConfigProvider,
  ElSpace,
  ElTag,
} from 'element-plus'
import { useMathViz } from './composables/use_math_viz'

const canvasHost = ref<HTMLDivElement | null>(null)
const viz = useMathViz(canvasHost)

const isCompleted = computed(() => viz.completionMessage.value.length > 0)

function toggleDiscrete(): void {
  viz.setShowDiscrete(!viz.showDiscrete.value)
}

function toggleDiscretePoints(): void {
  viz.setShowDiscretePoints(!viz.showDiscretePoints.value)
}

function toggleBoundingBox(): void {
  viz.setShowBoundingBox(!viz.showBoundingBox.value)
}

function toggleDirection(): void {
  viz.setShowDirection(!viz.showDirection.value)
}
</script>

<template>
  <el-config-provider>
    <div class="app-shell">
      <header class="top-toolbar">
        <el-space>
          <el-button
            v-for="tool in viz.drawTools"
            :key="tool"
            :type="tool === viz.activeTool.value ? 'primary' : 'default'"
            size="small"
            @click="viz.setActiveTool(tool)"
          >
            {{ viz.toolLabel(tool) }}
          </el-button>
        </el-space>
      </header>

      <main class="workspace">
        <section class="canvas-wrap">
          <div
            id="canvas-host"
            ref="canvasHost"
          />

          <div
            class="status-bar"
            :class="{ completed: isCompleted }"
          >
            <span><strong>模式：</strong>{{ viz.toolLabel(viz.activeTool.value) }}</span>
            <span><strong>对象数：</strong>{{ viz.entityCount.value }}</span>
            <span><strong>提示：</strong>{{ viz.statusHint.value }}</span>
            <span v-if="isCompleted"><strong>完成：</strong>{{ viz.completionMessage.value }}</span>
          </div>

          <div
            class="perf-panel"
            :class="viz.perfState.value.fpsClass"
          >
            <el-tag
              size="small"
              :type="viz.perfState.value.fpsClass === 'good' ? 'success' : viz.perfState.value.fpsClass === 'warn' ? 'warning' : 'danger'"
            >
              性能
            </el-tag>
            <span>FPS: {{ viz.perfState.value.fps.toFixed(1) }}</span>
            <span>帧耗时: {{ viz.perfState.value.frameMs.toFixed(2) }} ms</span>
            <span>绘制调用: {{ viz.perfState.value.drawCalls }}</span>
            <span>三角形: {{ viz.perfState.value.triangles }}</span>
            <span>线段: {{ viz.perfState.value.lines }}</span>
            <span>离散点总数: {{ viz.perfState.value.sampledPoints }}</span>
          </div>
        </section>

        <aside class="floating-panel">
          <el-card class="panel-card" shadow="never">
            <header class="panel-header">
              <h2>测试工具</h2>
            </header>

            <section class="panel-group">
              <h3 class="panel-title">显示层</h3>
              <div class="panel-buttons">
                <el-button :type="viz.showDiscrete.value ? 'primary' : 'default'" class="panel-btn" plain @click="toggleDiscrete()">离散折线</el-button>
                <el-button :type="viz.showDiscretePoints.value ? 'primary' : 'default'" class="panel-btn" plain @click="toggleDiscretePoints()">离散点</el-button>
                <el-button :type="viz.showBoundingBox.value ? 'primary' : 'default'" class="panel-btn" plain @click="toggleBoundingBox()">包围盒</el-button>
                <el-button :type="viz.showDirection.value ? 'primary' : 'default'" class="panel-btn" plain @click="toggleDirection()">线方向</el-button>
              </div>
            </section>

            <section class="panel-group">
              <h3 class="panel-title">离散精度</h3>
              <div class="panel-buttons">
                <el-button :type="viz.preset.value === 'low' ? 'primary' : 'default'" class="panel-btn" plain @click="viz.applyPreset('low')">低</el-button>
                <el-button :type="viz.preset.value === 'medium' ? 'primary' : 'default'" class="panel-btn" plain @click="viz.applyPreset('medium')">中</el-button>
                <el-button :type="viz.preset.value === 'high' ? 'primary' : 'default'" class="panel-btn" plain @click="viz.applyPreset('high')">高</el-button>
                <el-button :type="viz.preset.value === 'ultra' ? 'primary' : 'default'" class="panel-btn" plain @click="viz.applyPreset('ultra')">极高</el-button>
              </div>
            </section>

            <section class="panel-group">
              <h3 class="panel-title">常用动作</h3>
              <div class="panel-buttons">
                <el-button
                  class="panel-btn span-2"
                  :type="viz.isGenerating.value ? 'warning' : 'primary'"
                  plain
                  :loading="viz.isGenerating.value"
                  @click="viz.generateRandomCurves()"
                >
                  追加50条随机线
                </el-button>
                <el-button class="panel-btn" plain @click="viz.showOnlyPoints()">仅显示离散点</el-button>
                <el-button class="panel-btn" plain @click="viz.clearBbox()">清空包围盒</el-button>
                <el-button class="panel-btn" plain @click="viz.endDrawingMode()">结束绘制</el-button>
                <el-button class="panel-btn" type="danger" plain @click="viz.clearScene()">清空场景</el-button>
              </div>
            </section>
          </el-card>
        </aside>
      </main>
    </div>
  </el-config-provider>
</template>
