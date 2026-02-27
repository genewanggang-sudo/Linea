import type { WebGLRenderer } from 'three'

export interface PerfSnapshot {
    fps: number
    frameMs: number
    drawCalls: number
    triangles: number
    lines: number
    points: number
    geometries: number
    textures: number
}

export function createPerformanceMonitor(renderer: WebGLRenderer) {
    let lastTime = performance.now()
    let accum = 0
    let samples = 0
    let fps = 0
    let frameMs = 0

    const tick = () => {
        const now = performance.now()
        const dt = now - lastTime
        frameMs = dt
        lastTime = now

        accum += dt
        samples += 1
        if (accum >= 1000) {
            fps = (samples * 1000) / Math.max(accum, 1)
            accum = 0
            samples = 0
        }
    }

    const snapshot = (): PerfSnapshot => ({
        fps,
        frameMs,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        lines: renderer.info.render.lines,
        points: renderer.info.render.points,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
    })

    return { tick, snapshot }
}
