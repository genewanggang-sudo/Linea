<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as THREE from 'three'
import { X } from '@ccpc/math/algorithm/calc_x'
import { Coord2 } from '@ccpc/math/base/coord2'
import { DiscreteParam } from '@ccpc/math/base/discrete_param'
import { Tol } from '@ccpc/math/base/tol'
import { Vec2 } from '@ccpc/math/base/vec2'
import { Arc2 } from '@ccpc/math/geometry/arc2d'
import type { Curve2 } from '@ccpc/math/geometry/curve2'
import { Ln2 } from '@ccpc/math/geometry/ln2'
import { NurbsCurve2 } from '@ccpc/math/geometry/nurbs_curve2'
import { Polygon } from '@ccpc/math/topology/polygon'
import { CONST } from '@ccpc/math/type_define/const'

type ToolId = 'line' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'
type PrecisionId = 'low' | 'normal' | 'high'

type ToolDefinition = {
    id: ToolId
    label: string
    help: string
    minPoints: number
    maxPoints?: number
    color: string
}

type StoredShape = {
    id: number
    tool: ToolId
    color: string
    controls: Vec2[]
}

type PolygonPatternId = 'stripes' | 'dots' | 'grid' | 'cross'

type PolygonFillStyle = {
    pattern: PolygonPatternId
    baseColor: string
    accentColor: string
    backgroundColor: string
    outlineColor: string
    opacity: number
    spacing: number
    lineWidth: number
    rotation: number
}

type StoredPolygon = {
    id: number
    polygon: Polygon
    fill: PolygonFillStyle
}

type AppState = {
    activeTool?: ToolId
    isDrawing: boolean
    precision: PrecisionId
    showDiscretePoints: boolean
    showPolygonTriangles: boolean
    draftPoints: Vec2[]
    hoverPoint?: Vec2
    shapes: StoredShape[]
    polygons: StoredPolygon[]
    intersections: Vec2[]
    nextShapeId: number
    nextPolygonId: number
}

type PerfState = {
    lastRenderMs: number
    renderCount: number
    renderRate: number
    drawCalls: number
    lineCount: number
    pointCount: number
    triangleCount: number
    geometryCount: number
    textureCount: number
}

const world = { width: 2400, height: 1440, minX: -1200, minY: -720 }
const precisions: Record<PrecisionId, { label: string; param: DiscreteParam }> = {
    low: { label: '低', param: DiscreteParam.LOW },
    normal: { label: '中', param: DiscreteParam.NORMAL },
    high: { label: '高', param: DiscreteParam.HIGH },
}
const tools: ToolDefinition[] = [
    { id: 'line', label: '直线', help: '依次点击 2 个点，自动连续绘制。', minPoints: 2, maxPoints: 2, color: '#2563eb' },
    { id: 'circle', label: '圆', help: '依次点击圆心和半径点，自动连续绘制。', minPoints: 2, maxPoints: 2, color: '#0891b2' },
    { id: 'arc', label: '圆弧', help: '依次点击起点、中点、终点。', minPoints: 3, maxPoints: 3, color: '#ea580c' },
    { id: 'ellipse', label: '椭圆', help: '依次点击中心、长轴点、短轴参考点。', minPoints: 3, maxPoints: 3, color: '#7c3aed' },
    { id: 'ellipseArc', label: '椭圆弧', help: '依次点击中心、轴向点、短轴参考点、起点、终点。', minPoints: 5, maxPoints: 5, color: '#db2777' },
    { id: 'bspline', label: 'B样条', help: '连续点击控制点，按 Enter 完成，右键退出。', minPoints: 4, color: '#059669' },
]
const toolMap = new Map(tools.map(tool => [tool.id, tool]))

const state = reactive<AppState>({
    activeTool: undefined,
    isDrawing: false,
    precision: 'normal',
    showDiscretePoints: false,
    showPolygonTriangles: false,
    draftPoints: [],
    hoverPoint: undefined,
    shapes: [],
    polygons: [],
    intersections: [],
    nextShapeId: 1,
    nextPolygonId: 1,
})

const perf = reactive<PerfState>({
    lastRenderMs: 0,
    renderCount: 0,
    renderRate: 0,
    drawCalls: 0,
    lineCount: 0,
    pointCount: 0,
    triangleCount: 0,
    geometryCount: 0,
    textureCount: 0,
})

const viewportFrame = ref<HTMLDivElement>()
const panState = reactive({
    active: false,
    pointerId: -1,
    moved: false,
    lastClientX: 0,
    lastClientY: 0,
})

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor('#000000', 0)

const scene = new THREE.Scene()
const permanentGroup = new THREE.Group()
const previewGroup = new THREE.Group()
const discretePointGroup = new THREE.Group()
const intersectionGroup = new THREE.Group()
scene.add(permanentGroup, previewGroup, discretePointGroup, intersectionGroup)

