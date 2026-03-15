import {
    Document,
    Element,
    GCurve2d,
    GPoint2d,
    GPolygon,
    GRep,
    RegisterElement,
    Request,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import { EN_ModelViewChanged } from '../../../packages/core/src/types/type_define'
import { Arc2, Coord2, Ln2, Loop, NurbsCurve2, Plane, Polygon, Vec2 } from '@ccpc/math'
import { app, Cmd, cmdMgr, registerCmd } from '@ccpc/platform'

export type ShapeKind = 'line' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'
export type ToolId = ShapeKind | 'polygon' | 'demo' | 'clear'

export type CursorPoint = {
    x: number
    y: number
}

export type DrawingState = {
    activeTool: ShapeKind | null
    title: string
    detail: string
    steps: string[]
    fixedPoints: number
}

export type PlaygroundState = {
    cursorWorld: CursorPoint | null
    drawing: DrawingState
    toast: string
}

export const toolMeta: Record<ToolId, { label: string, accent: string, subtitle: string }> = {
    line: { label: '绘制直线', accent: '#38bdf8', subtitle: '两点定义线段' },
    circle: { label: '绘制圆', accent: '#60a5fa', subtitle: '圆心加半径点' },
    arc: { label: '绘制圆弧', accent: '#fb923c', subtitle: '三点定义圆弧' },
    ellipse: { label: '绘制椭圆', accent: '#34d399', subtitle: '中心加长短轴点' },
    ellipseArc: { label: '绘制椭圆弧', accent: '#4ade80', subtitle: '五点拟合椭圆弧' },
    bspline: { label: '绘制 B 样条', accent: '#f472b6', subtitle: '四点插值样条' },
    polygon: { label: '插入轮廓', accent: '#a78bfa', subtitle: '插入随机测试轮廓' },
    demo: { label: '加载图框', accent: '#fbbf24', subtitle: '完整图框与投影视图' },
    clear: { label: '清空画布', accent: '#f87171', subtitle: '删除当前测试图形' },
}

const shapePointCount: Record<ShapeKind, number> = {
    line: 2,
    circle: 2,
    arc: 3,
    ellipse: 3,
    ellipseArc: 5,
    bspline: 4,
}

const shapeSteps: Record<ShapeKind, string[]> = {
    line: ['点击起点', '点击终点'],
    circle: ['点击圆心', '点击半径点'],
    arc: ['点击起点', '点击经过点', '点击终点'],
    ellipse: ['点击椭圆中心', '点击长轴端点', '点击短轴参考点'],
    ellipseArc: ['点击中心参考点', '点击长轴点一', '点击长轴点二', '点击短轴点一', '点击短轴点二'],
    bspline: ['点击样条点 1', '点击样条点 2', '点击样条点 3', '点击样条点 4'],
}

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

let activeDoc: Document | undefined
let canvasBootstrapped = false
let mountNode: HTMLElement | undefined
let shapeSeed = 1

function countDistinctPoints(points: Vec2[], eps = 1e-6) {
    const distinct: Vec2[] = []
    for (const point of points) {
        if (!distinct.some(item => item.distanceTo(point) <= eps)) {
            distinct.push(point)
        }
    }
    return distinct.length
}

function emitState() {
    const snapshot: PlaygroundState = {
        cursorWorld: state.cursorWorld ? { ...state.cursorWorld } : null,
        toast: state.toast,
        drawing: {
            ...state.drawing,
            steps: [...state.drawing.steps],
        },
    }
    subscribers.forEach(listener => listener(snapshot))
}

function setToast(message: string) {
    state.toast = message
    emitState()
}

function resetDrawingStatus(detail = defaultDetail) {
    state.drawing = {
        activeTool: null,
        title: '工程图演示台已就绪',
        detail,
        steps: [],
        fixedPoints: 0,
    }
    emitState()
}

function updateDrawingStatus(kind: ShapeKind, fixedPoints: number) {
    const steps = shapeSteps[kind]
    const nextStep = steps[Math.min(fixedPoints, steps.length - 1)]
    state.drawing = {
        activeTool: kind,
        title: toolMeta[kind].label,
        detail: `${nextStep}，已固定 ${fixedPoints}/${steps.length} 个点。`,
        steps,
        fixedPoints,
    }
    emitState()
}

function nextShapeName(kind: ToolId) {
    const name = `${kind}-${shapeSeed}`
    shapeSeed += 1
    return name
}

function clonePoints(points: Vec2[]) {
    return points.map(point => point.clone())
}

function appendGRep(target: GRep, source: GRep) {
    source.children.forEach(node => target.addNode(node.clone()))
}

function addLine(grep: GRep, start: Vec2, end: Vec2) {
    grep.addNode(new GCurve2d(new Plane(), new Ln2(start, end)))
}

function addRect(grep: GRep, center: Vec2, width: number, height: number) {
    const halfW = width * 0.5
    const halfH = height * 0.5
    const lb = new Vec2(center.x - halfW, center.y - halfH)
    const rb = new Vec2(center.x + halfW, center.y - halfH)
    const rt = new Vec2(center.x + halfW, center.y + halfH)
    const lt = new Vec2(center.x - halfW, center.y + halfH)
    addLine(grep, lb, rb)
    addLine(grep, rb, rt)
    addLine(grep, rt, lt)
    addLine(grep, lt, lb)
}

function addCircle(grep: GRep, center: Vec2, radius: number) {
    grep.addNode(new GCurve2d(
        new Plane(),
        new Arc2(new Coord2(center, Vec2.X()), radius, radius, true, [0, Math.PI * 2]),
    ))
}

function createShapeCurve(kind: ShapeKind, points: Vec2[]) {
    if (kind === 'line') {
        return points.length >= 2 ? new Ln2(points[0], points[1]) : undefined
    }

    if (kind === 'circle') {
        if (points.length < 2) {
            return undefined
        }
        const radius = points[0].distanceTo(points[1])
        if (radius <= 1e-6) {
            return undefined
        }
        return Arc2.makeArcByStartEndAngles(points[0], radius, 0, Math.PI * 2, true)
    }

    if (kind === 'arc') {
        return points.length >= 3 ? Arc2.makeArcByThreePoints(points[0], points[1], points[2]) : undefined
    }

    if (kind === 'ellipse') {
        if (points.length < 3) {
            return undefined
        }
        if (countDistinctPoints(points) < 3) {
            return undefined
        }
        return Arc2.makeEllipseByCenterAndThreePoints(points[0], [points[1], points[2], points[1]])
    }

    if (kind === 'bspline') {
        if (points.length < 2 || countDistinctPoints(points) < 2) {
            return undefined
        }
        return NurbsCurve2.makeByInterpolationPts(points, Math.min(3, points.length - 1))
    }

    return points.length >= 5 && countDistinctPoints(points) >= 5
        ? Arc2.makeEllipseByFivePoints(points[0], points[1], points[2], points[3], points[4])
        : undefined
}

function buildShapeGRep(kind: ShapeKind, points: Vec2[]) {
    const grep = new GRep()
    const plane = new Plane()

    if (kind === 'ellipse' || kind === 'ellipseArc') {
        if (points.length >= 2) {
            grep.addNode(new GCurve2d(plane, new Ln2(points[0], points[1])))
        }
        if (points.length >= 3) {
            grep.addNode(new GCurve2d(plane, new Ln2(points[0], points[2])))
        }
        if (points.length >= 4) {
            grep.addNode(new GCurve2d(plane, new Ln2(points[0], points[3])))
        }
        if (points.length >= 5) {
            grep.addNode(new GCurve2d(plane, new Ln2(points[0], points[4])))
        }
    }

    const curve = createShapeCurve(kind, points)
    if (curve) {
        grep.addNode(new GCurve2d(plane, curve))
    } else if (points.length >= 2 && kind !== 'ellipse' && kind !== 'ellipseArc') {
        grep.addNode(new GCurve2d(plane, new Ln2(points[0], points[1])))
    }

    return grep
}

function buildHelperGRep(points: Vec2[]) {
    const grep = new GRep()
    const plane = new Plane()
    for (let i = 0; i < points.length; i += 1) {
        grep.addNode(new GPoint2d(plane, points[i].clone()))
        if (i > 0) {
            grep.addNode(new GCurve2d(plane, new Ln2(points[i - 1], points[i])))
        }
    }
    return grep
}

function buildShapePreviewGRep(kind: ShapeKind, fixedPoints: Vec2[], cursor?: Vec2) {
    const previewPoints = clonePoints(fixedPoints)
    if (cursor && previewPoints.length < shapePointCount[kind]) {
        previewPoints.push(cursor.clone())
    }

    const grep = new GRep()
    appendGRep(grep, buildShapeGRep(kind, previewPoints))
    appendGRep(grep, buildHelperGRep(previewPoints))
    return grep
}

function createRandomPolygon() {
    const center = new Vec2(Math.random() * 420 - 210, Math.random() * 260 - 130)
    const width = 180 + Math.random() * 140
    const height = 110 + Math.random() * 120
    const radius = Math.min(width, height) * 0.18
    const loop = new Loop([
        new Ln2(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), true)!,
        new Ln2(new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), true)!,
        new Ln2(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), true)!,
        new Ln2(new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), true)!,
    ])

    const polygon = new Polygon()
    polygon.addLoop(loop.rotate((Math.random() - 0.5) * Math.PI * 0.7, center), false)
    return polygon
}

