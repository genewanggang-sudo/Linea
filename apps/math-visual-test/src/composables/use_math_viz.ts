import {
    Arc2,
    BSpline2,
    Circle2,
    DiscretizeOptions,
    Ellipse2,
    EllipseArc2,
    Line2,
    Vec2,
    type Curve2,
} from '@linea/math'
import { useEventListener } from '@vueuse/core'
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import * as THREE from 'three'
import { createPerformanceMonitor, type PerfSnapshot } from '../adapters/performance_monitor'
import {
    buildBoundingBox,
    buildDirectionArrows,
    buildDiscreteLine,
    discretizePolylinePoints,
} from '../adapters/math_to_three'
import { createViewport, type ViewportContext } from '../app/bootstrap'

export type DrawTool = 'select' | 'line' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'
export type Preset = 'low' | 'medium' | 'high' | 'ultra'

type DrawEntity = {
    id: number
    type: DrawTool
    curve: Curve2
    group: THREE.Group | null
    discretePolyline: Vec2[]
    discretePointCount: number
}

type EllipseParams = {
    center: Vec2
    rx: number
    ry: number
    rotation: number
}

type PerfViewState = PerfSnapshot & { fpsClass: 'good' | 'warn' | 'bad'; sampledPoints: number }

const DRAW_TOOLS: DrawTool[] = ['select', 'line', 'circle', 'arc', 'ellipse', 'ellipseArc', 'bspline']

