import type { PlaygroundState, ShapeKind } from './playground_defs'
import { toolMeta } from './playground_defs'

const defaultDetail = '请选择上方工具。滚轮缩放，拖拽平移，Esc 可取消当前命令。'

const state: PlaygroundState = {
    cursorWorld: null,
    drawing: {
        activeTool: null,
        title: '工程图演示台已就绪',
        detail: defaultDetail,
        steps: [],
        fixedPoints: 0,
    },
    toast: '空闲',
}

const subscribers = new Set<(state: PlaygroundState) => void>()

function createSnapshot(): PlaygroundState {
    return {
        cursorWorld: state.cursorWorld ? { ...state.cursorWorld } : null,
        toast: state.toast,
        drawing: {
            ...state.drawing,
            steps: [...state.drawing.steps],
        },
    }
}

export function emitPlaygroundState() {
    const snapshot = createSnapshot()
    subscribers.forEach(listener => listener(snapshot))
}

export function subscribePlayground(listener: (state: PlaygroundState) => void) {
    subscribers.add(listener)
    listener(createSnapshot())
    return () => subscribers.delete(listener)
}

export function setToast(message: string) {
    state.toast = message
    emitPlaygroundState()
}

export function setCursorWorld(cursorWorld: PlaygroundState['cursorWorld']) {
    state.cursorWorld = cursorWorld
    emitPlaygroundState()
}

export function resetDrawingStatus(detail = defaultDetail) {
    state.drawing = {
        activeTool: null,
        title: '工程图演示台已就绪',
        detail,
        steps: [],
        fixedPoints: 0,
    }
    emitPlaygroundState()
}

export function updateDrawingStatus(kind: ShapeKind, fixedPoints: number, steps: string[]) {
    const nextStep = kind === 'bspline'
        ? `继续点击控制点，当前 ${fixedPoints} 个，右键完成`
        : steps[Math.min(fixedPoints, steps.length - 1)]
    state.drawing = {
        activeTool: kind,
        title: toolMeta[kind].label,
        detail: kind === 'bspline'
            ? `${nextStep}。`
            : `${nextStep}，已固定 ${fixedPoints}/${steps.length} 个点。`,
        steps,
        fixedPoints,
    }
    emitPlaygroundState()
}