const camera = new THREE.OrthographicCamera(-world.width / 2, world.width / 2, world.height / 2, -world.height / 2, 0.1, 1000)
camera.position.set(0, 0, 100)
camera.zoom = 1
camera.lookAt(0, 0, 0)
camera.updateProjectionMatrix()

const rayPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const raycaster = new THREE.Raycaster()
const scratchPoint = new THREE.Vector3()
let resizeObserver: ResizeObserver | undefined
let animationFrameId = 0
let lastFrameTimestamp = 0

const activeTool = computed(() => (state.activeTool ? toolMap.get(state.activeTool) : undefined))
const hintText = computed(() => {
    if (!activeTool.value || !state.isDrawing) {
        return {
            title: '空闲',
            body: '选择顶部绘制工具开始。滚轮缩放，中键平移，右键退出当前工具。',
            progress: '',
        }
    }

    return {
        title: activeTool.value.label,
        body: activeTool.value.help,
        progress: activeTool.value.maxPoints
            ? `进度 ${state.draftPoints.length} / ${activeTool.value.maxPoints}`
            : `已取 ${state.draftPoints.length} 个控制点`,
    }
})

function activeDiscreteParam(): DiscreteParam {
    return precisions[state.precision].param
}

function activeTol(): Tol {
    const tolerance = activeDiscreteParam().tolerance
    return new Tol(tolerance.lengthEps, tolerance.angleEps)
}

function toSceneY(y: number): number {
    return -y
}

function maybePoint(point?: Vec2): Vec2[] {
    return point ? [point] : []
}

function isSamePoint(a: Vec2, b: Vec2, eps = 1e-6): boolean {
    return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps
}

function resetDraft(): void {
    state.draftPoints = []
}

function clearIntersections(): void {
    state.intersections = []
}

function startTool(toolId: ToolId): void {
    state.activeTool = toolId
    state.isDrawing = true
    state.hoverPoint = undefined
    resetDraft()
    updateScene()
}

function stopDrawing(): void {
    state.activeTool = undefined
    state.isDrawing = false
    state.hoverPoint = undefined
    resetDraft()
    updateScene()
}

function getWorldPointFromClient(clientX: number, clientY: number): Vec2 | undefined {
    const element = viewportFrame.value
    if (!element) return undefined
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return undefined

    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
    const hit = raycaster.ray.intersectPlane(rayPlane, scratchPoint)
    if (!hit) return undefined
    return new Vec2(hit.x, -hit.y)
}

function ellipsePoint(center: Vec2, axisPoint: Vec2, minorRefPoint: Vec2, angle: number): Vec2 {
    const coord = new Coord2(center, new Vec2(center, axisPoint))
    const a = center.distanceTo(axisPoint)
    const b = Math.abs(coord.getLocalPtAt(minorRefPoint).y)
    return coord.getWorldPtAt({ x: a * Math.cos(angle), y: b * Math.sin(angle) })
}

function buildEllipse(center: Vec2, axisPoint: Vec2, minorRefPoint: Vec2): Arc2 | undefined {
    const axis = new Vec2(center, axisPoint)
    const a = axis.getLength()
    if (a <= 1e-6) return undefined

    const coord = new Coord2(center, axis)
    const localMinor = coord.getLocalPtAt(minorRefPoint)
    const b = Math.abs(localMinor.y)
    if (b <= 1e-6) return undefined

    return new Arc2(coord, a, b, true, [0, CONST.PI2])
}

function buildCurve(toolId: ToolId, points: Vec2[]): Curve2 | undefined {
    switch (toolId) {
        case 'line':
            return points.length >= 2 ? new Ln2(points[0], points[1]) : undefined
        case 'circle': {
            if (points.length < 2) return undefined
            const radius = points[0].distanceTo(points[1])
            if (radius <= 1e-6) return undefined
            return Arc2.makeArcByStartEndAngles(points[0], radius, 0, CONST.PI2, true)
        }
        case 'arc':
            return points.length >= 3 ? Arc2.makeArcByThreePoints(points[0], points[1], points[2]) : undefined
        case 'ellipse':
            return points.length >= 3 ? buildEllipse(points[0], points[1], points[2]) : undefined
        case 'ellipseArc':
            return points.length >= 5 ? Arc2.makeEllipseByFivePoints(points[0], points[1], points[2], points[3], points[4]) : undefined
        case 'bspline':
            return points.length >= 4 ? NurbsCurve2.makeByControlPoints(points, 3) : undefined
    }
}

function createStoredShape(toolId: ToolId, controls: Vec2[]): StoredShape | undefined {
    const curve = buildCurve(toolId, controls)
    if (!curve) return undefined
    return {
        id: state.nextShapeId++,
        tool: toolId,
        color: toolMap.get(toolId)!.color,
        controls: [...controls],
    }
}

