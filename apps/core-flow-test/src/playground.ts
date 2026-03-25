import {
    ArcElement,
    BSplineElement,
    CircleElement,
    CreateArcRequest,
    CreateBSplineRequest,
    CreateCircleRequest,
    CreateEllipseArcRequest,
    CreateEllipseRequest,
    CreateLineRequest,
    CreatePolylineRequest,
    CreateRectLineRequest,
    EllipseArcElement,
    EllipseElement,
    LineElement,
    PolyLineElement,
    RectLineElement,
} from '@ccpc/editor_sdk'
import {
    EN_AnchorX,
    EN_AnchorY,
    Document,
    Element,
    GCurve2d,
    GNode,
    GPoint2d,
    GPolycurve,
    GPolygon,
    GRep,
    GText2d,
    RegisterElement,
    Request,
    TmpElementPainter,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import type { IMouseEvent } from '@ccpc/canvas'
import { Arc2, Coord2, Ln2, Loop, NurbsCurve2, Plane, Polygon, PolyCurve, Vec2 } from '@ccpc/math'
import { app, Cmd, cmdMgr, PickPointAction, PickPointContext, registerCmd } from '@ccpc/platform'
import type { IPickedResult } from '@ccpc/platform'

export type ShapeKind = 'line' | 'polyline' | 'rectLine' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'
export type ToolId = ShapeKind | 'polygon' | 'demo' | 'styleDemo' | 'clear'

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
    polyline: { label: '绘制折线', accent: '#22c55e', subtitle: '依次拾取多个折线点' },
    rectLine: { label: '绘制矩形', accent: '#f59e0b', subtitle: '通过两个角点生成矩形' },
    line: { label: '绘制直线', accent: '#38bdf8', subtitle: '两点定义线段' },
    circle: { label: '绘制圆', accent: '#60a5fa', subtitle: '圆心加半径点' },
    arc: { label: '绘制圆弧', accent: '#fb923c', subtitle: '三点定义圆弧' },
    ellipse: { label: '绘制椭圆', accent: '#34d399', subtitle: '中心加长短轴点' },
    ellipseArc: { label: '绘制椭圆弧', accent: '#4ade80', subtitle: '五点拟合椭圆弧' },
    bspline: { label: '绘制 B 样条', accent: '#f472b6', subtitle: '四点控制点样条' },
    polygon: { label: '插入轮廓', accent: '#a78bfa', subtitle: '插入随机测试轮廓' },
    demo: { label: '加载图框', accent: '#fbbf24', subtitle: '显示工程图图框与投影视图' },
    styleDemo: { label: '样式测试', accent: '#22d3ee', subtitle: '验证 style 机制链路' },
    clear: { label: '清空画布', accent: '#f87171', subtitle: '删除当前测试图形' },
}

const shapePointCount: Record<ShapeKind, number> = {
    line: 2,
    polyline: 4,
    rectLine: 2,
    circle: 2,
    arc: 3,
    ellipse: 3,
    ellipseArc: 5,
    bspline: 4,
}

const minShapePointCount: Record<ShapeKind, number> = {
    ...shapePointCount,
    bspline: 4,
}

const shapeSteps: Record<ShapeKind, string[]> = {
    polyline: ['点击第 1 个点', '点击第 2 个点', '点击第 3 个点', '点击第 4 个点'],
    rectLine: ['点击第一个角点', '点击第二个角点'],
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

const engineeringSheetFrame = {
    minX: -560,
    maxX: 560,
    minY: -380,
    maxY: 380,
}

function countDistinctPoints(points: Vec2[], eps = 1e-6) {
    const distinct: Vec2[] = []
    for (const point of points) {
        if (!distinct.some(item => item.distanceTo(point) <= eps)) {
            distinct.push(point)
        }
    }
    return distinct.length
}

function getCanvasWorkPlaneApi() {
    return app.getCanvas() as unknown as {
        screenToWorkPlane: (pos: Vec2) => { x: number, y: number, z: number }
    }
}

function syncHighLight(gnode?: GNode) {
    if (!activeDoc) {
        return
    }

    if (!gnode) {
        app.highLight.clear()
    } else {
        app.highLight.reset([gnode])
    }
    activeDoc.updateView()
}

function syncSelection(gnode?: GNode) {
    if (!activeDoc) {
        return
    }

    if (!gnode) {
        app.selection.clear()
    } else {
        app.selection.reset([gnode])
    }
    activeDoc.updateView()
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
    source.children.forEach(node => target.addNode(node))
}

function addLine(grep: GRep, start: Vec2, end: Vec2) {
    grep.addNode(new GCurve2d(Plane.XOY(), new Ln2(start, end)))
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
        Plane.XOY(),
        new Arc2(new Coord2(center, Vec2.X()), radius, radius, true, [0, Math.PI * 2]),
    ))
}

function addText(grep: GRep, text: string, position: Vec2) {
    grep.addNode(new GText2d(text, Plane.XOY(), position))
}

function addStyledText(grep: GRep, text: string, position: Vec2, fontSize = 16, color = '#d7e3f4') {
    const node = new GText2d(text, Plane.XOY(), position)
    node.setStyle({
        text: {
            color,
            fontSize,
        },
    })
    grep.addNode(node)
}

function addFilledRect(grep: GRep, lb: Vec2, rt: Vec2, color: string, opacity = 0.18) {
    const face = new GPolygon(Plane.XOY(), Polygon.createByRectangle(lb, rt))
    face.setStyle({
        face: {
            color,
            opacity,
        },
    })
    grep.addNode(face)
}

function addStyledLine(grep: GRep, start: Vec2, end: Vec2, color: string, width = 2, opacity = 1) {
    const node = new GCurve2d(Plane.XOY(), new Ln2(start, end))
    node.setStyle({
        line: {
            color,
            width,
            opacity,
        },
    })
    grep.addNode(node)
}

function addCenterMark(grep: GRep, center: Vec2, radius: number) {
    addCircle(grep, center, radius)
    addStyledLine(grep, new Vec2(center.x - radius - 18, center.y), new Vec2(center.x + radius + 18, center.y), '#cbd5e1', 1.2, 0.85)
    addStyledLine(grep, new Vec2(center.x, center.y - radius - 18), new Vec2(center.x, center.y + radius + 18), '#cbd5e1', 1.2, 0.85)
}

function addHatchRect(grep: GRep, lb: Vec2, rt: Vec2, spacing = 14, color = '#cbd5e1') {
    const width = rt.x - lb.x
    const height = rt.y - lb.y
    for (let offset = -height; offset <= width; offset += spacing) {
        const startX = Math.max(lb.x, lb.x + offset)
        const startY = Math.max(lb.y, lb.y - offset)
        const endX = Math.min(rt.x, lb.x + offset + height)
        const endY = Math.min(rt.y, lb.y - offset + width)
        if (endX - startX < 1 || endY - startY < 1) {
            continue
        }
        addStyledLine(grep, new Vec2(startX, startY), new Vec2(endX, endY), color, 1, 0.75)
    }
}

