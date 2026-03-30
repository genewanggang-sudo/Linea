import {
    CreateArcRequest,
    CreateBSplineRequest,
    CreateCircleRequest,
    CreateEllipseArcRequest,
    CreateEllipseRequest,
    CreateLineRequest,
    CreatePolylineRequest,
    CreateRectLineRequest,
} from '@ccpc/editor_sdk'
import {
    Document,
    GCurve2d,
    GNode,
    GPoint2d,
    GPolycurve,
    GRep,
    TmpElementPainter,
    requestMgr,
} from '@ccpc/core'
import type { IMouseEvent } from '@ccpc/canvas'
import { Arc2, Coord2, Ln2, Loop, NurbsCurve2, Plane, PolyCurve, Vec2 } from '@ccpc/math'
import { app, Cmd, cmdMgr, PickPointAction, PickPointContext, registerCmd } from '@ccpc/platform'
import type { IPickedResult } from '@ccpc/platform'
import { RandomPolygonElement } from './playground_elements'
import {
    ClearTestShapesReq,
    DrawRandomPolygonReq,
    LoadEngineeringDemoReq,
    LoadStyleDemoReq,
} from './playground_requests'
import {
    type PlaygroundState,
    type ShapeKind,
    type ToolId,
    toolMeta,
} from './playground_defs'
import {
    emitPlaygroundState,
    resetDrawingStatus,
    setCursorWorld,
    setToast,
    subscribePlayground,
    updateDrawingStatus as updateDrawingStatusState,
} from './playground_state'

declare global {
    interface Window {
        app: typeof app
    }
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

let activeDoc: Document | undefined
let canvasBootstrapped = false
let mountNode: HTMLElement | undefined

const engineeringSheetFrame = {
    minX: -148.5,
    maxX: 148.5,
    minY: -105,
    maxY: 105,
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

function isSamePoint(a: Vec2, b: Vec2, eps = 1e-6) {
    return a.distanceTo(b) <= eps
}

function removeAdjacentDuplicatePoints(points: Vec2[], eps = 1e-6) {
    const filtered: Vec2[] = []
    for (const point of points) {
        const last = filtered[filtered.length - 1]
        if (last && isSamePoint(last, point, eps)) {
            continue
        }
        filtered.push(point)
    }
    return filtered
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

function updateDrawingStatus(kind: ShapeKind, fixedPoints: number) {
    updateDrawingStatusState(kind, fixedPoints, shapeSteps[kind])
}

function clonePoints(points: Vec2[]) {
    return points.map(point => point.clone())
}

function appendGRep(target: GRep, source: GRep) {
    source.children.forEach(node => target.addNode(node))
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
        return points.length >= 2 && !isSamePoint(points[0], points[1]) ? new Ln2(points[0], points[1]) : undefined
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
    const renderPoints = removeAdjacentDuplicatePoints(points)

    if (kind === 'polyline') {
        if (renderPoints.length >= 2 && countDistinctPoints(renderPoints) >= 2) {
            const polyCurve = new PolyCurve(renderPoints)
            if (!polyCurve.isEmpty()) {
                grep.addNode(new GPolycurve(plane, polyCurve))
            }
        }
        return grep
    }

    if (kind === 'rectLine') {
        if (renderPoints.length >= 2 && !isSamePoint(renderPoints[0], renderPoints[1])) {
            grep.addNode(new GPolycurve(plane, Loop.createByRectangle(renderPoints[0], renderPoints[1])))
        }
        return grep
    }

    const curve = createShapeCurve(kind, renderPoints)
    if (curve) {
        grep.addNode(new GCurve2d(plane, curve))
    } else if (renderPoints.length >= 2 && !isSamePoint(renderPoints[0], renderPoints[1]) && kind !== 'ellipse' && kind !== 'ellipseArc') {
        grep.addNode(new GCurve2d(plane, new Ln2(renderPoints[0], renderPoints[1])))
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
        if (i > 0 && !isSamePoint(points[i - 1], points[i])) {
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
    const lastPreviewPoint = previewPoints[previewPoints.length - 1]
    if (
        cursor &&
        (kind === 'bspline' || previewPoints.length < shapePointCount[kind]) &&
        (!lastPreviewPoint || !isSamePoint(lastPreviewPoint, cursor))
    ) {
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
    setCursorWorld({ x: world.x, y: world.y })
}

function clearCursor() {
    setCursorWorld(null)
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
    emitPlaygroundState()
    window.app = app
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
    requestMgr.executeReq(requestMgr.createReq(DrawRandomPolygonReq, RandomPolygonElement.createRandomPolygon()), true)
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

export { subscribePlayground, toolMeta }
export type { PlaygroundState, ShapeKind }