function buildPolygonGRep(polygon: Polygon) {
    const grep = new GRep()
    grep.addNode(new GPolygon(new Plane(), polygon))
    return grep
}

function buildEngineeringSheetGRep() {
    const grep = new GRep()

    addRect(grep, new Vec2(0, 0), 1120, 760)
    addRect(grep, new Vec2(0, 0), 1080, 720)

    addLine(grep, new Vec2(180, -340), new Vec2(520, -340))
    addLine(grep, new Vec2(180, -280), new Vec2(520, -280))
    addLine(grep, new Vec2(180, -220), new Vec2(520, -220))
    addLine(grep, new Vec2(260, -340), new Vec2(260, -160))
    addLine(grep, new Vec2(360, -340), new Vec2(360, -160))
    addLine(grep, new Vec2(430, -340), new Vec2(430, -160))
    addLine(grep, new Vec2(180, -160), new Vec2(520, -160))

    addRect(grep, new Vec2(-180, 60), 220, 150)
    addRect(grep, new Vec2(-180, 60), 150, 90)
    addCircle(grep, new Vec2(-180, 60), 24)
    addLine(grep, new Vec2(-290, 60), new Vec2(-70, 60))
    addLine(grep, new Vec2(-180, -15), new Vec2(-180, 135))
    addLine(grep, new Vec2(-255, 105), new Vec2(-255, 15))
    addLine(grep, new Vec2(-105, 105), new Vec2(-105, 15))

    addRect(grep, new Vec2(160, 60), 180, 120)
    addRect(grep, new Vec2(160, 60), 120, 70)
    addCircle(grep, new Vec2(160, 60), 24)
    addLine(grep, new Vec2(70, 120), new Vec2(250, 120))
    addLine(grep, new Vec2(70, 0), new Vec2(250, 0))

    addRect(grep, new Vec2(-10, 250), 140, 90)
    addCircle(grep, new Vec2(-10, 250), 24)
    addLine(grep, new Vec2(-80, 205), new Vec2(60, 205))
    addLine(grep, new Vec2(-80, 295), new Vec2(60, 295))

    addLine(grep, new Vec2(-70, 135), new Vec2(70, 120))
    addLine(grep, new Vec2(-70, -15), new Vec2(70, 0))
    addLine(grep, new Vec2(-70, 60), new Vec2(70, 60))
    addLine(grep, new Vec2(-180, 135), new Vec2(-80, 205))
    addLine(grep, new Vec2(-105, 135), new Vec2(-10, 205))
    addLine(grep, new Vec2(-255, 135), new Vec2(-80, 295))
    addLine(grep, new Vec2(-180, 135), new Vec2(-10, 295))

    return grep
}