function getEllipseControlPoints(points: Vec2[]) {
    if (points.length < 2) {
        return undefined
    }

    const center = points[0]
    const majorPoint = points[1]
    const majorVector = majorPoint.subtracted(center)
    const majorRadius = majorVector.getLength()
    if (majorRadius <= 1e-6) {
        return undefined
    }

    const majorDir = majorVector.normalized()
    const minorDir = new Vec2(-majorDir.y, majorDir.x)
    const rawMinorPoint = points[2] ?? majorPoint
    const signedMinorRadius = rawMinorPoint.subtracted(center).dot(minorDir)
    const minorRadius = Math.abs(signedMinorRadius)
    if (minorRadius <= 1e-6) {
        return undefined
    }

    return {
        center,
        majorPoint,
        majorPointMirror: center.subtracted(majorVector),
        minorPoint: center.added(minorDir.multiplied(signedMinorRadius)),
        minorPointMirror: center.added(minorDir.multiplied(-signedMinorRadius)),
        majorRadius,
        minorRadius,
        majorVector,
    }
}

function createEllipseCurveFromControls(controls: ReturnType<typeof getEllipseControlPoints>, range?: [number, number]) {
    if (!controls) {
        return undefined
    }

    return new Arc2(
        new Coord2(controls.center, controls.majorVector),
        controls.majorRadius,
        controls.minorRadius,
        true,
        range ?? [0, Math.PI * 2],
    )
}

function projectPointToEllipse(curve: Arc2, point: Vec2) {
    return curve.getPtAt(curve.getParamAt(point))
}

function getEllipseArcControlPoints(points: Vec2[]) {
    const ellipseControls = getEllipseControlPoints(points.slice(0, 3))
    const ellipse = createEllipseCurveFromControls(ellipseControls)
    if (!ellipseControls || !ellipse) {
        return undefined
    }

    const rawStartPoint = points[3] ?? ellipseControls.majorPoint
    const startPoint = projectPointToEllipse(ellipse, rawStartPoint)
    const rawEndPoint = points[4] ?? startPoint
    const endPoint = projectPointToEllipse(ellipse, rawEndPoint)

    return {
        ...ellipseControls,
        ellipse,
        startPoint,
        endPoint,
    }
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
        const controls = getEllipseControlPoints(points)
        if (!controls) {
            return undefined
        }
        return createEllipseCurveFromControls(controls)
    }

    if (kind === 'bspline') {
        if (points.length < 2 || countDistinctPoints(points) < 2) {
            return undefined
        }
        return NurbsCurve2.makeByControlPoints(points, Math.min(3, points.length - 1))
    }

    const controls = getEllipseArcControlPoints(points)
    if (!controls) {
        return undefined
    }

    if (points.length < 5) {
        return controls.ellipse
    }

    return Arc2.makeEllipseByFivePoints(
        controls.center,
        controls.majorPoint,
        controls.minorPoint,
        controls.startPoint,
        controls.endPoint,
    )
}

