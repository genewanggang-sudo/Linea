import {
    Arc2,
    BSpline2,
    Circle2,
    DiscretizeOptions,
    Ellipse2,
    EllipseArc2,
    Line2,
    Precision,
    Vec2,
    intersectCurveCurve,
    intersectCurveSelf,
    type Curve2,
    type CurveXInfo,
} from '@ccpc/math'
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
type LineLinePairCase = { name: string; l1: Line2; l2: Line2 }
type LineLineScenarioBuilder = () => LineLinePairCase

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
    const showIntersections = ref(false)
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
    const intersectionRoot = new THREE.Group()
    const analysisRoot = new THREE.Group()
    let batchedLineObject: THREE.LineSegments | null = null
    let batchedPointObject: THREE.Points | null = null
    let discreteCacheDirty = true
    let linePositionCache: number[] = []
    let pointPositionCache: number[] = []

    let eventDisposers: Array<() => void> = []
    let lastLineLineScenarioSignature = ''

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
                const bs = curve
                payload.bspline = {
                    degree: bs.degree,
                    controlPoints: bs.controlPoints.map(toPlainVec2),
                    expandedKnots: bs.expandedKnots,
                    weights: bs.weights,
                }
            }
        }

        payload.replayTemplate = [
            "import { geomMgr, DiscretizeOptions, type Curve2 } from '@ccpc/math'",
            'const payload = /* 绮樿创瀵煎嚭鐨勯敊璇?JSON */',
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

    function clearIntersectionRenderObjects(): void {
        const children = [...intersectionRoot.children]
        for (const child of children) {
            intersectionRoot.remove(child)
            disposeObjectTree(child)
        }
    }

    function clearAnalysisRenderObjects(): void {
        const children = [...analysisRoot.children]
        for (const child of children) {
            analysisRoot.remove(child)
            disposeObjectTree(child)
        }
    }

    function collectCurveEntities(): Curve2[] {
        return entities.map((entity) => entity.curve)
    }

    function addOverlapPolyline(points: Vec2[]): void {
        if (points.length < 2) return
        const geometry = new THREE.BufferGeometry().setFromPoints(
            points.map((p) => new THREE.Vector3(p.x, p.y, 0)),
        )
        const material = new THREE.LineBasicMaterial({ color: 0x16a34a })
        intersectionRoot.add(new THREE.Line(geometry, material))
    }

    function addOverlapRangeOnCurve(curve: Curve2, info: CurveXInfo): void {
        if (!info.range1) return
        try {
            const parts = curve.trim(info.range1)
            if (parts.length === 0) return
            const options = resolveDiscretizeOptions()
            for (const part of parts) {
                const polyline = discretizePolylinePoints(part, options)
                addOverlapPolyline(polyline)
            }
        } catch {
            // Ignore overlap rendering failure to keep main visualization responsive.
        }
    }

    function renderSelfIntersections(entity: DrawEntity): void {
        if (!entity.curve.isBSpline()) return
        const results = intersectCurveSelf(entity.curve)
        for (const info of results) {
            if (!info.isOverlap) {
                addIntersectionPointMarker(info.point)
            }
        }
    }

    function renderPairIntersections(curveA: Curve2, curveB: Curve2): void {
        const results = intersectCurveCurve(curveA, curveB)
        for (const info of results) {
            if (info.isOverlap) {
                addOverlapRangeOnCurve(curveA, info)
            } else {
                addIntersectionPointMarker(info.point)
            }
        }
    }

    function rebuildIntersectionLayer(): void {
        clearIntersectionRenderObjects()
        if (!showIntersections.value) return

        const curves = collectCurveEntities()
        for (const entity of entities) {
            try {
                renderSelfIntersections(entity)
            } catch (error) {
                const t = entity.curve.getType()
                statusHint.value = `自交检测失败：${t}`
                completionMessage.value = error instanceof Error ? error.message : String(error)
                console.error('[math-viz] self intersection failed:', { type: t, error })
            }
        }
        for (let i = 0; i < curves.length; i++) {
            for (let j = i + 1; j < curves.length; j++) {
                try {
                    renderPairIntersections(curves[i], curves[j])
                } catch (error) {
                    const t1 = curves[i].getType()
                    const t2 = curves[j].getType()
                    statusHint.value = `求交失败：${t1} x ${t2}`
                    completionMessage.value = error instanceof Error ? error.message : String(error)
                    console.error('[math-viz] intersectCurveCurve failed:', { t1, t2, error })
                }
            }
        }
    }
    async function exportPairSnapshot(): Promise<void> {
        const hasPairInput = entities.length >= 2
        const hasSelfInput = entities.some((entity) => entity.curve.isBSpline())
        if (!hasPairInput && !hasSelfInput) {
            statusHint.value = '当前曲线不足两条且无 B 样条，无法导出求交快照'
            completionMessage.value = ''
            return
        }

        const dedupTol = 1e-5
        const serializeResult = (r: CurveXInfo) => ({
            point: { x: r.point.x, y: r.point.y },
            u1: r.u1,
            u2: r.u2,
            isOverlap: r.isOverlap,
            range1: r.range1 ? { start: r.range1.start, end: r.range1.end } : undefined,
            range2: r.range2 ? { start: r.range2.start, end: r.range2.end } : undefined,
        })
        const uniquePointResults = (results: CurveXInfo[]) => {
            const unique: CurveXInfo[] = []
            for (const r of results) {
                if (r.isOverlap) continue
                const dup = unique.some((u) =>
                    !u.isOverlap && u.point.distanceTo(r.point) <= dedupTol,
                )
                if (!dup) unique.push(r)
            }
            return unique
        }

        const curves = entities.map((entity) => entity.curve)
        const curveItems = entities.map((entity, idx) => {
            let bbox: ReturnType<Curve2['getBBox']> | null = null
            try {
                bbox = entity.curve.getBBox()
            } catch {
                bbox = null
            }
            const range = entity.curve.getRange()
            return {
                i: idx,
                entityId: entity.id,
                drawType: entity.type,
                curveType: entity.curve.getType(),
                curveDump: entity.curve.dump(),
                range: { start: range.start, end: range.end },
                bbox: bbox ? {
                    min: { x: bbox.minX, y: bbox.minY },
                    max: { x: bbox.maxX, y: bbox.maxY },
                } : null,
            }
        })
        const items: Array<Record<string, unknown>> = []
        for (let i = 0; i < curves.length; i++) {
            const selfCurve = curves[i]
            if (selfCurve.isBSpline()) {
                const selfItem: Record<string, unknown> = {
                    i,
                    j: i,
                    self: true,
                    type1: selfCurve.getType(),
                    type2: selfCurve.getType(),
                    curve1Dump: selfCurve.dump(),
                    curve2Dump: selfCurve.dump(),
                }
                try {
                    const results = intersectCurveSelf(selfCurve)
                    const overlapCount = results.filter((r) => r.isOverlap).length
                    const pointCount = results.length - overlapCount
                    const uniquePoints = uniquePointResults(results)
                    selfItem.resultCount = results.length
                    selfItem.pointCount = pointCount
                    selfItem.overlapCount = overlapCount
                    selfItem.uniquePointCount = uniquePoints.length
                    selfItem.results = results.map(serializeResult)
                    selfItem.uniquePointResults = uniquePoints.map(serializeResult)
                } catch (error) {
                    selfItem.error = error instanceof Error ? error.message : String(error)
                }
                items.push(selfItem)
            }

            for (let j = i + 1; j < curves.length; j++) {
                const c1 = curves[i]
                const c2 = curves[j]
                const base: Record<string, unknown> = {
                    i,
                    j,
                    type1: c1.getType(),
                    type2: c2.getType(),
                    curve1Dump: c1.dump(),
                    curve2Dump: c2.dump(),
                }
                try {
                    const results = intersectCurveCurve(c1, c2)
                    const overlapCount = results.filter((r) => r.isOverlap).length
                    const pointCount = results.length - overlapCount
                    const uniquePoints = uniquePointResults(results)
                    base.resultCount = results.length
                    base.pointCount = pointCount
                    base.overlapCount = overlapCount
                    base.uniquePointCount = uniquePoints.length
                    base.results = results.map(serializeResult)
                    base.uniquePointResults = uniquePoints.map(serializeResult)
                } catch (error) {
                    base.error = error instanceof Error ? error.message : String(error)
                }
                items.push(base)
            }
        }
        const payload = JSON.stringify({
            at: new Date().toISOString(),
            entityCount: entities.length,
            pairCount: items.length,
            dedupPointTol: dedupTol,
            curves: curveItems,
            items,
        }, null, 2)
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(payload)
                completionMessage.value = 'Pair 快照已复制到剪贴板'
                return
            }
        } catch {
            // Ignore clipboard errors and fallback to console output.
        }
        console.log('[math-viz] pair-snapshot-json:', payload)
        completionMessage.value = '剪贴板不可用，pair 快照已输出到控制台'
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
        rebuildIntersectionLayer()
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
            rebuildIntersectionLayer()
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
        const { knots, multiplicities } = buildClampedKnotData(points.length, degree)
        return {
            type,
            curve: new BSpline2({ controlPoints: points, degree, knots, multiplicities }),
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
                statusHint.value = `正在随机追加曲线：${created}/${count}`
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => resolve())
                })
            }

            statusHint.value = `正在合批渲染：新增 ${count} 条曲线`
            rebuildEntities()
        } finally {
            isGenerating.value = false
            updateStatus()
        }
    }


    function randomUnitVector(): Vec2 {
        const theta = randomIn(-Math.PI, Math.PI)
        return new Vec2(Math.cos(theta), Math.sin(theta))
    }

    function createExtremeLineLinePairs(count = 5): LineLinePairCase[] {
        const scenarios: LineLineScenarioBuilder[] = [
            () => {
                const c = randomPoint(100)
                const d1 = randomUnitVector()
                const d2 = new Vec2(-d1.y, d1.x).scale(randomBool() ? 1 : -1)
                return {
                    name: 'normal-cross',
                    l1: new Line2(c.added(d1.scaled(-20)), c.added(d1.scaled(20))),
                    l2: new Line2(c.added(d2.scaled(-20)), c.added(d2.scaled(20))),
                }
            },
            () => {
                const p = randomPoint(100)
                const d1 = randomUnitVector()
                const d2 = randomUnitVector()
                return {
                    name: 'endpoint-touch',
                    l1: new Line2(p.added(d1.scaled(-24)), p),
                    l2: new Line2(p, p.added(d2.scaled(24))),
                }
            },
            () => {
                const p0 = randomPoint(100)
                const d = randomUnitVector()
                const n = new Vec2(-d.y, d.x)
                const dist = randomIn(0.5, 3.0)
                return {
                    name: 'parallel-disjoint',
                    l1: new Line2(p0.added(d.scaled(-24)), p0.added(d.scaled(24))),
                    l2: new Line2(
                        p0.added(n.scaled(dist)).added(d.scaled(-24)),
                        p0.added(n.scaled(dist)).added(d.scaled(24)),
                    ),
                }
            },
            () => {
                const anchor = randomPoint(100)
                const d = randomUnitVector()
                return {
                    name: 'collinear-overlap',
                    l1: new Line2(anchor.added(d.scaled(-26)), anchor.added(d.scaled(18))),
                    l2: new Line2(anchor.added(d.scaled(-8)), anchor.added(d.scaled(30))),
                }
            },
            () => {
                const c = randomPoint(100)
                const d1 = randomUnitVector()
                const n = new Vec2(-d1.y, d1.x)
                return {
                    name: 'near-parallel-cross',
                    l1: new Line2(c.added(d1.scaled(-38)), c.added(d1.scaled(38))),
                    l2: new Line2(
                        c.added(d1.scaled(-38)).added(n.scaled(0.03)),
                        c.added(d1.scaled(38)).added(n.scaled(-0.03)),
                    ),
                }
            },
            () => {
                const c = randomPoint(100)
                const d = randomUnitVector()
                const n = new Vec2(-d.y, d.x)
                return {
                    name: 'almost-collinear-nonoverlap',
                    l1: new Line2(c.added(d.scaled(-30)), c.added(d.scaled(-2))),
                    l2: new Line2(c.added(d.scaled(2)).added(n.scaled(0.01)), c.added(d.scaled(32)).added(n.scaled(0.01))),
                }
            },
            () => {
                const c = randomPoint(100)
                const d1 = randomUnitVector()
                const d2 = new Vec2(-d1.y, d1.x)
                return {
                    name: 'tiny-segment-touch',
                    l1: new Line2(c.added(d1.scaled(-0.06)), c.added(d1.scaled(0.06))),
                    l2: new Line2(c.added(d2.scaled(-18)), c.added(d2.scaled(18))),
                }
            },
            () => {
                const c = randomPoint(100)
                const d = randomUnitVector()
                return {
                    name: 'same-line-reversed',
                    l1: new Line2(c.added(d.scaled(-22)), c.added(d.scaled(22))),
                    l2: new Line2(c.added(d.scaled(22)), c.added(d.scaled(-22))),
                }
            },
        ]

        const picks: LineLineScenarioBuilder[] = []
        const pool = scenarios.slice()
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const t = pool[i]
            pool[i] = pool[j]
            pool[j] = t
        }
        for (let i = 0; i < Math.min(count, pool.length); i++) {
            picks.push(pool[i])
        }

        let pairs = picks.map((build) => build())
        let signature = pairs.map((p) => p.name).sort().join('|')
        if (signature === lastLineLineScenarioSignature) {
            pairs = pool.slice().reverse().slice(0, Math.min(count, pool.length)).map((build) => build())
            signature = pairs.map((p) => p.name).sort().join('|')
        }
        lastLineLineScenarioSignature = signature
        return pairs
    }

    function addIntersectionPointMarker(point: Vec2): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(point.x, point.y, 0)])
        const material = new THREE.PointsMaterial({
            color: 0xdc2626,
            size: 9,
            sizeAttenuation: false,
        })
        intersectionRoot.add(new THREE.Points(geometry, material))
    }

    function addAnalysisPointMarker(point: Vec2, color: number, size = 10): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(point.x, point.y, 0)])
        const material = new THREE.PointsMaterial({ color, size, sizeAttenuation: false })
        analysisRoot.add(new THREE.Points(geometry, material))
    }

    function addAnalysisSegment(a: Vec2, b: Vec2, color: number, dashed = false): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(a.x, a.y, 0),
            new THREE.Vector3(b.x, b.y, 0),
        ])
        const material = dashed
            ? new THREE.LineDashedMaterial({ color, dashSize: 0.9, gapSize: 0.45, transparent: true, opacity: 0.8 })
            : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88 })
        const line = new THREE.Line(geometry, material)
        if (dashed) line.computeLineDistances()
        analysisRoot.add(line)
    }

    function addAnalysisCurve(curve: Curve2, color: number, opacity = 0.55): void {
        try {
            const line = buildDiscreteLine(curve, resolveDiscretizeOptions())
            const material = line.material as THREE.LineBasicMaterial
            material.color.setHex(color)
            material.transparent = true
            material.opacity = opacity
            analysisRoot.add(line)
        } catch (error) {
            reportDiscretizeError(error, 'select', curve)
        }
    }

    function addOverlapSegment(line: Line2, info: CurveXInfo): void {
        if (!info.range1) return
        const p0 = line.pointAt(info.range1.start)
        const p1 = line.pointAt(info.range1.end)
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p0.x, p0.y, 0),
            new THREE.Vector3(p1.x, p1.y, 0),
        ])
        const material = new THREE.LineBasicMaterial({ color: 0x16a34a })
        intersectionRoot.add(new THREE.Line(geometry, material))
    }

    function renderLineLineIntersections(lineA: Line2, results: CurveXInfo[]): void {
        for (const info of results) {
            if (info.isOverlap) {
                addOverlapSegment(lineA, info)
            } else {
                addIntersectionPointMarker(info.point)
            }
        }
    }

    function runRandomLineLineIntersectionCases(): void {
        activeTool.value = 'select'
        clearDraft()
        clearScene()
        clearIntersectionRenderObjects()

        const pairs = createExtremeLineLinePairs()
        const summaries: string[] = []

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i]
            addCurveEntity('line', pair.l1, true)
            addCurveEntity('line', pair.l2, true)
            const result = intersectCurveCurve(pair.l1, pair.l2)
            renderLineLineIntersections(pair.l1, result)
            const overlapCount = result.filter((item) => item.isOverlap).length
            const pointCount = result.length - overlapCount
            summaries.push(`#${i + 1} ${pair.name}: p=${pointCount}, o=${overlapCount}`)
        }

        rebuildEntities()
        statusHint.value = '线线随机求交样例已生成（5组）'
        completionMessage.value = summaries.join(' | ')
    }

    function evaluateProjectedPointForViz(curve: Curve2, param: number): Vec2 {
        if (curve.isLine()) {
            const dir = curve.end.subtracted(curve.start).normalize()
            return curve.start.added(dir.scaled(param))
        }
        if (curve.isArc()) {
            return new Circle2(curve.center, curve.radius).pointAt(param)
        }
        if (curve.isEllipseArc()) {
            return new Ellipse2(curve.center, curve.rx, curve.ry, curve.rotation).pointAt(param)
        }
        return curve.pointAt(param)
    }

    function addSupportGeometryForGetParamAt(curve: Curve2, queryParams: number[]): void {
        if (curve.isLine()) {
            const minU = Math.min(curve.getStartParam(), ...queryParams)
            const maxU = Math.max(curve.getEndParam(), ...queryParams)
            const dir = curve.end.subtracted(curve.start).normalize()
            const a = curve.start.added(dir.scaled(minU))
            const b = curve.start.added(dir.scaled(maxU))
            addAnalysisSegment(a, b, 0x94a3b8, true)
            return
        }
        if (curve.isArc()) {
            addAnalysisCurve(new Circle2(curve.center, curve.radius), 0x94a3b8, 0.35)
            return
        }
        if (curve.isEllipseArc()) {
            addAnalysisCurve(new Ellipse2(curve.center, curve.rx, curve.ry, curve.rotation), 0x94a3b8, 0.35)
        }
    }

    function addGetParamAtCase(type: DrawTool, curve: Curve2, queryPoints: Vec2[], label: string): void {
        addCurveEntity(type, curve, true)
        const params = queryPoints.map((point) => curve.getParamAt(point))
        addSupportGeometryForGetParamAt(curve, params)

        for (let i = 0; i < queryPoints.length; i++) {
            const query = queryPoints[i]
            const projected = evaluateProjectedPointForViz(curve, params[i])
            addAnalysisPointMarker(query, 0xea580c, 11)
            addAnalysisPointMarker(projected, 0x2563eb, 10)
            addAnalysisSegment(query, projected, 0x0f766e, true)
        }

        const paramSummary = params.map((u) => u.toFixed(3)).join(', ')
        if (completionMessage.value.length > 0) {
            completionMessage.value += ` | ${label}: ${paramSummary}`
        } else {
            completionMessage.value = `${label}: ${paramSummary}`
        }
    }

    function addGetPtAtCase(type: DrawTool, curve: Curve2, params: number[], label: string): void {
        addCurveEntity(type, curve, true)
        addSupportGeometryForGetParamAt(curve, params)

        const values = params.map((u) => curve.getPtAt(u))
        for (let i = 0; i < params.length; i++) {
            const u = params[i]
            const point = values[i]
            addAnalysisPointMarker(point, curve.containsParam(u) ? 0x2563eb : 0xdc2626, 10)
        }

        const paramSummary = params.map((u) => u.toFixed(3)).join(', ')
        if (completionMessage.value.length > 0) {
            completionMessage.value += ` | ${label}: ${paramSummary}`
        } else {
            completionMessage.value = `${label}: ${paramSummary}`
        }
    }

    function runGetParamAtDemo(): void {
        activeTool.value = 'select'
        clearDraft()
        clearScene()
        clearIntersectionRenderObjects()
        clearAnalysisRenderObjects()

        const line = new Line2(new Vec2(-86, 22), new Vec2(-58, 22))
        addGetParamAtCase('line', line, [
            new Vec2(-72, 35),
            new Vec2(-48, 28),
            new Vec2(-98, 18),
        ], 'Line')

        const circle = new Circle2(new Vec2(-22, 24), 10)
        addGetParamAtCase('circle', circle, [
            new Vec2(-8, 34),
            new Vec2(-22, 24),
        ], 'Circle')

        const arc = new Arc2(new Vec2(28, 24), 10, 0, Math.PI / 2, false)
        addGetParamAtCase('arc', arc, [
            new Vec2(42, 24),
            new Vec2(18, 12),
        ], 'Arc')

        const ellipse = new Ellipse2(new Vec2(80, 24), 14, 7, Math.PI / 6)
        addGetParamAtCase('ellipse', ellipse, [
            new Vec2(98, 37),
            new Vec2(80, 24),
        ], 'Ellipse')

        const ellipseArc = new EllipseArc2(new Vec2(-36, -28), 15, 8, Math.PI / 7, -0.2, 1.35, false)
        addGetParamAtCase('ellipseArc', ellipseArc, [
            new Vec2(-16, -16),
            new Vec2(-54, -40),
        ], 'EllipseArc')

        const bspline = new BSpline2({
            controlPoints: [
                new Vec2(16, -40),
                new Vec2(28, -18),
                new Vec2(44, -52),
                new Vec2(58, -26),
                new Vec2(76, -36),
            ],
            degree: 3,
            knots: [0, 1, 2],
            multiplicities: [4, 1, 4],
        })
        addGetParamAtCase('bspline', bspline, [
            new Vec2(36, -16),
            new Vec2(60, -58),
        ], 'BSpline')

        rebuildEntities()
        statusHint.value = 'getParamAt 演示已生成：橙点是查询点，蓝点是投影点，灰虚线为支撑体'
    }

    function runGetPtAtDemo(): void {
        activeTool.value = 'select'
        clearDraft()
        clearScene()
        clearIntersectionRenderObjects()
        clearAnalysisRenderObjects()

        const line = new Line2(new Vec2(-86, 22), new Vec2(-58, 22))
        addGetPtAtCase('line', line, [-10, 0, 14, 36], 'Line')

        const circle = new Circle2(new Vec2(-22, 24), 10)
        addGetPtAtCase('circle', circle, [0, Math.PI / 2, Math.PI * 2 + Math.PI / 3], 'Circle')

        const arc = new Arc2(new Vec2(28, 24), 10, 0, Math.PI / 2, true)
        addGetPtAtCase('arc', arc, [arc.getStartParam(), arc.getEndParam(), arc.getEndParam() + Math.PI / 2], 'Arc')

        const ellipse = new Ellipse2(new Vec2(80, 24), 14, 7, Math.PI / 6)
        addGetPtAtCase('ellipse', ellipse, [0, Math.PI / 4, Math.PI * 2 + 0.8], 'Ellipse')

        const ellipseArc = new EllipseArc2(new Vec2(-36, -28), 15, 8, Math.PI / 7, -0.2, 1.35, false)
        addGetPtAtCase('ellipseArc', ellipseArc, [ellipseArc.getStartParam(), ellipseArc.getEndParam(), ellipseArc.getEndParam() + 0.9], 'EllipseArc')

        const bspline = new BSpline2({
            controlPoints: [
                new Vec2(16, -40),
                new Vec2(28, -18),
                new Vec2(44, -52),
                new Vec2(58, -26),
                new Vec2(76, -36),
            ],
            degree: 3,
            knots: [0, 1, 2],
            multiplicities: [4, 1, 4],
        })
        addGetPtAtCase('bspline', bspline, [bspline.getStartParam() - 0.45, bspline.getStartParam() + 0.5, bspline.getEndParam() + 0.55], 'BSpline')

        rebuildEntities()
        statusHint.value = 'getPtAt 演示已生成：蓝点是参数域内取点，红点是越界参数取点，灰虚线为支撑体'
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

    function buildClampedKnotData(pointCount: number, degree: number): {
        knots: [number, number, ...number[]]
        multiplicities: [number, number, ...number[]]
    } {
        const spanCount = pointCount - degree
        const knots: number[] = []
        const multiplicities: number[] = []
        for (let i = 0; i <= spanCount; i++) {
            knots.push(i)
            if (i === 0 || i === spanCount) {
                multiplicities.push(degree + 1)
            } else {
                multiplicities.push(1)
            }
        }
        return {
            knots: [knots[0], knots[1], ...knots.slice(2)],
            multiplicities: [multiplicities[0], multiplicities[1], ...multiplicities.slice(2)],
        }
    }

    function finalizeFromDraft(tool: DrawTool, points: Vec2[]): Curve2 | null {
        if (tool === 'line' && points.length >= 2) {
            if (points[0].distanceTo(points[1]) <= Precision.CURVE_LENGTH_EPS) return null
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
            const { knots, multiplicities } = buildClampedKnotData(points.length, degree)
            return new BSpline2({ controlPoints: points, degree, knots, multiplicities })
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

        let hint = `当前绘制：${toolLabel(activeTool.value)}，左键取点，右键结束（${draftPoints.length}/${required}）`
        if (activeTool.value === 'select') {
            hint = '选择模式：可平移缩放查看，点击顶部按钮切换绘制模式'
        } else if (activeTool.value === 'bspline') {
            hint = 'B样条模式：左键连续添加控制点，右键结束并生成曲线'
        } else if (activeTool.value === 'ellipse') {
            const step = ellipseSteps[Math.min(draftPoints.length, ellipseSteps.length - 1)]
            hint = `当前绘制：椭圆，下一步：${step}（${draftPoints.length}/${required}）`
        } else if (activeTool.value === 'ellipseArc') {
            const step = ellipseArcSteps[Math.min(draftPoints.length, ellipseArcSteps.length - 1)]
            hint = `当前绘制：椭圆弧，下一步：${step}（${draftPoints.length}/${required}）`
        }

        if (isRefining.value) {
            statusHint.value = statusHint.value.startsWith('后台精化离散')
                ? statusHint.value
                : '后台精化离散中...'
            completionMessage.value = ''
            return
        }

        const done = lastCompleted && performance.now() - lastCompleted.at < 2200
            ? `已完成第 ${lastCompleted.id} 个 ${toolLabel(lastCompleted.tool)}`
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

    function setShowIntersections(checked: boolean): void {
        showIntersections.value = checked
        rebuildIntersectionLayer()
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

    function clearIntersections(): void {
        showIntersections.value = false
        rebuildIntersectionLayer()
    }

    function clearScene(): void {
        for (const entity of entities) {
            if (entity.group) {
                entityRoot.remove(entity.group)
                disposeObjectTree(entity.group)
            }
        }
        clearBatchedRenderObjects()
        clearIntersectionRenderObjects()
        clearAnalysisRenderObjects()
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
        viewport.scene.add(intersectionRoot)
        viewport.scene.add(analysisRoot)

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
        clearIntersectionRenderObjects()
        clearAnalysisRenderObjects()
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
        showIntersections,
        preset,
        toolLabel,
        setActiveTool,
        applyPreset,
        setShowDiscrete,
        setShowDiscretePoints,
        setShowBoundingBox,
        setShowDirection,
        setShowIntersections,
        showOnlyPoints,
        clearBbox,
        exportPairSnapshot,
        clearIntersections,
        clearScene,
        endDrawingMode,
        generateRandomCurves,
        runRandomLineLineIntersectionCases,
        runGetParamAtDemo,
        runGetPtAtDemo,
    }
}