@RegisterElement('test-shape-element')
class TestShapeElement extends Element {
    public kind: ShapeKind = 'line'

    public points: Vec2[] = []

    public override markGRepDirty(): void {
        this.C_GRep = buildShapeGRep(this.kind, this.points)
    }
}

@RegisterElement('random-polygon-element')
class RandomPolygonElement extends Element {
    public polygon: Polygon = new Polygon()

    public override markGRepDirty(): void {
        this.C_GRep = buildPolygonGRep(this.polygon.clone())
    }
}

@RegisterElement('engineering-sheet-element')
class EngineeringSheetElement extends Element {
}

@registerRequest('draw-test-shape')
class DrawTestShapeReq extends Request {
    constructor(
        private readonly _kind: ShapeKind,
        private readonly _points: Vec2[],
    ) {
        super()
    }

    public execute() {
        const element = this._doc.create(TestShapeElement)
        element.name = nextShapeName(this._kind)
        element.kind = this._kind
        element.points = clonePoints(this._points)
        element.markGRepDirty()
        return element
    }
}

@registerRequest('draw-random-polygon')
class DrawRandomPolygonReq extends Request {
    constructor(private readonly _polygon: Polygon) {
        super()
    }

    public execute() {
        const element = this._doc.create(RandomPolygonElement)
        element.name = nextShapeName('polygon')
        element.polygon = this._polygon.clone()
        element.markGRepDirty()
        return element
    }
}