function buildShapeGRep(kind: ShapeKind, points: Vec2[]) {
    const grep = new GRep()
    const plane = Plane.XOY()

    if (kind === 'polyline') {
        if (points.length >= 2) {
            grep.addNode(new GPolycurve(plane, new PolyCurve(points)))
        }
        return grep
    }

    if (kind === 'rectLine') {
        if (points.length >= 2) {
            grep.addNode(new GPolycurve(plane, Loop.createByRectangle(points[0], points[1])))
        }
        return grep
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
    const plane = Plane.XOY()
    for (let i = 0; i < points.length; i += 1) {
        const point = new GPoint2d(plane, points[i].clone())
        point.setStyle({
            point: {
                color: 0xffffff,
                size: 8,
            },
        })
        grep.addNode(point)
        if (i > 0) {
            const line = new GCurve2d(plane, new Ln2(points[i - 1], points[i]))
            line.setStyle({
                line: {
                    color: 0xffffff,
                    width: 2,
                },
            })
            grep.addNode(line)
        }
    }
    return grep
}

function buildEllipseGuideGRep(points: Vec2[]) {
    const controls = getEllipseControlPoints(points)
    if (!controls) {
        return buildHelperGRep(points)
    }

    const grep = new GRep()
    const plane = Plane.XOY()
    grep.addNode(new GCurve2d(plane, new Ln2(controls.majorPointMirror, controls.majorPoint)))
    grep.addNode(new GCurve2d(plane, new Ln2(controls.minorPointMirror, controls.minorPoint)))
    grep.addNode(new GPoint2d(plane, controls.center.clone()))
    grep.addNode(new GPoint2d(plane, controls.majorPoint.clone()))
    grep.addNode(new GPoint2d(plane, controls.minorPoint.clone()))
    return grep
}

function buildEllipseArcGuideGRep(points: Vec2[]) {
    const controls = getEllipseArcControlPoints(points)
    if (!controls) {
        return buildHelperGRep(points)
    }

    const grep = new GRep()
    const plane = Plane.XOY()
    grep.addNode(new GCurve2d(plane, new Ln2(controls.majorPointMirror, controls.majorPoint)))
    grep.addNode(new GCurve2d(plane, new Ln2(controls.minorPointMirror, controls.minorPoint)))
    grep.addNode(new GPoint2d(plane, controls.center.clone()))
    grep.addNode(new GPoint2d(plane, controls.majorPoint.clone()))
    grep.addNode(new GPoint2d(plane, controls.minorPoint.clone()))
    if (points.length >= 4) {
        grep.addNode(new GCurve2d(plane, new Ln2(controls.center, controls.startPoint)))
        grep.addNode(new GPoint2d(plane, controls.startPoint.clone()))
    }
    if (points.length >= 5) {
        grep.addNode(new GCurve2d(plane, new Ln2(controls.center, controls.endPoint)))
        grep.addNode(new GPoint2d(plane, controls.endPoint.clone()))
    }
    return grep
}

function buildShapePreviewGRep(kind: ShapeKind, fixedPoints: Vec2[], cursor?: Vec2) {
    const previewPoints = clonePoints(fixedPoints)
    if (cursor && (kind === 'bspline' || previewPoints.length < shapePointCount[kind])) {
        previewPoints.push(cursor.clone())
    }

    const grep = new GRep()
    appendGRep(grep, buildShapeGRep(kind, previewPoints))
    if (kind === 'ellipse') {
        appendGRep(grep, buildEllipseGuideGRep(previewPoints))
    } else if (kind === 'ellipseArc') {
        appendGRep(grep, buildEllipseArcGuideGRep(previewPoints))
    } else {
        appendGRep(grep, buildHelperGRep(previewPoints))
    }
    return grep
}

function executeCreateShapeRequest(kind: ShapeKind, points: Vec2[]) {
    if (kind === 'line') {
        return requestMgr.executeReq(requestMgr.createReq(CreateLineRequest, points[0], points[1]), true)
    }

    if (kind === 'polyline') {
        return requestMgr.executeReq(requestMgr.createReq(CreatePolylineRequest, clonePoints(points)), true)
    }

    if (kind === 'rectLine') {
        return requestMgr.executeReq(requestMgr.createReq(CreateRectLineRequest, points[0], points[1]), true)
    }

    if (kind === 'circle') {
        const radius = points[0].distanceTo(points[1])
        return requestMgr.executeReq(requestMgr.createReq(CreateCircleRequest, points[0], radius), true)
    }

    if (kind === 'arc') {
        const arc = Arc2.makeArcByThreePoints(points[0], points[1], points[2])
        if (!arc) {
            return undefined
        }

        return requestMgr.executeReq(
            requestMgr.createReq(
                CreateArcRequest,
                arc.getCenter(),
                arc.getRadius(),
                arc.getStartAngle(),
                arc.getEndAngle(),
                arc.isCCW(),
            ),
            true,
        )
    }

    if (kind === 'ellipse') {
        const controls = getEllipseControlPoints(points)
        if (!controls) {
            return undefined
        }

        return requestMgr.executeReq(
            requestMgr.createReq(
                CreateEllipseRequest,
                controls.center,
                controls.majorVector.normalized(),
                controls.majorRadius,
                controls.minorRadius,
            ),
            true,
        )
    }

    if (kind === 'ellipseArc') {
        const arc = createShapeCurve(kind, points)
        if (!(arc instanceof Arc2)) {
            return undefined
        }

        return requestMgr.executeReq(
            requestMgr.createReq(
                CreateEllipseArcRequest,
                arc.getCenter(),
                arc.getCoord().getDx(),
                arc.getA(),
                arc.getB(),
                arc.getStartParam(),
                arc.getEndParam(),
                arc.isCCW(),
            ),
            true,
        )
    }

    return requestMgr.executeReq(
        requestMgr.createReq(
            CreateBSplineRequest,
            clonePoints(points),
            Math.min(3, points.length - 1),
        ),
        true,
    )
}

function normalizeShapePoint(kind: ShapeKind, fixedPoints: Vec2[], point: Vec2) {
    if (kind === 'ellipse') {
        if (fixedPoints.length !== 2) {
            return point
        }

        const controls = getEllipseControlPoints([...fixedPoints, point])
        return controls?.minorPoint ?? point
    }

    if (kind === 'ellipseArc') {
        if (fixedPoints.length === 2) {
            const controls = getEllipseControlPoints([...fixedPoints, point])
            return controls?.minorPoint ?? point
        }

        if (fixedPoints.length >= 3) {
            const controls = getEllipseArcControlPoints([...fixedPoints, point])
            if (fixedPoints.length === 3) {
                return controls?.startPoint ?? point
            }
            if (fixedPoints.length === 4) {
                return controls?.endPoint ?? point
            }
        }
    }

    return point
}

function createRandomPolygon() {
    const center = new Vec2(Math.random() * 420 - 210, Math.random() * 260 - 130)
    const width = 180 + Math.random() * 140
    const height = 110 + Math.random() * 120
    const radius = Math.min(width, height) * 0.18
    const loop = new Loop([
        new Ln2(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5 - radius, center.y - height * 0.5), new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), true),
        new Ln2(new Vec2(center.x + width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), true),
        new Ln2(new Vec2(center.x + width * 0.5 - radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5 + radius, center.y + height * 0.5), new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), true),
        new Ln2(new Vec2(center.x - width * 0.5, center.y + height * 0.5 - radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius)),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5, center.y - height * 0.5 + radius), new Vec2(center.x - width * 0.5 + radius, center.y - height * 0.5), true),
    ])

    const polygon = new Polygon()
    polygon.addLoop(loop.rotate((Math.random() - 0.5) * Math.PI * 0.7, center), false)
    return polygon
}

function buildPolygonGRep(polygon: Polygon) {
    const grep = new GRep()
    grep.addNode(new GPolygon(Plane.XOY(), polygon))
    return grep
}