function getShapeCurve(shape: StoredShape): Curve2 | undefined {
    return buildCurve(shape.tool, shape.controls)
}

function sampleCurve(curve: Curve2): Vec2[] {
    return curve.discrete(activeDiscreteParam())
}

function getPreviewControls(): Vec2[] {
    if (!state.isDrawing || !activeTool.value) return []
    const controls = [...state.draftPoints]
    if (!state.hoverPoint) return controls

    if (activeTool.value.id === 'bspline') {
        if (!controls.length || !isSamePoint(controls[controls.length - 1], state.hoverPoint)) {
            controls.push(state.hoverPoint)
        }
        return controls
    }

    if (activeTool.value.maxPoints !== undefined && controls.length < activeTool.value.maxPoints) {
        controls.push(state.hoverPoint)
    }
    return controls
}

function getPreviewCurve(): Curve2 | undefined {
    return state.isDrawing && activeTool.value ? buildCurve(activeTool.value.id, getPreviewControls()) : undefined
}

function canConfirmBspline(): boolean {
    return state.isDrawing && state.activeTool === 'bspline' && state.draftPoints.length >= 4 && !!buildCurve('bspline', state.draftPoints)
}

function disposeObject3D(object: THREE.Object3D): void {
    object.traverse(node => {
        const mesh = node as THREE.Mesh
        if ('geometry' in mesh && mesh.geometry) mesh.geometry.dispose()
        if ('material' in mesh && mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for (const material of materials) {
                if ('map' in material && material.map) material.map.dispose()
                material.dispose()
            }
        }
    })
}

function clearGroup(group: THREE.Group): void {
    while (group.children.length) {
        const child = group.children.pop()!
        group.remove(child)
        disposeObject3D(child)
    }
}

function createPolyline(points: Vec2[], color: string, dashed = false, z = 0): THREE.Line | undefined {
    if (points.length < 2) return undefined
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point.x, toSceneY(point.y), z)))
    const material = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 12, gapSize: 8, transparent: true, opacity: 0.9 })
        : new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geometry, material)
    if (dashed) line.computeLineDistances()
    return line
}

function createPointCloud(points: Vec2[], color: string, size = 8, z = 6): THREE.Points | undefined {
    if (!points.length) return undefined
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(point => [point.x, toSceneY(point.y), z]), 3))
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }))
}