@registerRequest('load-engineering-demo')
class LoadEngineeringDemoReq extends Request {
    public execute() {
        const element = this._doc.create(EngineeringSheetElement)
        element.name = nextShapeName('demo')
        element.setGRep(buildEngineeringSheetGRep())
        return element
    }
}

@registerRequest('clear-test-shapes')
class ClearTestShapesReq extends Request {
    public execute() {
        const ids = this._doc.elementMgr
            .getAllElements()
            .filter(element =>
                element instanceof TestShapeElement ||
                element instanceof RandomPolygonElement ||
                element instanceof EngineeringSheetElement)
            .map(element => element.id)

        if (ids.length > 0) {
            this._doc.deleteElementsById(...ids)
        }
    }
}

class BaseDrawShapeCmd extends Cmd {
    public override executeImmediately = false

    private _fixedPoints: Vec2[] = []

    constructor(private readonly _kind: ShapeKind) {
        super()
    }

    public override async execute() {
        updateDrawingStatus(this._kind, 0)
        this._syncPreview()
    }

    public override onMouseMove(evt: { pos: Vec2 }) {
        const worldPos = this._toWorldPos(evt.pos)
        if (!worldPos) {
            return false
        }

        this._syncPreview(worldPos)
        return true
    }

    public override onClick(evt: { pos: Vec2 }) {
        const worldPos = this._toWorldPos(evt.pos)
        if (!worldPos) {
            return false
        }

        this._fixedPoints.push(worldPos)
        updateDrawingStatus(this._kind, this._fixedPoints.length)

        if (this._fixedPoints.length >= shapePointCount[this._kind]) {
            requestMgr.executeReq(
                requestMgr.createReq(DrawTestShapeReq, this._kind, clonePoints(this._fixedPoints)),
                true,
            )
            setToast(`${toolMeta[this._kind].label}已提交`)
            this._clearPreview()
            this._resolve()
            return true
        }

        this._syncPreview(worldPos)
        return true
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getTmpElementPainters().forEach(painter => painter.destroy())
        resetDrawingStatus()
    }

    private _syncPreview(cursor?: Vec2) {
        const painter = this.getBuildInTmpElementPainter()
        painter.drawTmpGRep(buildShapePreviewGRep(this._kind, this._fixedPoints, cursor))
        this.getDoc().cacheForViewElementChanged(EN_ModelViewChanged.ELEMENT_UPDATE, [painter.tmpElement])
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this.clearTmp()
    }

    private _toWorldPos(screenPos: Vec2) {
        const canvas = this.getCanvas()
        if (!canvas) {
            return undefined
        }
        const world = canvas.screenToWorld(screenPos)
        return new Vec2(world.x, world.y)
    }
}

@registerCmd('draw-line-cmd')
class DrawLineCmd extends BaseDrawShapeCmd {
    constructor() {
        super('line')
    }
}

@registerCmd('draw-circle-cmd')
class DrawCircleCmd extends BaseDrawShapeCmd {
    constructor() {
        super('circle')
    }
}

@registerCmd('draw-arc-cmd')
class DrawArcCmd extends BaseDrawShapeCmd {
    constructor() {
        super('arc')
    }
}