function buildEngineeringSheetGRep() {
    const grep = new GRep()

    addRect(grep, new Vec2(0, 0), 1120, 760)
    addRect(grep, new Vec2(0, 0), 1080, 720)

    // Main view
    addRect(grep, new Vec2(-220, 20), 256, 210)
    addRect(grep, new Vec2(-220, 20), 164, 116)
    addRect(grep, new Vec2(-272, 60), 60, 34)
    addRect(grep, new Vec2(-272, -20), 60, 34)
    addLine(grep, new Vec2(-348, 20), new Vec2(-92, 20))
    addLine(grep, new Vec2(-220, -86), new Vec2(-220, 124))
    addLine(grep, new Vec2(-302, 78), new Vec2(-138, 78))
    addLine(grep, new Vec2(-302, -38), new Vec2(-138, -38))
    addLine(grep, new Vec2(-302, -20), new Vec2(-302, 60))
    addLine(grep, new Vec2(-138, -20), new Vec2(-138, 60))
    addCenterMark(grep, new Vec2(-220, 20), 28)
    addStyledLine(grep, new Vec2(-156, 120), new Vec2(-156, -82), '#fbbf24', 1.2, 0.9)
    addStyledLine(grep, new Vec2(-284, 120), new Vec2(-284, -82), '#fbbf24', 1.2, 0.9)
    addStyledText(grep, 'A', new Vec2(-284, 136), 16, '#fbbf24')
    addStyledText(grep, 'A', new Vec2(-156, 136), 16, '#fbbf24')

    // Top view
    addRect(grep, new Vec2(-220, 248), 164, 120)
    addRect(grep, new Vec2(-220, 248), 92, 74)
    addLine(grep, new Vec2(-302, 216), new Vec2(-138, 216))
    addLine(grep, new Vec2(-302, 280), new Vec2(-138, 280))
    addLine(grep, new Vec2(-262, 188), new Vec2(-262, 308))
    addLine(grep, new Vec2(-178, 188), new Vec2(-178, 308))
    addCenterMark(grep, new Vec2(-220, 248), 22)

    // Right view
    addRect(grep, new Vec2(120, 34), 196, 180)
    addRect(grep, new Vec2(120, 34), 132, 92)
    addLine(grep, new Vec2(22, 84), new Vec2(218, 84))
    addLine(grep, new Vec2(22, -16), new Vec2(218, -16))
    addLine(grep, new Vec2(70, -56), new Vec2(70, 124))
    addLine(grep, new Vec2(170, -56), new Vec2(170, 124))
    addCenterMark(grep, new Vec2(120, 34), 24)

    // Section A-A
    addRect(grep, new Vec2(120, 248), 218, 140)
    addFilledRect(grep, new Vec2(31, 198), new Vec2(209, 298), '#94a3b8', 0.12)
    addHatchRect(grep, new Vec2(31, 198), new Vec2(209, 298), 14, '#cbd5e1')
    addRect(grep, new Vec2(87, 248), 36, 64)
    addRect(grep, new Vec2(153, 248), 36, 64)
    addLine(grep, new Vec2(31, 248), new Vec2(209, 248))
    addStyledText(grep, '剖面 A-A', new Vec2(120, 160), 16)

    addStyledText(grep, '主视图', new Vec2(-220, -118), 16)
    addStyledText(grep, '俯视图', new Vec2(-220, 166), 16)
    addStyledText(grep, '右视图', new Vec2(120, -98), 16)

    // Professional title block at the lower-right corner.
    const x0 = 180
    const x1 = 240
    const x2 = 330
    const x3 = 420
    const x4 = 520
    const y0 = -340
    const y1 = -300
    const y2 = -260
    const y3 = -220
    const y4 = -160

    addRect(grep, new Vec2((x0 + x4) * 0.5, (y0 + y4) * 0.5), x4 - x0, y4 - y0)
    addLine(grep, new Vec2(x1, y0), new Vec2(x1, y4))
    addLine(grep, new Vec2(x2, y0), new Vec2(x2, y4))
    addLine(grep, new Vec2(x3, y0), new Vec2(x3, y4))
    addLine(grep, new Vec2(x0, y1), new Vec2(x4, y1))
    addLine(grep, new Vec2(x0, y2), new Vec2(x4, y2))
    addLine(grep, new Vec2(x0, y3), new Vec2(x4, y3))

    // Merge the upper-right cells for the drawing title.
    addLine(grep, new Vec2(x2, y3), new Vec2(x4, y3))
    addLine(grep, new Vec2(x2, y2), new Vec2(x4, y2))
    addLine(grep, new Vec2(x2, y1), new Vec2(x4, y1))

    addText(grep, '设计', new Vec2((x0 + x1) * 0.5, (y3 + y4) * 0.5))
    addText(grep, '校核', new Vec2((x0 + x1) * 0.5, (y2 + y3) * 0.5))
    addText(grep, '批准', new Vec2((x0 + x1) * 0.5, (y1 + y2) * 0.5))
    addText(grep, '日期', new Vec2((x0 + x1) * 0.5, (y0 + y1) * 0.5))

    addText(grep, '王工', new Vec2((x1 + x2) * 0.5, (y3 + y4) * 0.5))
    addText(grep, '李工', new Vec2((x1 + x2) * 0.5, (y2 + y3) * 0.5))
    addText(grep, '张工', new Vec2((x1 + x2) * 0.5, (y1 + y2) * 0.5))
    addText(grep, '2026-03-16', new Vec2((x1 + x2) * 0.5, (y0 + y1) * 0.5))

    addText(grep, '支架总成工程图', new Vec2((x2 + x4) * 0.5, (y3 + y4) * 0.5))
    addText(grep, '材质  Q235-B', new Vec2((x2 + x3) * 0.5, (y2 + y3) * 0.5))
    addText(grep, '比例  1:2', new Vec2((x3 + x4) * 0.5, (y2 + y3) * 0.5))
    addText(grep, '单位  mm', new Vec2((x2 + x3) * 0.5, (y1 + y2) * 0.5))
    addText(grep, '图号  A-1024', new Vec2((x3 + x4) * 0.5, (y1 + y2) * 0.5))
    addText(grep, '阶段  方案评审', new Vec2((x2 + x3) * 0.5, (y0 + y1) * 0.5))
    addText(grep, '页次  1 / 1', new Vec2((x3 + x4) * 0.5, (y0 + y1) * 0.5))

    return grep
}

function assertStyle(title: string, condition: boolean, payload?: unknown) {
    console.assert(condition, `[style-demo] ${title}`, payload)
    if (!condition) {
        console.error(`[style-demo] ${title}`, payload)
    }
}