export function useMathViz(canvasHost: Ref<HTMLDivElement | null>) {
    const activeTool = ref<DrawTool>('select')
    const entityCount = ref(0)
    const statusHint = ref('')
    const completionMessage = ref('')

    const showDiscrete = ref(true)
    const showDiscretePoints = ref(false)
    const showBoundingBox = ref(false)
    const showDirection = ref(false)
    const preset = ref<Preset>('medium')
    const isGenerating = ref(false)
    const isRefining = ref(false)

    const perfState = ref<PerfViewState>({
        fps: 0,
        frameMs: 0,
        drawCalls: 0,
        triangles: 0,
        lines: 0,
        points: 0,
        geometries: 0,
        textures: 0,
        fpsClass: 'good',
        sampledPoints: 0,
    })

    let viewport: ViewportContext | null = null
    let perfMonitor: ReturnType<typeof createPerformanceMonitor> | null = null
    let nextEntityId = 1
    let entities: DrawEntity[] = []
    let draftPoints: Vec2[] = []
    let hoverPoint: Vec2 | null = null
    let lastCompleted: { tool: DrawTool; id: number; at: number } | null = null
    let lastPerfUiTime = performance.now()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const entityRoot = new THREE.Group()
    const batchedRoot = new THREE.Group()
    const draftRoot = new THREE.Group()
    let batchedLineObject: THREE.LineSegments | null = null
    let batchedPointObject: THREE.Points | null = null
    let discreteCacheDirty = true
    let linePositionCache: number[] = []
    let pointPositionCache: number[] = []

    let eventDisposers: Array<() => void> = []

    function toolLabel(tool: DrawTool): string {
        const map: Record<DrawTool, string> = {
            select: '选择',
            line: '线段',
            circle: '圆',
            arc: '圆弧',
            ellipse: '椭圆',
            ellipseArc: '椭圆弧',
            bspline: 'B样条',
        }
        return map[tool]
    }
    function getRequiredPoints(tool: DrawTool): number {
        if (tool === 'line') return 2
        if (tool === 'circle') return 2
        if (tool === 'arc') return 3
        if (tool === 'ellipse') return 3
        if (tool === 'ellipseArc') return 5
        return 0
    }

    function resolveDiscretizeOptions(): DiscretizeOptions {
        if (preset.value === 'low') return DiscretizeOptions.low.clone()
        if (preset.value === 'medium') return DiscretizeOptions.medium.clone()
        if (preset.value === 'high') return DiscretizeOptions.high.clone()
        return DiscretizeOptions.ultra.clone()
    }

    function toPlainVec2(v: Vec2): { x: number; y: number } {
        return { x: v.x, y: v.y }
    }

    function toPlainPoints(points: Vec2[]): { x: number; y: number }[] {
        return points.map(toPlainVec2)
    }

    function buildErrorPayload(tool: DrawTool, curve: Curve2 | null, draft: Vec2[] = []): string {
        const options = resolveDiscretizeOptions()
        const payload: Record<string, unknown> = {
            tool,
            draftPoints: toPlainPoints(draft),
            draftPointDumps: draft.map((p) => p.dump()),
            discretizeOptions: {
                preset: preset.value,
                chordTol: options.chordTol,
                angleTolRad: options.angleTolRad,
                minSegmentLength: options.minSegmentLength,
            },
        }

        if (curve) {
            const range = curve.getRange()
            payload.curveType = curve.getType()
            payload.range = { start: range.start, end: range.end }
            payload.curveDump = curve.dump()
            payload.replayHint = 'const curve = geomMgr.load(payload.curveDump) as Curve2'
            if (curve.isBSpline()) {
                const bs = curve as BSpline2
                payload.bspline = {
                    degree: bs.degree,
                    controlPoints: bs.controlPoints.map(toPlainVec2),
                    expandedKnots: bs.expandedKnots,
                    weights: bs.weights,
                }
            }
        }

        payload.replayTemplate = [
            "import { geomMgr, DiscretizeOptions, type Curve2 } from '@linea/math'",
            'const payload = /* 粘贴导出的错误 JSON */',
            'const curve = geomMgr.load(payload.curveDump) as Curve2',
            'const opt = new DiscretizeOptions(',
            '  payload.discretizeOptions.chordTol,',
            '  payload.discretizeOptions.angleTolRad,',
            '  payload.discretizeOptions.minSegmentLength,',
            ')',
            'const points = curve.discretize(opt)',
            'console.log(points.length)',
        ]

        return JSON.stringify(payload, null, 2)
    }

    function reportDiscretizeError(error: unknown, tool: DrawTool, curve: Curve2 | null, draft: Vec2[] = []): void {
        const message = error instanceof Error ? error.message : String(error)
        const payload = buildErrorPayload(tool, curve, draft)
        console.error('[math-viz] curve render/discretize failed:', message, payload)
    }

    function disposeObjectTree(object: THREE.Object3D): void {
        object.traverse((entry) => {
            const mesh = entry as THREE.Mesh
            if (mesh.geometry) {
                mesh.geometry.dispose()
            }
            const material = mesh.material
            if (Array.isArray(material)) {
                for (const mat of material) mat.dispose()
            } else if (material) {
                material.dispose()
            }
        })
    }

    function createEntityGroup(curve: Curve2): THREE.Group {
        const group = new THREE.Group()
        if (showBoundingBox.value) {
            group.add(buildBoundingBox(curve))
        }
        if (showDirection.value) {
            group.add(buildDirectionArrows(curve, 4))
        }
        return group
    }

    function markDiscreteCacheDirty(): void {
        discreteCacheDirty = true
    }

    function rebuildDiscretePositionCacheIfNeeded(): void {
        if (!discreteCacheDirty) return
        linePositionCache = []
        pointPositionCache = []
        for (const entity of entities) {
            const polyline = entity.discretePolyline
            if (polyline.length === 0) continue
            for (let i = 0; i < polyline.length; i++) {
                const p = polyline[i]
                pointPositionCache.push(p.x, p.y, 0)
                if (i === 0) continue
                const prev = polyline[i - 1]
                linePositionCache.push(prev.x, prev.y, 0, p.x, p.y, 0)
            }
        }
        discreteCacheDirty = false
    }

    function clearBatchedRenderObjects(): void {
        if (batchedLineObject) {
            batchedRoot.remove(batchedLineObject)
            disposeObjectTree(batchedLineObject)
            batchedLineObject = null
        }
        if (batchedPointObject) {
            batchedRoot.remove(batchedPointObject)
            disposeObjectTree(batchedPointObject)
            batchedPointObject = null
        }
    }

    function rebuildBatchedLayers(): void {
        if (!viewport) return
        clearBatchedRenderObjects()
        if (!showDiscrete.value && !showDiscretePoints.value) return

        rebuildDiscretePositionCacheIfNeeded()

        if (showDiscrete.value && linePositionCache.length >= 6) {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositionCache, 3))
            const material = new THREE.LineBasicMaterial({ color: 0xea580c })
            batchedLineObject = new THREE.LineSegments(geometry, material)
            batchedRoot.add(batchedLineObject)
        }

        if (showDiscretePoints.value && pointPositionCache.length >= 3) {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositionCache, 3))
            const material = new THREE.PointsMaterial({
                color: 0x0f766e,
                size: 5,
                sizeAttenuation: false,
            })
            batchedPointObject = new THREE.Points(geometry, material)
            batchedRoot.add(batchedPointObject)
        }
    }

    function rebuildOverlayLayers(): void {
        if (!viewport) return
        for (const entity of entities) {
            if (entity.group) {
                entityRoot.remove(entity.group)
                disposeObjectTree(entity.group)
                entity.group = null
            }
            if (!showBoundingBox.value && !showDirection.value) continue
            try {
                const group = createEntityGroup(entity.curve)
                entity.group = group
                entityRoot.add(group)
            } catch (error) {
                reportDiscretizeError(error, entity.type, entity.curve)
            }
        }
    }

    function rebuildEntities(): void {
        rebuildBatchedLayers()
        rebuildOverlayLayers()
    }

    function createEntity(type: DrawTool, curve: Curve2): DrawEntity {
        let discretePolyline: Vec2[] = []
        try {
            discretePolyline = discretizePolylinePoints(curve, resolveDiscretizeOptions())
        } catch (error) {
            reportDiscretizeError(error, type, curve)
        }
        const entity: DrawEntity = {
            id: nextEntityId++,
            type,
            curve,
            group: null,
            discretePolyline,
            discretePointCount: discretePolyline.length,
        }
        entities.push(entity)
        markDiscreteCacheDirty()
        entityCount.value = entities.length
        lastCompleted = { tool: type, id: entity.id, at: performance.now() }
        return entity
    }

    function attachEntityGroup(entity: DrawEntity): void {
        if (!viewport) return
        if (entity.group) {
            entityRoot.remove(entity.group)
            disposeObjectTree(entity.group)
            entity.group = null
        }
        if (!showBoundingBox.value && !showDirection.value) return
        const group = createEntityGroup(entity.curve)
        entity.group = group
        entityRoot.add(group)
    }

    function addCurveEntity(type: DrawTool, curve: Curve2, deferVisual = false): void {
        const entity = createEntity(type, curve)
        if (deferVisual) return
        try {
            attachEntityGroup(entity)
            rebuildBatchedLayers()
        } catch (error) {
            reportDiscretizeError(error, type, curve)
        }
    }

    function randomIn(min: number, max: number): number {
        return min + Math.random() * (max - min)
    }

    function randomBool(): boolean {
        return Math.random() >= 0.5
    }

    function randomPoint(span = 80): Vec2 {
        const half = span * 0.5
        return new Vec2(randomIn(-half, half), randomIn(-half, half))
    }

    function randomCurveSpec(): { type: Exclude<DrawTool, 'select'>; curve: Curve2 } {
        const types: Array<Exclude<DrawTool, 'select'>> = ['line', 'circle', 'arc', 'ellipse', 'ellipseArc', 'bspline']
        const type = types[Math.floor(Math.random() * types.length)]

        if (type === 'line') {
            const p0 = randomPoint()
            const p1 = randomPoint()
            return { type, curve: new Line2(p0, p1) }
        }

        if (type === 'circle') {
            const center = randomPoint()
            const radius = randomIn(0.2, 18)
            return { type, curve: new Circle2(center, radius) }
        }

        if (type === 'arc') {
            const center = randomPoint()
            const radius = randomIn(0.2, 18)
            const startAngle = randomIn(-Math.PI, Math.PI)
            const sweep = randomIn(0.15, Math.PI * 1.95)
            const clockwise = randomBool()
            const endAngle = startAngle + (clockwise ? -sweep : sweep)
            return { type, curve: new Arc2(center, radius, startAngle, endAngle, clockwise) }
        }

        if (type === 'ellipse') {
            const center = randomPoint()
            const rx = randomIn(0.3, 18)
            const ry = randomIn(0.2, 12)
            const rotation = randomIn(-Math.PI, Math.PI)
            return { type, curve: new Ellipse2(center, rx, ry, rotation) }
        }

        if (type === 'ellipseArc') {
            const center = randomPoint()
            const rx = randomIn(0.3, 18)
            const ry = randomIn(0.2, 12)
            const rotation = randomIn(-Math.PI, Math.PI)
            const startAngle = randomIn(-Math.PI, Math.PI)
            const sweep = randomIn(0.2, Math.PI * 1.9)
            const clockwise = randomBool()
            const endAngle = startAngle + (clockwise ? -sweep : sweep)
            return {
                type,
                curve: new EllipseArc2(center, rx, ry, rotation, startAngle, endAngle, clockwise),
            }
        }

        const count = Math.floor(randomIn(4, 28))
        const points: Vec2[] = []
        let cursor = randomPoint()
        points.push(cursor.clone())
        for (let i = 1; i < count; i++) {
            const step = new Vec2(randomIn(-6, 6), randomIn(-6, 6))
            cursor = cursor.added(step)
            points.push(cursor)
        }
        const degree = Math.min(3, points.length - 1)
        return {
            type,
            curve: new BSpline2(points, degree, { expandedKnots: buildClampedKnots(points.length, degree) }),
        }
    }

    async function generateRandomCurves(count = 50): Promise<void> {
        if (isGenerating.value) return
        isGenerating.value = true
        try {
            activeTool.value = 'select'
            clearDraft()
            updateStatus()

            const chunkSize = 50
            let created = 0
            while (created < count) {
                const chunkEnd = Math.min(created + chunkSize, count)
                for (; created < chunkEnd; created++) {
                    const { type, curve } = randomCurveSpec()
                    addCurveEntity(type, curve, true)
                }
                statusHint.value = '正在随机追加曲线：' + created + '/' + count
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => resolve())
                })
            }

            statusHint.value = '正在合批渲染：新增 ' + count + ' 条'
            rebuildEntities()
        } finally {
            isGenerating.value = false
            updateStatus()
        }
    }
    function pointToWorld(event: PointerEvent): Vec2 | null {
        if (!viewport) return null
        const rect = viewport.renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, viewport.camera)
        const hit = new THREE.Vector3()
        const ok = raycaster.ray.intersectPlane(worldPlane, hit)
        if (!ok) return null
        return new Vec2(hit.x, hit.y)
    }

    function toLocal(center: Vec2, point: Vec2, rotation: number): Vec2 {
        const dx = point.x - center.x
        const dy = point.y - center.y
        const c = Math.cos(rotation)
        const s = Math.sin(rotation)
        return new Vec2(c * dx + s * dy, -s * dx + c * dy)
    }

    function angleOnEllipse(center: Vec2, point: Vec2, rx: number, ry: number, rotation: number): number {
        const local = toLocal(center, point, rotation)
        return Math.atan2(local.y / ry, local.x / rx)
    }

    function localToWorld(center: Vec2, local: Vec2, rotation: number): Vec2 {
        const c = Math.cos(rotation)
        const s = Math.sin(rotation)
        return new Vec2(
            center.x + c * local.x - s * local.y,
            center.y + s * local.x + c * local.y,
        )
    }

    function projectPointToEllipse(center: Vec2, point: Vec2, rx: number, ry: number, rotation: number): Vec2 {
        const local = toLocal(center, point, rotation)
        const denom = (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry)
        if (!Number.isFinite(denom) || denom <= 1e-12) {
            return localToWorld(center, new Vec2(rx, 0), rotation)
        }
        const scale = 1 / Math.sqrt(denom)
        return localToWorld(center, local.scaled(scale), rotation)
    }

    function resolveEllipseParams(center: Vec2, xAxisPoint: Vec2, yAxisRef: Vec2): EllipseParams | null {
        const major = xAxisPoint.subtracted(center)
        const rx = major.len()
        if (!Number.isFinite(rx) || rx <= 1e-8) return null

        const rotation = Math.atan2(major.y, major.x)
        const localRef = toLocal(center, yAxisRef, rotation)
        const ry = Math.max(Math.abs(localRef.y), 1e-6)
        if (!Number.isFinite(ry)) return null

        return { center, rx, ry, rotation }
    }

    function buildEllipsePreview(center: Vec2, xAxisPoint: Vec2, yAxisRef: Vec2): Ellipse2 | null {
        const params = resolveEllipseParams(center, xAxisPoint, yAxisRef)
        if (!params) return null
        return new Ellipse2(params.center, params.rx, params.ry, params.rotation)
    }

    function buildEllipseArcPreview(
        center: Vec2,
        ellipse: { rx: number; ry: number; rotation: number },
        startRaw: Vec2,
        endRaw: Vec2,
    ): EllipseArc2 {
        const startPoint = projectPointToEllipse(center, startRaw, ellipse.rx, ellipse.ry, ellipse.rotation)
        const endPoint = projectPointToEllipse(center, endRaw, ellipse.rx, ellipse.ry, ellipse.rotation)
        const startAngle = angleOnEllipse(center, startPoint, ellipse.rx, ellipse.ry, ellipse.rotation)
        const endAngle = angleOnEllipse(center, endPoint, ellipse.rx, ellipse.ry, ellipse.rotation)
        const clockwise = toLocal(center, startPoint, ellipse.rotation).cross(toLocal(center, endPoint, ellipse.rotation)) < 0
        return new EllipseArc2(center, ellipse.rx, ellipse.ry, ellipse.rotation, startAngle, endAngle, clockwise)
    }

    function buildEllipseArcFromFivePoints(
        center: Vec2,
        xAxisPoint: Vec2,
        yAxisRef: Vec2,
        startPoint: Vec2,
        endPoint: Vec2,
    ): EllipseArc2 | null {
        const ellipse = resolveEllipseParams(center, xAxisPoint, yAxisRef)
        if (!ellipse) return null
        return buildEllipseArcPreview(ellipse.center, ellipse, startPoint, endPoint)
    }

    function buildClampedKnots(pointCount: number, degree: number): number[] {
        const spanCount = pointCount - degree
        const knots: number[] = []
        for (let i = 0; i <= degree; i++) knots.push(0)
        for (let i = 1; i < spanCount; i++) knots.push(i)
        for (let i = 0; i <= degree; i++) knots.push(spanCount)
        return knots
    }

    function finalizeFromDraft(tool: DrawTool, points: Vec2[]): Curve2 | null {
        if (tool === 'line' && points.length >= 2) {
            return new Line2(points[0], points[1])
        }
        if (tool === 'circle' && points.length >= 2) {
            const radius = points[0].distanceTo(points[1])
            if (radius <= 1e-8) return null
            return new Circle2(points[0], radius)
        }
        if (tool === 'arc' && points.length >= 3) {
            const center = points[0]
            const start = points[1]
            const end = points[2]
            const radius = center.distanceTo(start)
            if (radius <= 1e-8) return null
            const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
            const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
            const clockwise = start.subtracted(center).cross(end.subtracted(center)) < 0
            return new Arc2(center, radius, startAngle, endAngle, clockwise)
        }
        if (tool === 'ellipse' && points.length >= 3) {
            return buildEllipsePreview(points[0], points[1], points[2])
        }
        if (tool === 'ellipseArc' && points.length >= 5) {
            return buildEllipseArcFromFivePoints(points[0], points[1], points[2], points[3], points[4])
        }
        if (tool === 'bspline' && points.length >= 4) {
            const degree = Math.min(3, points.length - 1)
            return new BSpline2(points, degree, { expandedKnots: buildClampedKnots(points.length, degree) })
        }
        return null
    }

    function clearDraft(): void {
        draftPoints = []
        hoverPoint = null
    }

    function renderDraft(): void {
        draftRoot.clear()
        if (activeTool.value === 'select') return

        const points = [...draftPoints]
        if (hoverPoint) points.push(hoverPoint)
        if (points.length === 0) return

        const addPointMarkers = (pts: Vec2[], color: number, size = 7) => {
            if (pts.length === 0) return
            const geometry = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)))
            draftRoot.add(
                new THREE.Points(
                    geometry,
                    new THREE.PointsMaterial({ color, size, sizeAttenuation: false }),
                ),
            )
        }

        if (!(activeTool.value === 'ellipseArc' && draftPoints.length >= 3)) {
            addPointMarkers(points, 0x0f172a, 7)
        } else {
            addPointMarkers(draftPoints.slice(0, Math.min(3, draftPoints.length)), 0x0f172a, 7)
        }

        if (points.length >= 2 && !(activeTool.value === 'ellipseArc' && draftPoints.length >= 3)) {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0)))
            const line = new THREE.Line(
                lineGeometry,
                new THREE.LineDashedMaterial({ color: 0x334155, dashSize: 0.4, gapSize: 0.25 }),
            )
            line.computeLineDistances()
            draftRoot.add(line)
        }

        const previewCurves: Curve2[] = []
        if (activeTool.value === 'ellipse') {
            if (points.length >= 3) {
                const curve = buildEllipsePreview(points[0], points[1], points[2])
                if (curve) previewCurves.push(curve)
            }
        } else if (activeTool.value === 'ellipseArc') {
            if (points.length >= 3) {
                const base = buildEllipsePreview(points[0], points[1], points[2])
                if (base) previewCurves.push(base)

                const ellipse = resolveEllipseParams(points[0], points[1], points[2])
                if (ellipse) {
                    if (draftPoints.length < 4 && hoverPoint) {
                        const startCandidate = projectPointToEllipse(points[0], hoverPoint, ellipse.rx, ellipse.ry, ellipse.rotation)
                        addPointMarkers([startCandidate], 0xf59e0b, 9)
                    }
                    if (draftPoints.length >= 4) {
                        const startFixed = projectPointToEllipse(points[0], draftPoints[3], ellipse.rx, ellipse.ry, ellipse.rotation)
                        addPointMarkers([startFixed], 0xf59e0b, 9)
                        if (hoverPoint) {
                            const endCandidate = projectPointToEllipse(points[0], hoverPoint, ellipse.rx, ellipse.ry, ellipse.rotation)
                            addPointMarkers([endCandidate], 0x06b6d4, 9)
                        }
                    }
                }
            }
            if (draftPoints.length >= 4 && hoverPoint) {
                const arc = buildEllipseArcFromFivePoints(
                    draftPoints[0],
                    draftPoints[1],
                    draftPoints[2],
                    draftPoints[3],
                    hoverPoint,
                )
                if (arc) previewCurves.push(arc)
            } else if (points.length >= 5) {
                const arc = buildEllipseArcFromFivePoints(points[0], points[1], points[2], points[3], points[4])
                if (arc) previewCurves.push(arc)
            }
        } else {
            const curve = finalizeFromDraft(activeTool.value, points)
            if (curve) previewCurves.push(curve)
        }

        const previewOptions = resolveDiscretizeOptions()
        for (let i = 0; i < previewCurves.length; i++) {
            try {
                const preview = buildDiscreteLine(previewCurves[i], previewOptions)
                const mat = preview.material as THREE.LineBasicMaterial
                if (activeTool.value === 'ellipseArc') {
                    mat.color.setHex(i === 0 ? 0x0f766e : 0xef4444)
                } else {
                    mat.color.setHex(i === 0 ? 0x0f766e : 0x14b8a6)
                }
                mat.transparent = true
                mat.opacity = 0.92
                draftRoot.add(preview)
            } catch (error) {
                reportDiscretizeError(error, activeTool.value, previewCurves[i], draftPoints)
            }
        }
    }

    function updateStatus(): void {
        const required = getRequiredPoints(activeTool.value)
        const ellipseSteps = ['点中心', '点长轴端点', '点短轴参考点']
        const ellipseArcSteps = ['点中心', '点长轴端点', '点短轴参考点', '点弧起点', '点弧终点']

        let hint = '当前绘制：' + toolLabel(activeTool.value) + '，左键取点，右键结束。' + draftPoints.length + '/' + required
        if (activeTool.value === 'select') {
            hint = '选择模式：可平移缩放查看，点击顶部按钮进入绘制模式'
        } else if (activeTool.value === 'bspline') {
            hint = '左键连续添加控制点，右键结束并生成 B 样条'
        } else if (activeTool.value === 'ellipse') {
            const step = ellipseSteps[Math.min(draftPoints.length, ellipseSteps.length - 1)]
            hint = '当前绘制：椭圆，下一步：' + step + '（' + draftPoints.length + '/' + required + '）'
        } else if (activeTool.value === 'ellipseArc') {
            const step = ellipseArcSteps[Math.min(draftPoints.length, ellipseArcSteps.length - 1)]
            hint = '当前绘制：椭圆弧，下一步：' + step + '（' + draftPoints.length + '/' + required + '）'
        }

        if (isRefining.value) {
            statusHint.value = statusHint.value.startsWith('后台精化离散') ? statusHint.value : '后台精化离散中...'
            completionMessage.value = ''
            return
        }

        const done = lastCompleted && performance.now() - lastCompleted.at < 2200
            ? '已完成第 ' + lastCompleted.id + ' 个' + toolLabel(lastCompleted.tool) + '，可继续绘制；右键可结束当前模式。'
            : ''

        statusHint.value = hint
        completionMessage.value = done
    }
    function updatePerformancePanel(): void {
        if (!perfMonitor) return
        const snap = perfMonitor.snapshot()
        const fpsClass: 'good' | 'warn' | 'bad' = snap.fps < 20 ? 'bad' : snap.fps < 30 ? 'warn' : 'good'
        const sampledPoints = entities.reduce((acc, entity) => acc + entity.discretePointCount, 0)
        perfState.value = { ...snap, fpsClass, sampledPoints }
    }

    function endDrawingMode(): void {
        if (activeTool.value === 'bspline') {
            try {
                const curve = finalizeFromDraft('bspline', draftPoints)
                if (curve) addCurveEntity('bspline', curve)
            } catch (error) {
                reportDiscretizeError(error, 'bspline', null, draftPoints)
            }
        }
        activeTool.value = 'select'
        clearDraft()
        renderDraft()
        updateStatus()
    }

    function onCanvasLeftClick(point: Vec2): void {
        if (activeTool.value === 'select') return

        if (activeTool.value === 'bspline') {
            draftPoints.push(point)
            hoverPoint = point.clone()
            renderDraft()
            updateStatus()
            return
        }

        draftPoints.push(point)
        hoverPoint = point.clone()

        const required = getRequiredPoints(activeTool.value)
        if (draftPoints.length < required) {
            renderDraft()
            updateStatus()
            return
        }

        let curve: Curve2 | null = null
        try {
            curve = finalizeFromDraft(activeTool.value, draftPoints)
        } catch (error) {
            reportDiscretizeError(error, activeTool.value, null, draftPoints)
        }
        if (curve) {
            addCurveEntity(activeTool.value, curve)
        }

        clearDraft()
        renderDraft()
        updateStatus()
    }

    function applyPreset(nextPreset: Preset): void {
        preset.value = nextPreset
        for (const entity of entities) {
            try {
                const polyline = discretizePolylinePoints(entity.curve, resolveDiscretizeOptions())
                entity.discretePolyline = polyline
                entity.discretePointCount = polyline.length
            } catch (error) {
                entity.discretePolyline = []
                entity.discretePointCount = 0
                reportDiscretizeError(error, entity.type, entity.curve)
            }
        }
        markDiscreteCacheDirty()
        rebuildEntities()
        renderDraft()
    }

    function setActiveTool(tool: DrawTool): void {
        activeTool.value = tool
        clearDraft()
        renderDraft()
        updateStatus()
    }

    function setShowDiscrete(checked: boolean): void {
        showDiscrete.value = checked
        rebuildBatchedLayers()
    }

    function setShowDiscretePoints(checked: boolean): void {
        showDiscretePoints.value = checked
        rebuildBatchedLayers()
    }

    function setShowBoundingBox(checked: boolean): void {
        showBoundingBox.value = checked
        rebuildOverlayLayers()
    }

    function setShowDirection(checked: boolean): void {
        showDirection.value = checked
        rebuildOverlayLayers()
    }

    function showOnlyPoints(): void {
        showDiscrete.value = false
        showDiscretePoints.value = true
        showBoundingBox.value = false
        showDirection.value = false
        rebuildEntities()
    }

    function clearBbox(): void {
        showBoundingBox.value = false
        rebuildEntities()
    }

    function clearScene(): void {
        for (const entity of entities) {
            if (entity.group) {
                entityRoot.remove(entity.group)
                disposeObjectTree(entity.group)
            }
        }
        clearBatchedRenderObjects()
        linePositionCache = []
        pointPositionCache = []
        discreteCacheDirty = false
        entities = []
        entityCount.value = 0
        clearDraft()
        renderDraft()
        updateStatus()
    }

    function initViewport(): void {
        if (!canvasHost.value) return
        viewport = createViewport(canvasHost.value)
        perfMonitor = createPerformanceMonitor(viewport.renderer)
        viewport.scene.add(entityRoot)
        viewport.scene.add(batchedRoot)
        viewport.scene.add(draftRoot)

        const canvasDom = viewport.renderer.domElement
        const onContextMenu = (event: MouseEvent) => {
            event.preventDefault()
        }
        const onPointerMove = (event: PointerEvent) => {
            const point = pointToWorld(event)
            hoverPoint = point
            renderDraft()
        }
        const onPointerDown = (event: PointerEvent) => {
            if (event.button === 2) {
                endDrawingMode()
                return
            }
            if (event.button !== 0) return
            const point = pointToWorld(event)
            if (!point) return
            onCanvasLeftClick(point)
        }

        eventDisposers = [
            useEventListener(canvasDom, 'contextmenu', onContextMenu),
            useEventListener(canvasDom, 'pointermove', onPointerMove),
            useEventListener(canvasDom, 'pointerdown', onPointerDown),
        ]

        lastPerfUiTime = performance.now()
        viewport.start(() => {
            perfMonitor?.tick()
            const now = performance.now()
            if (now - lastPerfUiTime >= 150) {
                updatePerformancePanel()
                lastPerfUiTime = now
            }
        })

        updateStatus()
        updatePerformancePanel()
    }

    function disposeViewport(): void {
        for (const stop of eventDisposers) stop()
        eventDisposers = []

        clearScene()
        viewport?.dispose()
        viewport = null
        perfMonitor = null
    }

    onMounted(() => {
        initViewport()
    })

    onUnmounted(() => {
        disposeViewport()
    })

    return {
        drawTools: DRAW_TOOLS,
        activeTool,
        entityCount,
        statusHint,
        completionMessage,
        isGenerating,
        perfState,
        showDiscrete,
        showDiscretePoints,
        showBoundingBox,
        showDirection,
        preset,
        toolLabel,
        setActiveTool,
        applyPreset,
        setShowDiscrete,
        setShowDiscretePoints,
        setShowBoundingBox,
        setShowDirection,
        showOnlyPoints,
        clearBbox,
        clearScene,
        endDrawingMode,
        generateRandomCurves,
    }
}