function makeHslColor(hue: number, saturation: number, lightness: number): string {
    return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`
}

function createPolygonFillStyle(seed: number): PolygonFillStyle {
    const patternSequence: PolygonPatternId[] = ['stripes', 'dots', 'grid', 'cross']
    const hue = (seed * 67) % 360
    const accentHue = (hue + 140 + seed * 11) % 360
    return {
        pattern: patternSequence[(seed - 1) % patternSequence.length],
        baseColor: makeHslColor(hue, 72, 58),
        accentColor: makeHslColor(accentHue, 78, 30),
        backgroundColor: makeHslColor((hue + 24) % 360, 80, 95),
        outlineColor: makeHslColor((accentHue + 18) % 360, 80, 24),
        opacity: 0.9,
        spacing: 14 + (seed % 5) * 5,
        lineWidth: 2 + (seed % 3),
        rotation: ((seed * 23) % 180) * Math.PI / 180,
    }
}

function createPatternTexture(fill: PolygonFillStyle): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 192
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas is not available')

    ctx.fillStyle = fill.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(fill.rotation)
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
    ctx.fillStyle = fill.baseColor
    ctx.strokeStyle = fill.accentColor
    ctx.lineWidth = fill.lineWidth

    if (fill.pattern === 'stripes') {
        for (let x = -canvas.width; x <= canvas.width * 2; x += fill.spacing) {
            ctx.beginPath()
            ctx.moveTo(x, -canvas.height)
            ctx.lineTo(x, canvas.height * 2)
            ctx.stroke()
        }
    } else if (fill.pattern === 'dots') {
        const radius = Math.max(fill.lineWidth * 1.2, 3)
        for (let y = fill.spacing * -0.5; y <= canvas.height + fill.spacing; y += fill.spacing) {
            for (let x = fill.spacing * -0.5; x <= canvas.width + fill.spacing; x += fill.spacing) {
                ctx.beginPath()
                ctx.arc(x, y, radius, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    } else if (fill.pattern === 'grid') {
        for (let x = 0; x <= canvas.width; x += fill.spacing) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height)
            ctx.stroke()
        }
        for (let y = 0; y <= canvas.height; y += fill.spacing) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(canvas.width, y)
            ctx.stroke()
        }
    } else {
        for (let x = -canvas.width; x <= canvas.width * 2; x += fill.spacing) {
            ctx.beginPath()
            ctx.moveTo(x, -canvas.height)
            ctx.lineTo(x, canvas.height * 2)
            ctx.stroke()
        }
        ctx.strokeStyle = fill.baseColor
        for (let x = -canvas.width; x <= canvas.width * 2; x += fill.spacing) {
            ctx.beginPath()
            ctx.moveTo(x, canvas.height * 2)
            ctx.lineTo(x, -canvas.height)
            ctx.stroke()
        }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2.2, 2.2)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

function createTriangleWireframe(geometry: THREE.ShapeGeometry): THREE.LineSegments | undefined {
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return undefined

    const segments: number[] = []
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i)
        const b = index.getX(i + 1)
        const c = index.getX(i + 2)
        const triangle = [a, b, b, c, c, a]
        for (let j = 0; j < triangle.length; j += 2) {
            const from = triangle[j]
            const to = triangle[j + 1]
            segments.push(
                position.getX(from), position.getY(from), 3.5,
                position.getX(to), position.getY(to), 3.5,
            )
        }
    }

    const wireGeometry = new THREE.BufferGeometry()
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3))
    const material = new THREE.LineBasicMaterial({
        color: '#0f172a',
        transparent: true,
        opacity: 0.96,
    })
    return new THREE.LineSegments(wireGeometry, material)
}

function createPolygonObject(item: StoredPolygon): THREE.Group | undefined {
    const loops = item.polygon.getLoops()
    if (!loops.length) return undefined

    const [outerLoop, ...holeLoops] = loops
    const outerPath = outerLoop.toPath(activeDiscreteParam())
    if (outerPath.length < 3) return undefined

    const shape = new THREE.Shape()
    shape.moveTo(outerPath[0].x, toSceneY(outerPath[0].y))
    for (let i = 1; i < outerPath.length; i++) {
        shape.lineTo(outerPath[i].x, toSceneY(outerPath[i].y))
    }
    shape.closePath()

    for (const holeLoop of holeLoops) {
        const holePath = holeLoop.toPath(activeDiscreteParam())
        if (holePath.length < 3) continue
        const hole = new THREE.Path()
        hole.moveTo(holePath[0].x, toSceneY(holePath[0].y))
        for (let i = 1; i < holePath.length; i++) {
            hole.lineTo(holePath[i].x, toSceneY(holePath[i].y))
        }
        hole.closePath()
        shape.holes.push(hole)
    }

    const group = new THREE.Group()
    const geometry = new THREE.ShapeGeometry(shape)
    if (!state.showPolygonTriangles) {
        const texture = createPatternTexture(item.fill)
        const material = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            map: texture,
            transparent: true,
            opacity: item.fill.opacity,
            side: THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.z = -1
        group.add(mesh)
    } else {
        const triangles = createTriangleWireframe(geometry)
        if (triangles) group.add(triangles)
    }

    for (const loop of loops) {
        const outlineColor = state.showPolygonTriangles ? '#0f766e' : item.fill.outlineColor
        const outline = createPolyline(loop.toPath(activeDiscreteParam()), outlineColor, false, 2)
        if (outline) group.add(outline)
    }

    return group
}

function createGrid(): THREE.Group {
    const group = new THREE.Group()
    const gridMaterial = new THREE.LineBasicMaterial({ color: '#98a7ba', transparent: true, opacity: 0.14 })
    const axisMaterial = new THREE.LineBasicMaterial({ color: '#243247', transparent: true, opacity: 0.28 })

    const makeSegment = (x1: number, y1: number, x2: number, y2: number, material: THREE.LineBasicMaterial) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x1, toSceneY(y1), -4),
            new THREE.Vector3(x2, toSceneY(y2), -4),
        ])
        return new THREE.Line(geometry, material)
    }

    for (let x = world.minX; x <= world.minX + world.width; x += 60) group.add(makeSegment(x, world.minY, x, world.minY + world.height, gridMaterial))
    for (let y = world.minY; y <= world.minY + world.height; y += 60) group.add(makeSegment(world.minX, y, world.minX + world.width, y, gridMaterial))
    group.add(makeSegment(world.minX, 0, world.minX + world.width, 0, axisMaterial))
    group.add(makeSegment(0, world.minY, 0, world.minY + world.height, axisMaterial))
    return group
}

scene.add(createGrid())

function syncPermanentShapes(): void {
    clearGroup(permanentGroup)
    clearGroup(discretePointGroup)
    for (const polygon of state.polygons) {
        const polygonObject = createPolygonObject(polygon)
        if (polygonObject) permanentGroup.add(polygonObject)
    }
    for (const shape of state.shapes) {
        const curve = getShapeCurve(shape)
        if (!curve) continue
        const sampled = sampleCurve(curve)
        const line = createPolyline(sampled, shape.color)
        if (line) permanentGroup.add(line)
        if (state.showDiscretePoints) {
            const points = createPointCloud(sampled, shape.color, 7, 3)
            if (points) discretePointGroup.add(points)
        }
    }
}

function syncPreview(): void {
    clearGroup(previewGroup)
    if (!activeTool.value || !state.isDrawing) return

    const previewControls = getPreviewControls()
    const previewCurve = getPreviewCurve()
    const controlLine = createPolyline(previewControls, '#f59e0b', true, 1)
    if (controlLine) previewGroup.add(controlLine)

    const controlPoints = createPointCloud(previewControls, '#f59e0b', 8, 5)
    if (controlPoints) previewGroup.add(controlPoints)

    if (previewCurve) {
        const sampled = sampleCurve(previewCurve)
        const line = createPolyline(sampled, activeTool.value.color, false, 2)
        if (line) previewGroup.add(line)
        if (state.showDiscretePoints) {
            const discretePoints = createPointCloud(sampled, activeTool.value.color, 7, 4)
            if (discretePoints) previewGroup.add(discretePoints)
        }
    }

    const hoverPoint = createPointCloud(maybePoint(state.hoverPoint), '#ef4444', 8, 7)
    if (hoverPoint) previewGroup.add(hoverPoint)
}

function syncIntersections(): void {
    clearGroup(intersectionGroup)
    const points = createPointCloud(state.intersections, '#dc2626', 10, 8)
    if (points) intersectionGroup.add(points)
}

function renderScene(): void {
    const start = performance.now()
    renderer.render(scene, camera)
    const now = performance.now()
    const info = renderer.info

    perf.lastRenderMs = Number((now - start).toFixed(2))
    perf.renderCount += 1
    if (lastFrameTimestamp > 0) {
        const frameDelta = Math.max(now - lastFrameTimestamp, 1)
        const instantFps = 1000 / frameDelta
        perf.renderRate = perf.renderRate === 0
            ? Number(instantFps.toFixed(1))
            : Number((perf.renderRate * 0.82 + instantFps * 0.18).toFixed(1))
    }
    lastFrameTimestamp = now
    perf.drawCalls = info.render.calls
    perf.lineCount = info.render.lines
    perf.pointCount = info.render.points
    perf.triangleCount = info.render.triangles
    perf.geometryCount = info.memory.geometries
    perf.textureCount = info.memory.textures
}

function startRenderLoop(): void {
    const tick = () => {
        renderScene()
        animationFrameId = window.requestAnimationFrame(tick)
    }

    if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(tick)
    }
}

function stopRenderLoop(): void {
    if (!animationFrameId) return
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
    lastFrameTimestamp = 0
}

function updateScene(): void {
    syncPermanentShapes()
    syncPreview()
    syncIntersections()
    renderScene()
}

function zoomAt(clientX: number, clientY: number, scaleFactor: number): void {
    const before = getWorldPointFromClient(clientX, clientY)
    const nextZoom = Math.max(camera.zoom * scaleFactor, 1e-6)

    camera.zoom = nextZoom
    camera.updateProjectionMatrix()
    const after = getWorldPointFromClient(clientX, clientY)
    if (before && after) {
        camera.position.x += before.x - after.x
        camera.position.y += -before.y + after.y
        camera.updateMatrixWorld()
    }
    renderScene()
}

function panByScreenDelta(deltaX: number, deltaY: number): void {
    const element = viewportFrame.value
    if (!element) return
    const width = Math.max(element.clientWidth, 1)
    const height = Math.max(element.clientHeight, 1)
    const worldPerPixelX = (camera.right - camera.left) / (camera.zoom * width)
    const worldPerPixelY = (camera.top - camera.bottom) / (camera.zoom * height)
    camera.position.x -= deltaX * worldPerPixelX
    camera.position.y += deltaY * worldPerPixelY
    camera.updateMatrixWorld()
    renderScene()
}

function commitCurrentShape(): boolean {
    if (!state.activeTool) return false
    const shape = createStoredShape(state.activeTool, state.draftPoints)
    if (!shape) return false
    clearIntersections()
    state.shapes.push(shape)
    resetDraft()
    updateScene()
    return true
}

function computeIntersections(): void {
    const curves = state.shapes.map(shape => getShapeCurve(shape)).filter((curve): curve is Curve2 => !!curve)
    const tolerance = new Tol(1e-3, Tol.ANGLE)
    const dedupeEps = 1e-2
    const rawPoints: Vec2[] = []

    for (let i = 0; i < curves.length; i++) {
        for (let j = i + 1; j < curves.length; j++) {
            const results = X.curve2ds(curves[i], curves[j], tolerance)
            for (const result of results) {
                if (result.isOverlap && result.overlap1) {
                    rawPoints.push(curves[i].getPtAt(result.overlap1.min))
                    rawPoints.push(curves[i].getPtAt(result.overlap1.max))
                } else {
                    rawPoints.push(result.point)
                }
            }
        }
    }

    state.intersections = rawPoints.filter((point, index) => !rawPoints.slice(0, index).some(item => item.distanceTo(point) <= dedupeEps))
    updateScene()
}

function serializeVec2(point: Vec2): { x: number; y: number } {
    return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }
}

function exportDebugData(): void {
    const payload = {
        exportedAt: new Date().toISOString(),
        polygons: state.polygons.map(item => ({
            id: item.id,
            loops: item.polygon.getLoops().map(loop => loop.toPath(activeDiscreteParam()).map(serializeVec2)),
            fill: item.fill,
        })),
        curves: state.shapes.map(shape => {
            const curve = getShapeCurve(shape)
            const sampled = curve ? sampleCurve(curve) : []
            return {
                id: shape.id,
                tool: shape.tool,
                points: shape.controls.map(serializeVec2),
                discretePoints: sampled.map(serializeVec2),
            }
        }),
        intersections: state.intersections.map(serializeVec2),
    }
    const text = JSON.stringify(payload, null, 2)
    void navigator.clipboard.writeText(text)
}

function randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

function randomPoint(marginX = 260, marginY = 180): Vec2 {
    return new Vec2(
        randomInRange(world.minX + marginX, world.minX + world.width - marginX),
        randomInRange(world.minY + marginY, world.minY + world.height - marginY),
    )
}

function randomAngle(): number {
    return randomInRange(0, CONST.PI2)
}

function createRandomShape(): StoredShape | undefined {
    const candidates: ToolId[] = ['line', 'circle', 'arc', 'ellipse', 'ellipseArc', 'bspline']
    const toolId = candidates[Math.floor(Math.random() * candidates.length)]
    let controls: Vec2[] = []

    if (toolId === 'line') {
        controls = [randomPoint(120, 120), randomPoint(120, 120)]
    } else if (toolId === 'circle') {
        const center = randomPoint(220, 180)
        const angle = randomAngle()
        const radius = randomInRange(40, 120)
        controls = [center, center.added(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius))]
    } else if (toolId === 'arc') {
        const center = randomPoint(220, 180)
        const radius = randomInRange(50, 130)
        const start = randomAngle()
        const end = start + randomInRange(0.8, 4.5)
        const mid = (start + end) * 0.5
        controls = [
            center.added(new Vec2(Math.cos(start) * radius, Math.sin(start) * radius)),
            center.added(new Vec2(Math.cos(mid) * radius, Math.sin(mid) * radius)),
            center.added(new Vec2(Math.cos(end) * radius, Math.sin(end) * radius)),
        ]
    } else if (toolId === 'ellipse') {
        const center = randomPoint(260, 220)
        const angle = randomAngle()
        const a = randomInRange(80, 160)
        const b = randomInRange(40, 110)
        const major = new Vec2(Math.cos(angle) * a, Math.sin(angle) * a)
        const minor = new Vec2(-Math.sin(angle) * b, Math.cos(angle) * b)
        controls = [center, center.added(major), center.added(minor)]
    } else if (toolId === 'ellipseArc') {
        const center = randomPoint(260, 220)
        const angle = randomAngle()
        const a = randomInRange(80, 160)
        const b = randomInRange(40, 110)
        const major = new Vec2(Math.cos(angle) * a, Math.sin(angle) * a)
        const minor = new Vec2(-Math.sin(angle) * b, Math.cos(angle) * b)
        const axisPoint = center.added(major)
        const minorPoint = center.added(minor)
        const startAngle = randomInRange(0, CONST.PI2 * 0.65)
        const endAngle = startAngle + randomInRange(0.6, CONST.PI * 1.4)
        controls = [
            center,
            axisPoint,
            minorPoint,
            ellipsePoint(center, axisPoint, minorPoint, startAngle),
            ellipsePoint(center, axisPoint, minorPoint, endAngle),
        ]
    } else {
        const count = Math.floor(randomInRange(4, 8))
        for (let i = 0; i < count; i++) controls.push(randomPoint(120, 120))
    }

    return createStoredShape(toolId, controls)
}

function createRandomBatch(): void {
    clearIntersections()
    resetDraft()
    state.shapes = []
    state.polygons = []
    for (let i = 0; i < 50; i++) {
        const shape = createRandomShape()
        if (shape) state.shapes.push(shape)
    }
    updateScene()
}

function createRandomPolygon(): StoredPolygon | undefined {
    for (let attempt = 0; attempt < 12; attempt++) {
        const center = randomPoint(360, 280)
        const vertexCount = Math.floor(randomInRange(5, 10))
        const startAngle = randomAngle()
        const baseRadius = randomInRange(90, 190)
        const points: Vec2[] = []

        for (let i = 0; i < vertexCount; i++) {
            const angle = startAngle + (CONST.PI2 * i) / vertexCount + randomInRange(-0.22, 0.22)
            const radius = baseRadius * randomInRange(0.58, 1.08)
            points.push(center.added(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius)))
        }

        const polygon = new Polygon(points)
        if (!polygon.isValid(activeTol()) || Math.abs(polygon.calcArea()) < 1e4) continue

        return {
            id: state.nextPolygonId,
            polygon,
            fill: createPolygonFillStyle(state.nextPolygonId++),
        }
    }

    return undefined
}

function addRandomPolygon(): void {
    clearIntersections()
    resetDraft()
    const polygon = createRandomPolygon()
    if (!polygon) return
    state.polygons.push(polygon)
    updateScene()
}

function clearScene(): void {
    state.shapes = []
    state.polygons = []
    clearIntersections()
    resetDraft()
    state.hoverPoint = undefined
    updateScene()
}

function handlePointerMove(evt: PointerEvent): void {
    if (panState.active && evt.pointerId === panState.pointerId) {
        const deltaX = evt.clientX - panState.lastClientX
        const deltaY = evt.clientY - panState.lastClientY
        if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) panState.moved = true
        panByScreenDelta(deltaX, deltaY)
        panState.lastClientX = evt.clientX
        panState.lastClientY = evt.clientY
        return
    }

    state.hoverPoint = state.isDrawing ? getWorldPointFromClient(evt.clientX, evt.clientY) : undefined
    syncPreview()
    renderScene()
}

function handlePointerLeave(): void {
    state.hoverPoint = undefined
    syncPreview()
    renderScene()
}

function handleViewportClick(evt: MouseEvent): void {
    if (!state.isDrawing || !activeTool.value) return
    const point = getWorldPointFromClient(evt.clientX, evt.clientY)
    if (!point) return
    if (activeTool.value.maxPoints !== undefined && state.draftPoints.length >= activeTool.value.maxPoints) return

    state.draftPoints.push(point)
    clearIntersections()
    if (activeTool.value.maxPoints !== undefined && state.draftPoints.length === activeTool.value.maxPoints) {
        commitCurrentShape()
        return
    }
    updateScene()
}

function handleContextMenu(evt: MouseEvent): void {
    evt.preventDefault()
    if (panState.active || panState.moved || !state.isDrawing) return
    if (state.activeTool === 'bspline' && canConfirmBspline()) commitCurrentShape()
    stopDrawing()
}

function handlePointerDown(evt: PointerEvent): void {
    if (evt.button !== 2 || !viewportFrame.value) return
    panState.active = true
    panState.pointerId = evt.pointerId
    panState.moved = false
    panState.lastClientX = evt.clientX
    panState.lastClientY = evt.clientY
    viewportFrame.value.setPointerCapture(evt.pointerId)
}

function releasePan(evt: PointerEvent): void {
    if (!panState.active || evt.pointerId !== panState.pointerId || !viewportFrame.value) return
    panState.active = false
    panState.pointerId = -1
    viewportFrame.value.releasePointerCapture(evt.pointerId)
    window.setTimeout(() => {
        panState.moved = false
    }, 0)
}

function handleWheel(evt: WheelEvent): void {
    evt.preventDefault()
    zoomAt(evt.clientX, evt.clientY, evt.deltaY > 0 ? 0.9 : 1.1)
}

function handleKeydown(evt: KeyboardEvent): void {
    if (evt.key === 'Enter' && canConfirmBspline()) commitCurrentShape()
    if ((evt.key === 'Backspace' || evt.key === 'Delete') && state.isDrawing && state.draftPoints.length) {
        evt.preventDefault()
        state.draftPoints.pop()
        updateScene()
    }
    if (evt.key === 'Escape') {
        resetDraft()
        updateScene()
    }
}

function resize(): void {
    const element = viewportFrame.value
    if (!element) return
    const width = Math.max(element.clientWidth, 1)
    const height = Math.max(element.clientHeight, 1)
    const aspect = width / height
    const visibleWidth = world.width
    const visibleHeight = visibleWidth / aspect
    camera.left = -visibleWidth / 2
    camera.right = visibleWidth / 2
    camera.top = visibleHeight / 2
    camera.bottom = -visibleHeight / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    renderScene()
}

onMounted(() => {
    if (!viewportFrame.value) return
    viewportFrame.value.appendChild(renderer.domElement)
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(viewportFrame.value)
    window.addEventListener('keydown', handleKeydown)
    resize()
    updateScene()
    startRenderLoop()
})

onBeforeUnmount(() => {
    stopRenderLoop()
    resizeObserver?.disconnect()
    window.removeEventListener('keydown', handleKeydown)
    renderer.dispose()
})
</script>

<template>
    <div class="math-visual-app">
        <header class="toolbar">
            <el-button-group class="tool-group">
                <el-button
                    v-for="tool in tools"
                    :key="tool.id"
                    size="large"
                    :type="state.isDrawing && state.activeTool === tool.id ? 'primary' : 'default'"
                    @click="startTool(tool.id)"
                >
                    {{ tool.label }}
                </el-button>
            </el-button-group>
        </header>

        <section class="workspace">
            <div
                ref="viewportFrame"
                class="viewport-frame"
                @pointermove="handlePointerMove"
                @pointerleave="handlePointerLeave"
                @click="handleViewportClick"
                @contextmenu="handleContextMenu"
                @pointerdown="handlePointerDown"
                @pointerup="releasePan"
                @pointercancel="releasePan"
                @wheel="handleWheel"
            />

            <div class="perf-panel">
                <div class="perf-title">渲染性能</div>
                <div class="perf-grid">
                    <div class="perf-item">
                        <span class="perf-label">耗时</span>
                        <strong class="perf-value">{{ perf.lastRenderMs }} ms</strong>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">频率</span>
                        <strong class="perf-value">{{ perf.renderRate }} fps</strong>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">Draw Calls</span>
                        <strong class="perf-value">{{ perf.drawCalls }}</strong>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">Lines</span>
                        <strong class="perf-value">{{ perf.lineCount }}</strong>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">Geometries</span>
                        <strong class="perf-value">{{ perf.geometryCount }}</strong>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">Textures</span>
                        <strong class="perf-value">{{ perf.textureCount }}</strong>
                    </div>
                </div>
                <el-button class="perf-export-button" size="small" :disabled="!state.shapes.length" @click="exportDebugData">
                    导出曲线和求交数据
                </el-button>
            </div>

            <div class="hint-bar">
                <span class="hint-title">{{ hintText.title }}</span>
                <span class="hint-body">{{ hintText.body }}</span>
                <span v-if="hintText.progress" class="hint-progress">{{ hintText.progress }}</span>
            </div>

            <aside class="side-panel">
                <el-card shadow="never" class="panel-card">
                    <template #header>操作面板</template>
                    <el-space direction="vertical" :size="12" fill>
                        <div class="status-title">{{ activeTool && state.isDrawing ? `正在绘制 ${activeTool.label}` : '当前空闲' }}</div>
                        <el-text class="status-desc">
                            {{ activeTool && state.isDrawing ? 'Esc 清空当前预览，右键退出工具。' : '点击顶部绘制按钮后进入对应工具。' }}
                        </el-text>

                        <div class="section-title">离散精度</div>
                        <el-button-group class="precision-group">
                            <el-button
                                v-for="(item, key) in precisions"
                                :key="key"
                                :type="state.precision === key ? 'primary' : 'default'"
                                @click="state.precision = key as PrecisionId; updateScene()"
                            >
                                {{ item.label }}
                            </el-button>
                        </el-button-group>

                        <div class="switch-row switch-row--soft">
                            <el-text>显示离散点</el-text>
                            <el-switch v-model="state.showDiscretePoints" @change="updateScene" />
                        </div>

                        <div class="section-title">场景操作</div>
                        <div class="switch-row switch-row--accent">
                            <el-text>显示面三角网</el-text>
                            <el-button class="tri-toggle-button" :type="state.showPolygonTriangles ? 'warning' : 'default'" @click="state.showPolygonTriangles = !state.showPolygonTriangles; updateScene()">
                                {{ state.showPolygonTriangles ? '隐藏三角网' : '显示所有面三角网' }}
                            </el-button>
                        </div>

                        <el-space direction="vertical" :size="10" fill class="action-grid">
                            <el-button type="success" @click="addRandomPolygon">随机 Polygon</el-button>
                            <el-button :disabled="!state.isDrawing || !state.draftPoints.length" @click="state.draftPoints.pop(); updateScene()">撤销点位</el-button>
                            <el-button type="primary" :disabled="!canConfirmBspline()" @click="commitCurrentShape()">完成 B样条</el-button>
                            <el-button @click="createRandomBatch">随机 50 条</el-button>
                            <el-button @click="computeIntersections">求交显示</el-button>
                            <el-button :disabled="!state.intersections.length" @click="clearIntersections(); updateScene()">清空交点</el-button>
                            <el-button type="danger" plain :disabled="!state.shapes.length && !state.polygons.length" @click="clearScene">清空场景</el-button>
                        </el-space>
                    </el-space>
                </el-card>
            </aside>
        </section>
    </div>
</template>