function buildStyleDemoGRep() {
    const grep = new GRep()

    addText(grep, 'Style Mechanism Demo', new Vec2(-420, 310))
    addText(grep, 'default', new Vec2(-360, 230))
    addText(grep, 'local style', new Vec2(-40, 230))
    addText(grep, 'inherit', new Vec2(290, 230))

    const pointDefault = new GPoint2d(Plane.XOY(), new Vec2(-360, 140))
    const pointLocal = new GPoint2d(Plane.XOY(), new Vec2(-40, 140))
    pointLocal.setStyle({
        point: {
            color: '#ef4444',
            size: 16,
            opacity: 0.45,
        },
    })
    const pointParent = new GRep().setStyle({
        point: {
            color: '#06b6d4',
            size: 20,
            opacity: 0.55,
        },
    })
    pointParent.addNode(new GPoint2d(Plane.XOY(), new Vec2(290, 140)))
    grep.addNode(pointDefault)
    grep.addNode(pointLocal)
    grep.addNode(pointParent)

    const lineDefault = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(-420, 40), new Vec2(-300, 40)))
    const lineLocal = new GCurve2d(Plane.XOY(), new Ln2(new Vec2(-100, 40), new Vec2(20, 40)))
    lineLocal.setStyle({
        line: {
            color: '#22c55e',
            width: 6,
            opacity: 0.4,
        },
    })
    const lineParent = new GRep().setStyle({
        line: {
            color: '#f59e0b',
            width: 10,
            opacity: 0.65,
        },
    })
    lineParent.addNode(new GCurve2d(Plane.XOY(), new Ln2(new Vec2(230, 40), new Vec2(350, 40))))
    grep.addNode(lineDefault)
    grep.addNode(lineLocal)
    grep.addNode(lineParent)

    const polygonDefault = new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(-420, -130), new Vec2(-300, -40)))
    const polygonLocal = new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(-100, -130), new Vec2(20, -40)))
    polygonLocal.setStyle({
        face: {
            color: '#3b82f6',
            opacity: 0.42,
        },
    })
    const polygonParent = new GRep().setStyle({
        face: {
            color: '#8b5cf6',
            opacity: 0.58,
        },
    })
    polygonParent.addNode(new GPolygon(Plane.XOY(), Polygon.createByRectangle(new Vec2(230, -130), new Vec2(350, -40))))
    grep.addNode(polygonDefault)
    grep.addNode(polygonLocal)
    grep.addNode(polygonParent)

    const textDefault = new GText2d('Default text', Plane.XOY(), new Vec2(-360, -245))
    const textLocal = new GText2d('Styled text', Plane.XOY(), new Vec2(-40, -245))
    textLocal.setStyle({
        text: {
            color: '#f97316',
            fontSize: 28,
            anchorX: EN_AnchorX.Left,
            anchorY: EN_AnchorY.Top,
        },
    })
    const textParent = new GRep().setStyle({
        text: {
            color: '#14b8a6',
            fontSize: 24,
            anchorX: EN_AnchorX.Right,
            anchorY: EN_AnchorY.Bottom,
        },
    })
    textParent.addNode(new GText2d('Inherited text', Plane.XOY(), new Vec2(290, -245)))
    grep.addNode(textDefault)
    grep.addNode(textLocal)
    grep.addNode(textParent)

    const pointLocalStyle = pointLocal.toRenderNode().style.point
    assertStyle('point local style applied', pointLocalStyle?.color === '#ef4444'
        && pointLocalStyle?.size === 16
        && pointLocalStyle?.opacity === 0.45, pointLocalStyle)

    const pointInheritedStyle = pointParent.children[0].toRenderNode().style.point
    assertStyle('point inherited style applied', pointInheritedStyle?.color === '#06b6d4'
        && pointInheritedStyle?.size === 20
        && pointInheritedStyle?.opacity === 0.55, pointInheritedStyle)

    const lineLocalStyle = lineLocal.toRenderNode().style.line
    assertStyle('line local style applied', lineLocalStyle?.color === '#22c55e'
        && lineLocalStyle?.width === 6
        && lineLocalStyle?.opacity === 0.4, lineLocalStyle)

    const lineInheritedStyle = lineParent.children[0].toRenderNode().style.line
    assertStyle('line inherited style applied', lineInheritedStyle?.color === '#f59e0b'
        && lineInheritedStyle?.width === 10
        && lineInheritedStyle?.opacity === 0.65, lineInheritedStyle)

    const faceLocalStyle = polygonLocal.toRenderNode().style.face
    assertStyle('face local style applied', faceLocalStyle?.color === '#3b82f6'
        && faceLocalStyle?.opacity === 0.42, faceLocalStyle)

    const faceInheritedStyle = polygonParent.children[0].toRenderNode().style.face
    assertStyle('face inherited style applied', faceInheritedStyle?.color === '#8b5cf6'
        && faceInheritedStyle?.opacity === 0.58, faceInheritedStyle)

    const textLocalStyle = textLocal.toRenderNode().style.text
    assertStyle('text local style applied', textLocalStyle?.color === '#f97316'
        && textLocalStyle?.fontSize === 28
        && textLocalStyle?.anchorX === EN_AnchorX.Left
        && textLocalStyle?.anchorY === EN_AnchorY.Top, textLocalStyle)

    const textInheritedStyle = textParent.children[0].toRenderNode().style.text
    assertStyle('text inherited style applied', textInheritedStyle?.color === '#14b8a6'
        && textInheritedStyle?.fontSize === 24
        && textInheritedStyle?.anchorX === EN_AnchorX.Right
        && textInheritedStyle?.anchorY === EN_AnchorY.Bottom, textInheritedStyle)

    addText(grep, 'Anchor Probe', new Vec2(-420, -340))

    const anchorCenter = new Vec2(260, -350)
    const guideColor = '#64748b'
    const guideLineStyle = {
        line: {
            color: guideColor,
            width: 1,
            opacity: 0.75,
        },
    }
    const guidePointStyle = {
        point: {
            color: '#e2e8f0',
            size: 6,
            opacity: 1,
        },
    }
    const guideTextStyle = {
        text: {
            color: '#94a3b8',
            fontSize: 14,
        },
    }

    const horizontalGuide = new GCurve2d(Plane.XOY(), new Ln2(
        new Vec2(anchorCenter.x - 170, anchorCenter.y),
        new Vec2(anchorCenter.x + 170, anchorCenter.y),
    ))
    horizontalGuide.setStyle(guideLineStyle)
    grep.addNode(horizontalGuide)

    const verticalGuide = new GCurve2d(Plane.XOY(), new Ln2(
        new Vec2(anchorCenter.x, anchorCenter.y - 120),
        new Vec2(anchorCenter.x, anchorCenter.y + 120),
    ))
    verticalGuide.setStyle(guideLineStyle)
    grep.addNode(verticalGuide)

    const centerPoint = new GPoint2d(Plane.XOY(), anchorCenter.clone())
    centerPoint.setStyle(guidePointStyle)
    grep.addNode(centerPoint)

    const centerLabel = new GText2d('cross = shared anchor point', Plane.XOY(), new Vec2(anchorCenter.x - 150, anchorCenter.y + 132))
    centerLabel.setStyle(guideTextStyle)
    grep.addNode(centerLabel)

    const anchorSpecs: Array<{
        label: string
        pos: Vec2
        anchorX: EN_AnchorX
        anchorY: EN_AnchorY
        color: string
    }> = [
            {
                label: 'Left / Top',
                pos: new Vec2(anchorCenter.x - 120, anchorCenter.y + 80),
                anchorX: EN_AnchorX.Left,
                anchorY: EN_AnchorY.Top,
                color: '#f97316',
            },
            {
                label: 'Center / Middle',
                pos: new Vec2(anchorCenter.x, anchorCenter.y),
                anchorX: EN_AnchorX.Center,
                anchorY: EN_AnchorY.Middle,
                color: '#22c55e',
            },
            {
                label: 'Right / Bottom',
                pos: new Vec2(anchorCenter.x + 120, anchorCenter.y - 80),
                anchorX: EN_AnchorX.Right,
                anchorY: EN_AnchorY.Bottom,
                color: '#38bdf8',
            },
        ]

    anchorSpecs.forEach(spec => {
        const probe = new GText2d(spec.label, Plane.XOY(), spec.pos)
        probe.setStyle({
            text: {
                color: spec.color,
                fontSize: 20,
                anchorX: spec.anchorX,
                anchorY: spec.anchorY,
            },
        })
        grep.addNode(probe)

        const probeStyle = probe.toRenderNode().style.text
        assertStyle(`anchor probe ${spec.label}`, probeStyle?.anchorX === spec.anchorX
            && probeStyle?.anchorY === spec.anchorY
            && probeStyle?.color === spec.color
            && probeStyle?.fontSize === 20, probeStyle)
    })

    return grep
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

@RegisterElement('style-demo-element')
class StyleDemoElement extends Element {
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

@registerRequest('load-style-demo')
class LoadStyleDemoReq extends Request {
    public execute() {
        const element = this._doc.create(StyleDemoElement)
        element.name = nextShapeName('styleDemo')
        element.setGRep(buildStyleDemoGRep())
        return element
    }
}

@registerRequest('clear-test-shapes')
class ClearTestShapesReq extends Request {
    public execute() {
        const ids = this._doc.elementMgr
            .getAllElements()
            .filter(element =>
                element instanceof LineElement ||
                element instanceof PolyLineElement ||
                element instanceof RectLineElement ||
                element instanceof CircleElement ||
                element instanceof ArcElement ||
                element instanceof EllipseElement ||
                element instanceof EllipseArcElement ||
                element instanceof BSplineElement ||
                element instanceof RandomPolygonElement ||
                element instanceof EngineeringSheetElement ||
                element instanceof StyleDemoElement)
            .map(element => element.id)

        if (ids.length > 0) {
            this._doc.deleteElementsById(...ids)
        }
    }
}

@registerCmd('draw-line-cmd')
class DrawLineCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'line'