@registerCmd('draw-ellipse-cmd')
class DrawEllipseCmd extends BaseDrawShapeCmd {
    constructor() {
        super('ellipse')
    }
}

@registerCmd('draw-ellipse-arc-cmd')
class DrawEllipseArcCmd extends BaseDrawShapeCmd {
    constructor() {
        super('ellipseArc')
    }
}

@registerCmd('draw-bspline-cmd')
class DrawBSplineCmd extends BaseDrawShapeCmd {
    constructor() {
        super('bspline')
    }
}

@registerCmd('clear-shapes-cmd')
class ClearShapesCmd extends Cmd {
    public override async execute() {
        if (!activeDoc) {
            return
        }
        requestMgr.executeReq(requestMgr.createReq(ClearTestShapesReq), true)
        setToast('已清空当前测试图形')
    }
}

function updateCursorFromPointer(evt: PointerEvent) {
    if (!mountNode) {
        return
    }

    const canvas = app.getCanvas()
    if (!canvas) {
        return
    }

    const rect = mountNode.getBoundingClientRect()
    const localPos = new Vec2(evt.clientX - rect.left, evt.clientY - rect.top)
    const world = canvas.screenToWorld(localPos)
    state.cursorWorld = { x: world.x, y: world.y }
    emitState()
}

function clearCursor() {
    state.cursorWorld = null
    emitState()
}

function bindCanvasEvents() {
    if (!mountNode) {
        return
    }

    mountNode.addEventListener('pointermove', updateCursorFromPointer)
    mountNode.addEventListener('pointerleave', clearCursor)
    window.addEventListener('keydown', evt => {
        if (evt.key === 'Escape') {
            cancelActiveCommand()
        }
    })
}

export function subscribePlayground(listener: (state: PlaygroundState) => void) {
    subscribers.add(listener)
    listener({
        cursorWorld: state.cursorWorld ? { ...state.cursorWorld } : null,
        toast: state.toast,
        drawing: {
            ...state.drawing,
            steps: [...state.drawing.steps],
        },
    })
    return () => subscribers.delete(listener)
}

export function bootstrapPlayground(mount: HTMLElement) {
    mountNode = mount
    if (canvasBootstrapped) {
        return
    }

    const doc = new Document()
    activeDoc = doc
    app.start(doc)
    app.createCanvas(mount)
    bindCanvasEvents()
    canvasBootstrapped = true
    loadEngineeringDemo()
    emitState()
}

export async function armTool(kind: ShapeKind) {
    while (cmdMgr.getCurrentCmd()) {
        cmdMgr.resetAllActions()
        await new Promise(resolve => window.setTimeout(resolve, 16))
    }

    updateDrawingStatus(kind, 0)
    setToast(`${toolMeta[kind].label}已启动`)

    let Ctor: typeof Cmd
    if (kind === 'line') {
        Ctor = DrawLineCmd
    } else if (kind === 'circle') {
        Ctor = DrawCircleCmd
    } else if (kind === 'arc') {
        Ctor = DrawArcCmd
    } else if (kind === 'ellipse') {
        Ctor = DrawEllipseCmd
    } else if (kind === 'ellipseArc') {
        Ctor = DrawEllipseArcCmd
    } else {
        Ctor = DrawBSplineCmd
    }

    await cmdMgr.sendCmd(Ctor)
}

export function insertRandomPolygon() {
    requestMgr.executeReq(requestMgr.createReq(DrawRandomPolygonReq, createRandomPolygon()), true)
    setToast('已插入一组测试轮廓')
}

export function loadEngineeringDemo() {
    requestMgr.executeReq(requestMgr.createReq(ClearTestShapesReq), true)
    requestMgr.executeReq(requestMgr.createReq(LoadEngineeringDemoReq), true)
    resetDrawingStatus('已加载工程图图框与两组投影视图，可继续叠加绘制。')
    setToast('工程图演示已加载')
}

export function clearAllShapes() {
    void cmdMgr.sendCmd(ClearShapesCmd)
}

export function cancelActiveCommand() {
    cmdMgr.resetAllActions()
    resetDrawingStatus('命令已取消，请重新选择工具。')
    setToast('已取消当前命令')
}