    private readonly _previewPainterIndex = 1

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        this.clearUsersTmpElementPainters()
        this.applyNewTmpElementPainter()
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        const firstAction = new PickPointAction(new PickPointContext({
            movingCallBack: result => {
                this._currentPoint = new Vec2(result.point.x, result.point.y)
                this._renderPreview()
            },
        }))
        firstAction.getPickContext().highlightPickedGNodes = true
        const firstPick = await this.runAction(firstAction)
        if (!firstPick?.isSuccess || !firstPick.data) {
            this.cancel()
            return
        }

        const firstPoint = new Vec2(firstPick.data.point.x, firstPick.data.point.y)
        this._fixedPoints = [firstPoint]
        this._currentPoint = firstPoint.clone()
        updateDrawingStatus(this._kind, 1)
        const snapContext = firstAction.getSnapContext()
        snapContext.previousPoint = firstPoint.clone()
        this._renderPreview()

        const secondAction = new PickPointAction(new PickPointContext({
            snapContext,
            movingCallBack: result => {
                this._currentPoint = new Vec2(result.point.x, result.point.y)
                this._renderPreview()
            },
        }))
        secondAction.getPickContext().highlightPickedGNodes = true
        const secondPick = await this.runAction(secondAction)
        if (!secondPick?.isSuccess || !secondPick.data) {
            this.cancel()
            return
        }

        const secondPoint = new Vec2(secondPick.data.point.x, secondPick.data.point.y)
        this._fixedPoints.push(secondPoint)
        this._currentPoint = secondPoint.clone()

        const element = executeCreateShapeRequest(this._kind, this._fixedPoints)
        setToast(element ? `${toolMeta[this._kind].label}已完成，可继续绘制` : `${toolMeta[this._kind].label}创建失败`)
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.clearUsersTmpElementPainters()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = new GRep()
        const plane = Plane.XOY()
        if (this._fixedPoints.length === 0 && this._currentPoint) {
            grep.addNode(new GPoint2d(plane, this._currentPoint.clone()))
        } else if (this._fixedPoints.length >= 1) {
            grep.addNode(new GPoint2d(plane, this._fixedPoints[0].clone()))
            if (this._currentPoint) {
                grep.addNode(new GCurve2d(plane, new Ln2(this._fixedPoints[0], this._currentPoint)))
                grep.addNode(new GPoint2d(plane, this._currentPoint.clone()))
            }
        }
        this.drawTmpGRep(grep, this._previewPainterIndex)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._currentPoint = undefined
        this.clearTmp()
    }
}

@registerCmd('draw-polyline-cmd')
class DrawPolylineCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'polyline'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        let snapContext: ReturnType<PickPointAction['getSnapContext']> | undefined
        while (this._fixedPoints.length < shapePointCount[this._kind]) {
            const pick = await this._pickPoint(snapContext)
            if (!pick) {
                this.cancel()
                return
            }

            const point = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(pick.point.x, pick.point.y))
            this._fixedPoints.push(point)
            this._currentPoint = point.clone()
            snapContext = pick.snapContext
            this._updateSnapContext(snapContext)
            updateDrawingStatus(this._kind, this._fixedPoints.length)
            this._renderPreview()
        }

        const element = executeCreateShapeRequest(this._kind, this._fixedPoints)
        setToast(element ? `${toolMeta[this._kind].label}已完成，可继续绘制` : `${toolMeta[this._kind].label}创建失败`)
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }

    private async _pickPoint(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        let picked: IPickedResult | undefined
        const pickContext = new PickPointContext({
            snapContext,
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
            clickCallBack: result => {
                picked = result
            },
        })
        pickContext.highlightPickedGNodes = true

        const action = new PickPointAction(pickContext)
        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess || !picked) {
            return undefined
        }

        return {
            point: picked.point.clone(),
            snapContext: action.getSnapContext(),
        }
    }
}

@registerCmd('draw-rect-line-cmd')
class DrawRectLineCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'rectLine'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        let snapContext: ReturnType<PickPointAction['getSnapContext']> | undefined
        while (this._fixedPoints.length < shapePointCount[this._kind]) {
            const pick = await this._pickPoint(snapContext)
            if (!pick) {
                this.cancel()
                return
            }

            const point = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(pick.point.x, pick.point.y))
            this._fixedPoints.push(point)
            this._currentPoint = point.clone()
            snapContext = pick.snapContext
            this._updateSnapContext(snapContext)
            updateDrawingStatus(this._kind, this._fixedPoints.length)
            this._renderPreview()
        }

        const element = executeCreateShapeRequest(this._kind, this._fixedPoints)
        setToast(element ? `${toolMeta[this._kind].label}已完成，可继续绘制` : `${toolMeta[this._kind].label}创建失败`)
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }

    private async _pickPoint(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        let picked: IPickedResult | undefined
        const pickContext = new PickPointContext({
            snapContext,
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
            clickCallBack: result => {
                picked = result
            },
        })
        pickContext.highlightPickedGNodes = true

        const action = new PickPointAction(pickContext)
        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess || !picked) {
            return undefined
        }

        return {
            point: picked.point.clone(),
            snapContext: action.getSnapContext(),
        }
    }
}

@registerCmd('draw-circle-cmd')
class DrawCircleCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'circle'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        let snapContext: ReturnType<PickPointAction['getSnapContext']> | undefined
        while (this._fixedPoints.length < shapePointCount[this._kind]) {
            const pick = await this._pickPoint(snapContext)
            if (!pick) {
                this.cancel()
                return
            }

            const point = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(pick.point.x, pick.point.y))
            this._fixedPoints.push(point)
            this._currentPoint = point.clone()
            snapContext = pick.snapContext
            this._updateSnapContext(snapContext)
            updateDrawingStatus(this._kind, this._fixedPoints.length)
            this._renderPreview()
        }

        const element = executeCreateShapeRequest(this._kind, this._fixedPoints)
        setToast(element ? `${toolMeta[this._kind].label}已完成，可继续绘制` : `${toolMeta[this._kind].label}创建失败`)
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }

    private async _pickPoint(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        let picked: IPickedResult | undefined
        const pickContext = new PickPointContext({
            snapContext,
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
            clickCallBack: result => {
                picked = result
            },
        })
        pickContext.highlightPickedGNodes = true

        const action = new PickPointAction(pickContext)
        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess || !picked) {
            return undefined
        }

        return {
            point: picked.point.clone(),
            snapContext: action.getSnapContext(),
        }
    }
}

@registerCmd('draw-arc-cmd')
class DrawArcCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'arc'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        const pickContext = new PickPointContext({
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
        })
        pickContext.highlightPickedGNodes = true

        const cmd = this
        const action = new class extends PickPointAction {
            public override onClick(evt: IMouseEvent) {
                const result = this.getCurrentResult() ?? this._getPickPointResult(evt.pos)
                const worldPos = new Vec2(result.point.x, result.point.y)
                cmd._fixedPoints.push(normalizeShapePoint(cmd._kind, cmd._fixedPoints, worldPos))
                cmd._currentPoint = cmd._fixedPoints[cmd._fixedPoints.length - 1].clone()
                cmd._updateSnapContext(this.getSnapContext())
                updateDrawingStatus(cmd._kind, cmd._fixedPoints.length)

                if (cmd._fixedPoints.length >= shapePointCount[cmd._kind]) {
                    const element = executeCreateShapeRequest(cmd._kind, cmd._fixedPoints)
                    setToast(element ? `${toolMeta[cmd._kind].label}已完成，可继续绘制` : `${toolMeta[cmd._kind].label}创建失败`)
                    cmd._fixedPoints = []
                    cmd._currentPoint = undefined
                    updateDrawingStatus(cmd._kind, 0)
                }

                cmd._renderPreview()
                return true
            }

            public override onMouseMove(evt: IMouseEvent): boolean {
                const handled = super.onMouseMove(evt)
                const painter = this.getBuildInTmpElementPainter()
                if (painter) {
                    this.getDoc().updateView()
                }
                return handled
            }

            public override onRClick(_evt: IMouseEvent) {
                if (cmd._fixedPoints.length === 0) {
                    this.cancel()
                }
                return true
            }
        }(pickContext)

        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess) {
            this.cancel()
            return
        }
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }
}

@registerCmd('draw-ellipse-cmd')
class DrawEllipseCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'ellipse'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        const pickContext = new PickPointContext({
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
        })
        pickContext.highlightPickedGNodes = true

        const cmd = this
        const action = new class extends PickPointAction {
            public override onClick(evt: IMouseEvent) {
                const result = this.getCurrentResult() ?? this._getPickPointResult(evt.pos)
                const worldPos = new Vec2(result.point.x, result.point.y)
                cmd._fixedPoints.push(normalizeShapePoint(cmd._kind, cmd._fixedPoints, worldPos))
                cmd._currentPoint = cmd._fixedPoints[cmd._fixedPoints.length - 1].clone()
                cmd._updateSnapContext(this.getSnapContext())
                updateDrawingStatus(cmd._kind, cmd._fixedPoints.length)

                if (cmd._fixedPoints.length >= shapePointCount[cmd._kind]) {
                    const element = executeCreateShapeRequest(cmd._kind, cmd._fixedPoints)
                    setToast(element ? `${toolMeta[cmd._kind].label}已完成，可继续绘制` : `${toolMeta[cmd._kind].label}创建失败`)
                    cmd._fixedPoints = []
                    cmd._currentPoint = undefined
                    updateDrawingStatus(cmd._kind, 0)
                }

                cmd._renderPreview()
                return true
            }

            public override onMouseMove(evt: IMouseEvent): boolean {
                const handled = super.onMouseMove(evt)
                const painter = this.getBuildInTmpElementPainter()
                if (painter) {
                    this.getDoc().updateView()
                }
                return handled
            }

            public override onRClick(_evt: IMouseEvent) {
                if (cmd._fixedPoints.length === 0) {
                    this.cancel()
                }
                return true
            }
        }(pickContext)

        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess) {
            this.cancel()
            return
        }
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }
}

@registerCmd('draw-ellipse-arc-cmd')
class DrawEllipseArcCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'ellipseArc'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        const pickContext = new PickPointContext({
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
        })
        pickContext.highlightPickedGNodes = true

        const cmd = this
        const action = new class extends PickPointAction {
            public override onClick(evt: IMouseEvent) {
                const result = this.getCurrentResult() ?? this._getPickPointResult(evt.pos)
                const worldPos = new Vec2(result.point.x, result.point.y)
                cmd._fixedPoints.push(normalizeShapePoint(cmd._kind, cmd._fixedPoints, worldPos))
                cmd._currentPoint = cmd._fixedPoints[cmd._fixedPoints.length - 1].clone()
                cmd._updateSnapContext(this.getSnapContext())
                updateDrawingStatus(cmd._kind, cmd._fixedPoints.length)

                if (cmd._fixedPoints.length >= shapePointCount[cmd._kind]) {
                    const element = executeCreateShapeRequest(cmd._kind, cmd._fixedPoints)
                    setToast(element ? `${toolMeta[cmd._kind].label}已完成，可继续绘制` : `${toolMeta[cmd._kind].label}创建失败`)
                    cmd._fixedPoints = []
                    cmd._currentPoint = undefined
                    updateDrawingStatus(cmd._kind, 0)
                }

                cmd._renderPreview()
                return true
            }

            public override onMouseMove(evt: IMouseEvent): boolean {
                const handled = super.onMouseMove(evt)
                const painter = this.getBuildInTmpElementPainter()
                if (painter) {
                    this.getDoc().updateView()
                }
                return handled
            }

            public override onRClick(_evt: IMouseEvent) {
                if (cmd._fixedPoints.length === 0) {
                    this.cancel()
                }
                return true
            }
        }(pickContext)

        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess) {
            this.cancel()
            return
        }
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }
}

@registerCmd('draw-bspline-cmd')
class DrawBSplineCmd extends Cmd {
    public override executeImmediately = false

    private readonly _kind: ShapeKind = 'bspline'

    private _fixedPoints: Vec2[] = []

    private _currentPoint?: Vec2

    private _previewPainter?: TmpElementPainter

    public override async execute() {
        this._fixedPoints = []
        this._currentPoint = undefined
        updateDrawingStatus(this._kind, 0)
        this._renderPreview()

        const pickContext = new PickPointContext({
            movingCallBack: result => {
                this._currentPoint = normalizeShapePoint(this._kind, this._fixedPoints, new Vec2(result.point.x, result.point.y))
                this._renderPreview()
            },
        })
        pickContext.highlightPickedGNodes = true

        const cmd = this
        const action = new class extends PickPointAction {
            public override onClick(evt: IMouseEvent) {
                const result = this.getCurrentResult() ?? this._getPickPointResult(evt.pos)
                const worldPos = new Vec2(result.point.x, result.point.y)
                cmd._fixedPoints.push(normalizeShapePoint(cmd._kind, cmd._fixedPoints, worldPos))
                cmd._currentPoint = cmd._fixedPoints[cmd._fixedPoints.length - 1].clone()
                cmd._updateSnapContext(this.getSnapContext())
                updateDrawingStatus(cmd._kind, cmd._fixedPoints.length)
                cmd._renderPreview()
                return true
            }

            public override onMouseMove(evt: IMouseEvent): boolean {
                const handled = super.onMouseMove(evt)
                const painter = this.getBuildInTmpElementPainter()
                if (painter) {
                    this.getDoc().updateView()
                }
                return handled
            }

            public override onRClick(_evt: IMouseEvent) {
                if (cmd._fixedPoints.length === 0) {
                    this.cancel()
                    return true
                }
                if (cmd._fixedPoints.length >= minShapePointCount[cmd._kind]) {
                    const element = executeCreateShapeRequest(cmd._kind, cmd._fixedPoints)
                    setToast(element ? `${toolMeta[cmd._kind].label}已完成，可继续绘制` : `${toolMeta[cmd._kind].label}创建失败`)
                    cmd._fixedPoints = []
                    cmd._currentPoint = undefined
                    updateDrawingStatus(cmd._kind, 0)
                    cmd._renderPreview()
                }
                return true
            }
        }(pickContext)

        const actionResult = await this.runAction(action)
        if (!actionResult?.isSuccess) {
            this.cancel()
            return
        }
        this._resolve()
    }

    public override cancel() {
        setToast(`${toolMeta[this._kind].label}已取消`)
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy() {
        this._clearPreview()
        this.getBuildInTmpElementPainter()?.destroy()
        resetDrawingStatus()
    }

    private _renderPreview() {
        const grep = buildShapePreviewGRep(this._kind, this._fixedPoints, this._currentPoint)
        if (!this._previewPainter) {
            this._previewPainter = new TmpElementPainter(this.getDoc())
        }
        this._previewPainter.drawTmpGRep(grep)
        this.getDoc().updateView()
    }

    private _clearPreview() {
        this._previewPainter?.destroy()
        this._previewPainter = undefined
        this._currentPoint = undefined
        this.clearTmp()
    }

    private _updateSnapContext(snapContext?: ReturnType<PickPointAction['getSnapContext']>) {
        const currentPoint = this._fixedPoints[this._fixedPoints.length - 1]
        if (!currentPoint || !snapContext) {
            return
        }
        snapContext.previousPoint = currentPoint.clone()
        if (!snapContext.firstPoint) {
            snapContext.firstPoint = currentPoint.clone()
        }
        if (this._fixedPoints.length < 2) {
            return
        }
        const previousPoint = this._fixedPoints[this._fixedPoints.length - 2]
        if (!currentPoint.equals(previousPoint)) {
            snapContext.previousLineDir = currentPoint.subtracted(previousPoint).normalize()
        }
    }
}

@registerCmd('clear-shapes-cmd')
class ClearShapesCmd extends Cmd {
    public override async execute() {
        await Promise.resolve()
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

    const rect = mountNode.getBoundingClientRect()
    const localPos = new Vec2(evt.clientX - rect.left, evt.clientY - rect.top)
    const world = getCanvasWorkPlaneApi().screenToWorkPlane(localPos)
    state.cursorWorld = { x: world.x, y: world.y }
    emitState()
}

function clearCursor() {
    state.cursorWorld = null
    emitState()
}

function fitEngineeringDemoView() {
    if (!mountNode) {
        return
    }

    const canvas = app.getCanvas() as unknown as {
        _renderer?: {
            _camera?: {
                left: number
                right: number
                top: number
                bottom: number
                zoom: number
                position: { set: (x: number, y: number, z: number) => void, z: number }
                updateProjectionMatrix: () => void
            }
            _cameraControls?: {
                target: { set: (x: number, y: number, z: number) => void }
                update: () => void
            }
        }
    }

    const renderer = canvas._renderer
    const camera = renderer?._camera
    if (!camera) {
        return
    }

    const frameWidth = engineeringSheetFrame.maxX - engineeringSheetFrame.minX
    const frameHeight = engineeringSheetFrame.maxY - engineeringSheetFrame.minY
    const viewWidth = camera.right - camera.left
    const viewHeight = camera.top - camera.bottom
    const horizontalPadding = 80
    const topOverlayHeight = 150
    const bottomPadding = 40
    const usableHeightScale = Math.max((mountNode.clientHeight - topOverlayHeight - bottomPadding) / mountNode.clientHeight, 0.4)
    const zoomX = viewWidth / (frameWidth + horizontalPadding * 2)
    const zoomY = (viewHeight * usableHeightScale) / (frameHeight + 48)
    const targetY = -28

    camera.zoom = Math.max(Math.min(zoomX, zoomY), 0.01)
    camera.position.set(0, targetY, camera.position.z)
    camera.updateProjectionMatrix()
    renderer?._cameraControls?.target.set(0, targetY, 0)
    renderer?._cameraControls?.update()
}

function scheduleFitEngineeringDemoView() {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            fitEngineeringDemoView()
        })
    })
}

function bindCanvasEvents() {
    if (!mountNode) {
        return
    }

    mountNode.addEventListener('pointermove', updateCursorFromPointer)
    mountNode.addEventListener('pointerleave', clearCursor)
    window.addEventListener('resize', scheduleFitEngineeringDemoView)
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
        scheduleFitEngineeringDemoView()
        return
    }

    const doc = new Document()
    activeDoc = doc
    app.start(doc)
    app.createCanvas(mount)
    bindCanvasEvents()
    canvasBootstrapped = true
    loadEngineeringDemo()
    scheduleFitEngineeringDemoView()
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
    } else if (kind === 'polyline') {
        Ctor = DrawPolylineCmd
    } else if (kind === 'rectLine') {
        Ctor = DrawRectLineCmd
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
    syncSelection()
    syncHighLight()
    requestMgr.executeReq(requestMgr.createReq(ClearTestShapesReq), true)
    requestMgr.executeReq(requestMgr.createReq(LoadEngineeringDemoReq), true)
    scheduleFitEngineeringDemoView()
    resetDrawingStatus('已加载工程图图框与两组投影视图，可继续叠加绘制。按住 Ctrl 可追加选中多个对象。')
    setToast('工程图演示已加载')
}

export function loadStyleDemo() {
    syncSelection()
    syncHighLight()
    requestMgr.executeReq(requestMgr.createReq(ClearTestShapesReq), true)
    requestMgr.executeReq(requestMgr.createReq(LoadStyleDemoReq), true)
    scheduleFitEngineeringDemoView()
    resetDrawingStatus('已加载 style 机制验证场景，控制台包含运行时断言结果。按住 Ctrl 可追加选中多个对象。')
    setToast('样式机制测试已加载')
}

export function clearAllShapes() {
    syncSelection()
    syncHighLight()
    void cmdMgr.sendCmd(ClearShapesCmd)
}

export function cancelActiveCommand() {
    cmdMgr.resetAllActions()
    resetDrawingStatus('命令已取消，请重新选择工具。')
    setToast('已取消当前命令')
}
