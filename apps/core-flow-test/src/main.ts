import {
    Document,
    Element,
    GCurve2d,
    GPolygon,
    GRep,
    RegisterElement,
    Request,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import { Arc2, Coord2, Ln2, Loop, Plane, Polygon, Vec2 } from '@ccpc/math'
import { app, Cmd, cmdMgr, registerCmd } from '@ccpc/platform'

type ShapeKind = 'line' | 'arc' | 'ellipseArc'

const SHAPE_POINT_COUNT: Record<ShapeKind, number> = {
    line: 2,
    arc: 3,
    ellipseArc: 5,
}

let activeDoc: Document | undefined
let shapeSeed = 1

function createToolbar(): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.style.display = 'flex'
    toolbar.style.flexWrap = 'wrap'
    toolbar.style.gap = '12px'
    toolbar.style.marginBottom = '12px'
    document.body.appendChild(toolbar)
    return toolbar
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = label
    button.style.padding = '10px 16px'
    button.style.border = '1px solid #777'
    button.style.background = '#f3f3f3'
    button.style.cursor = 'pointer'
    button.addEventListener('click', onClick)
    return button
}

function createMount(): HTMLElement {
    const mount = document.createElement('div')
    mount.id = 'canvas-mount'
    mount.style.width = '1280px'
    mount.style.height = '720px'
    mount.style.border = '1px solid #999'
    mount.style.background = '#111'
    document.body.appendChild(mount)
    return mount
}

function toWorldPos(screenPos: Vec2, mount: HTMLElement): Vec2 {
    return new Vec2(screenPos.x - mount.clientWidth * 0.5, mount.clientHeight * 0.5 - screenPos.y)
}

function nextShapeName(kind: ShapeKind | 'polygon'): string {
    const name = `${kind}-${shapeSeed}`
    shapeSeed += 1
    return name
}

function clonePoints(points: Vec2[]): Vec2[] {
    return points.map(point => point.clone())
}

function createShapeCurve(kind: ShapeKind, points: Vec2[]): Ln2 | Arc2 | undefined {
    switch (kind) {
        case 'line':
            return points.length >= 2 ? new Ln2(points[0], points[1]) : undefined
        case 'arc':
            return points.length >= 3 ? Arc2.makeArcByThreePoints(points[0], points[1], points[2]) : undefined
        case 'ellipseArc':
            return points.length >= 5
                ? Arc2.makeEllipseByFivePoints(points[0], points[1], points[2], points[3], points[4])
                : undefined
    }
}

function randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
    return Math.floor(randomInRange(min, max + 1))
}

function randomDirection(angle: number): Vec2 {
    return new Vec2(Math.cos(angle), Math.sin(angle))
}

function shuffleArray<T>(items: T[]): T[] {
    const ret = [...items]
    for (let i = ret.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ret[i], ret[j]] = [ret[j], ret[i]]
    }
    return ret
}

function makeRoundedRectLoop(center: Vec2, width: number, height: number, radii: [number, number, number, number]): Loop {
    const halfW = width * 0.5
    const halfH = height * 0.5
    const [rb0, rt0, lt0, lb0] = radii
    const clampRadius = (radius: number) => Math.min(radius, halfW * 0.45, halfH * 0.45)
    const rb = clampRadius(rb0)
    const rt = clampRadius(rt0)
    const lt = clampRadius(lt0)
    const lb = clampRadius(lb0)

    const bottomLeft = new Vec2(center.x - halfW + lb, center.y - halfH)
    const bottomRight = new Vec2(center.x + halfW - rb, center.y - halfH)
    const rightBottom = new Vec2(center.x + halfW, center.y - halfH + rb)
    const rightTop = new Vec2(center.x + halfW, center.y + halfH - rt)
    const topRight = new Vec2(center.x + halfW - rt, center.y + halfH)
    const topLeft = new Vec2(center.x - halfW + lt, center.y + halfH)
    const leftTop = new Vec2(center.x - halfW, center.y + halfH - lt)
    const leftBottom = new Vec2(center.x - halfW, center.y - halfH + lb)

    const curves = [
        new Ln2(bottomLeft, bottomRight),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + halfW - rb, center.y - halfH + rb), bottomRight, rightBottom, true)!,
        new Ln2(rightBottom, rightTop),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x + halfW - rt, center.y + halfH - rt), rightTop, topRight, true)!,
        new Ln2(topRight, topLeft),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - halfW + lt, center.y + halfH - lt), topLeft, leftTop, true)!,
        new Ln2(leftTop, leftBottom),
        Arc2.makeArcByStartEndPoints(new Vec2(center.x - halfW + lb, center.y - halfH + lb), leftBottom, bottomLeft, true)!,
    ]

    return new Loop(curves)
}

function makeCapsuleLoop(center: Vec2, width: number, height: number, horizontal: boolean): Loop {
    if (horizontal) {
        const r = height * 0.5
        const leftCenter = new Vec2(center.x - width * 0.5 + r, center.y)
        const rightCenter = new Vec2(center.x + width * 0.5 - r, center.y)
        const bottomLeft = new Vec2(leftCenter.x, center.y - r)
        const bottomRight = new Vec2(rightCenter.x, center.y - r)
        const topRight = new Vec2(rightCenter.x, center.y + r)
        const topLeft = new Vec2(leftCenter.x, center.y + r)
        return new Loop([
            new Ln2(bottomLeft, bottomRight),
            Arc2.makeArcByStartEndPoints(rightCenter, bottomRight, topRight, true)!,
            new Ln2(topRight, topLeft),
            Arc2.makeArcByStartEndPoints(leftCenter, topLeft, bottomLeft, true)!,
        ])
    }

    const r = width * 0.5
    const bottomCenter = new Vec2(center.x, center.y - height * 0.5 + r)
    const topCenter = new Vec2(center.x, center.y + height * 0.5 - r)
    const rightBottom = new Vec2(center.x + r, bottomCenter.y)
    const rightTop = new Vec2(center.x + r, topCenter.y)
    const leftTop = new Vec2(center.x - r, topCenter.y)
    const leftBottom = new Vec2(center.x - r, bottomCenter.y)
    return new Loop([
        new Ln2(rightBottom, rightTop),
        Arc2.makeArcByStartEndPoints(topCenter, rightTop, leftTop, true)!,
        new Ln2(leftTop, leftBottom),
        Arc2.makeArcByStartEndPoints(bottomCenter, leftBottom, rightBottom, true)!,
    ])
}

function makeEllipseLoop(center: Vec2, a: number, b: number, angle: number, isCCW: boolean): Loop {
    const arc = new Arc2(new Coord2(center, randomDirection(angle)), a, b, isCCW, [0, Math.PI * 2])
    return new Loop([arc])
}

function makeAsymmetricMixedLoop(center: Vec2, width: number, height: number): Loop {
    const w = width * 0.5
    const h = height * 0.5
    const points = [
        new Vec2(center.x - w * randomInRange(0.96, 1.08), center.y - h * randomInRange(0.08, 0.22)),
        new Vec2(center.x - w * randomInRange(0.46, 0.66), center.y - h * randomInRange(0.82, 1.02)),
        new Vec2(center.x + w * randomInRange(0.08, 0.22), center.y - h * randomInRange(0.5, 0.72)),
        new Vec2(center.x + w * randomInRange(0.84, 1.02), center.y - h * randomInRange(0.1, 0.24)),
        new Vec2(center.x + w * randomInRange(0.42, 0.58), center.y + h * randomInRange(0.7, 0.96)),
        new Vec2(center.x - w * randomInRange(0.06, 0.22), center.y + h * randomInRange(0.42, 0.6)),
        new Vec2(center.x - w * randomInRange(0.7, 0.9), center.y + h * randomInRange(0.72, 0.94)),
    ]
    const refs = [
        new Vec2(center.x - w * randomInRange(0.18, 0.34), center.y - h * randomInRange(1.0, 1.18)),
        new Vec2(center.x + w * randomInRange(0.98, 1.14), center.y + h * randomInRange(0.28, 0.46)),
        new Vec2(center.x - w * randomInRange(0.4, 0.62), center.y + h * randomInRange(1.0, 1.18)),
    ]

    return new Loop([
        new Ln2(points[0], points[1]),
        Arc2.makeArcByThreePoints(points[1], refs[0], points[2])!,
        new Ln2(points[2], points[3]),
        Arc2.makeArcByThreePoints(points[3], refs[1], points[4])!,
        new Ln2(points[4], points[5]),
        new Ln2(points[5], points[6]),
        Arc2.makeArcByThreePoints(points[6], refs[2], points[0])!,
    ])
}

function createRandomPolygon(): Polygon {
    const center = new Vec2(randomInRange(-260, 260), randomInRange(-160, 160))
    const width = randomInRange(220, 380)
    const height = randomInRange(160, 280)
    const polygon = new Polygon()
    const outerKind = randomInt(0, 3)

    let outerLoop: Loop
    if (outerKind === 0) {
        outerLoop = makeRoundedRectLoop(center, width, height, [
            randomInRange(12, 52),
            randomInRange(12, 52),
            randomInRange(12, 52),
            randomInRange(12, 52),
        ])
    } else if (outerKind === 1) {
        outerLoop = makeCapsuleLoop(center, width, height * randomInRange(0.55, 0.8), true)
    } else if (outerKind === 2) {
        outerLoop = makeCapsuleLoop(center, width * randomInRange(0.45, 0.72), height, false)
    } else {
        outerLoop = makeAsymmetricMixedLoop(center, width, height)
    }

    outerLoop.rotate(randomInRange(-Math.PI * 0.45, Math.PI * 0.45), center)
    polygon.addLoop(outerLoop, false)

    const holeSlots = shuffleArray([
        new Vec2(-0.22, -0.14),
        new Vec2(0.24, -0.08),
        new Vec2(0.0, 0.18),
    ])
    const holeCount = Math.random() < 0.2 ? 0 : randomInt(1, Math.min(3, holeSlots.length))

    for (let i = 0; i < holeCount; i++) {
        const slot = holeSlots[i]
        const holeCenter = new Vec2(
            center.x + slot.x * width + randomInRange(-width * 0.04, width * 0.04),
            center.y + slot.y * height + randomInRange(-height * 0.04, height * 0.04),
        )
        const holeKind = randomInt(0, 2)

        if (holeKind === 0) {
            const holeLoop = makeEllipseLoop(
                holeCenter,
                randomInRange(width * 0.06, width * 0.12),
                randomInRange(height * 0.05, height * 0.1),
                randomInRange(0, Math.PI),
                false,
            )
            polygon.addLoop(holeLoop, false)
            continue
        }

        if (holeKind === 1) {
            const holeLoop = makeRoundedRectLoop(
                holeCenter,
                randomInRange(width * 0.14, width * 0.24),
                randomInRange(height * 0.12, height * 0.2),
                [
                    randomInRange(6, 18),
                    randomInRange(6, 18),
                    randomInRange(6, 18),
                    randomInRange(6, 18),
                ],
            )
            holeLoop.rotate(randomInRange(-Math.PI * 0.35, Math.PI * 0.35), holeCenter)
            polygon.addLoop(holeLoop.reverse(), false)
            continue
        }

        const holeLoop = makeCapsuleLoop(
            holeCenter,
            randomInRange(width * 0.14, width * 0.22),
            randomInRange(height * 0.08, height * 0.16),
            Math.random() < 0.5,
        )
        holeLoop.rotate(randomInRange(-Math.PI * 0.5, Math.PI * 0.5), holeCenter)
        polygon.addLoop(holeLoop.reverse(), false)
    }

    return polygon
}

function buildPolygonGRep(polygon: Polygon): GRep {
    const grep = new GRep()
    grep.addNode(new GPolygon(new Plane(), polygon))
    return grep
}

function buildShapeGRep(kind: ShapeKind, points: Vec2[]): GRep {
    const plane = new Plane()
    const grep = new GRep()
    const addSegment = (start: Vec2, end: Vec2) => {
        grep.addNode(new GCurve2d(plane, new Ln2(start, end)))
    }

    if (kind === 'line') {
        const line = createShapeCurve(kind, points)
        if (line) {
            grep.addNode(new GCurve2d(plane, line))
        }
        return grep
    }

    if (kind === 'arc') {
        const arc = createShapeCurve(kind, points)
        if (arc) {
            grep.addNode(new GCurve2d(plane, arc))
        } else if (points.length >= 2) {
            addSegment(points[0], points[1])
        }
        return grep
    }

    if (points.length >= 2) {
        addSegment(points[0], points[1])
    }
    if (points.length >= 3) {
        addSegment(points[0], points[2])
    }
    if (points.length >= 4) {
        addSegment(points[0], points[3])
    }
    const ellipseArc = createShapeCurve(kind, points)
    if (ellipseArc) {
        grep.addNode(new GCurve2d(plane, ellipseArc))
    }
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

class PreviewShapeElement extends TestShapeElement {
    public override isTemporary(): boolean {
        return true
    }
}

@RegisterElement('random-polygon-element')
class RandomPolygonElement extends Element {
    public polygon: Polygon = new Polygon()

    public override markGRepDirty(): void {
        this.C_GRep = buildPolygonGRep(this.polygon.clone())
    }
}

@registerRequest('draw-test-shape')
class DrawTestShapeReq extends Request {
    constructor(
        private readonly _kind: ShapeKind,
        private readonly _points: Vec2[],
    ) {
        super()
    }

    public execute(): TestShapeElement {
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

    public execute(): RandomPolygonElement {
        const element = this._doc.create(RandomPolygonElement)
        element.name = nextShapeName('polygon')
        element.polygon = this._polygon.clone()
        element.markGRepDirty()
        return element
    }
}

@registerRequest('clear-test-shapes')
class ClearTestShapesReq extends Request {
    public execute(): void {
        const ids = this._doc.elementMgr
            .getAllElements()
            .filter(element => element instanceof TestShapeElement || element instanceof RandomPolygonElement)
            .map(element => element.id)
        if (ids.length > 0) {
            this._doc.deleteElementsById(...ids)
        }
    }
}

class BaseDrawShapeCmd extends Cmd {
    public override executeImmediately = false

    private _fixedPoints: Vec2[] = []

    private _previewElement?: PreviewShapeElement

    constructor(private readonly _kind: ShapeKind) {
        super()
    }

    public override async execute(): Promise<void> {
        this._ensurePreview()
        this._syncPreview()
    }

    public override onMouseMove(evt: { pos: Vec2 }): boolean {
        const worldPos = this._toWorldPos(evt.pos)
        if (!worldPos) {
            return false
        }
        this._syncPreview(worldPos)
        return true
    }

    public override onClick(evt: { pos: Vec2 }): boolean {
        const worldPos = this._toWorldPos(evt.pos)
        if (!worldPos) {
            return false
        }

        this._fixedPoints.push(worldPos)
        const required = SHAPE_POINT_COUNT[this._kind]

        if (this._fixedPoints.length >= required) {
            const req = requestMgr.createReq(DrawTestShapeReq, this._kind, clonePoints(this._fixedPoints))
            requestMgr.executeReq(req, true)
            this._clearPreview()
            this._resolve()
            return true
        }

        this._syncPreview(worldPos)
        return true
    }

    public override cancel(): void {
        this._clearPreview()
        super.cancel()
    }

    public override onDestroy(): void {
        this._clearPreview()
    }

    private _ensurePreview(): void {
        if (this._previewElement) {
            return
        }
        const preview = this.getDoc().create(PreviewShapeElement)
        preview.name = `preview-${this._kind}`
        preview.kind = this._kind
        preview.points = []
        preview.markGRepDirty()
        this._previewElement = preview
        this._updateView()
    }

    private _syncPreview(cursor?: Vec2): void {
        this._ensurePreview()
        if (!this._previewElement) {
            return
        }
        const previewPoints = clonePoints(this._fixedPoints)
        if (cursor && previewPoints.length < SHAPE_POINT_COUNT[this._kind]) {
            previewPoints.push(cursor)
        }
        this._previewElement.kind = this._kind
        this._previewElement.points = previewPoints
        this._previewElement.markGRepDirty()
        this._updateView()
    }

    private _clearPreview(): void {
        if (!this._previewElement) {
            return
        }
        this.getDoc().deleteElementsById(this._previewElement.id)
        delete this._previewElement
        this._updateView()
    }

    private _toWorldPos(screenPos: Vec2): Vec2 | undefined {
        const mount = document.getElementById('canvas-mount')
        if (!mount) {
            return undefined
        }
        return toWorldPos(screenPos, mount)
    }
}

@registerCmd('draw-line-cmd')
class DrawLineCmd extends BaseDrawShapeCmd {
    constructor() {
        super('line')
    }
}

@registerCmd('draw-arc-cmd')
class DrawArcCmd extends BaseDrawShapeCmd {
    constructor() {
        super('arc')
    }
}

@registerCmd('draw-ellipse-arc-cmd')
class DrawEllipseArcCmd extends BaseDrawShapeCmd {
    constructor() {
        super('ellipseArc')
    }
}

@registerCmd('clear-shapes-cmd')
class ClearShapesCmd extends Cmd {
    public override async execute(): Promise<void> {
        if (!activeDoc) {
            return
        }
        const req = requestMgr.createReq(ClearTestShapesReq)
        requestMgr.executeReq(req, true)
    }
}

function armCommand(cmd: typeof Cmd): void {
    void cmdMgr.sendCmd(cmd).then(() => undefined)
}

function drawRandomPolygon(): void {
    const req = requestMgr.createReq(DrawRandomPolygonReq, createRandomPolygon())
    requestMgr.executeReq(req, true)
}

function run(): void {
    const toolbar = createToolbar()
    const mount = createMount()

    toolbar.appendChild(createButton('Draw Line', () => armCommand(DrawLineCmd)))
    toolbar.appendChild(createButton('Draw Arc', () => armCommand(DrawArcCmd)))
    toolbar.appendChild(createButton('Draw Ellipse Arc', () => armCommand(DrawEllipseArcCmd)))
    toolbar.appendChild(createButton('Random Polygon', drawRandomPolygon))
    toolbar.appendChild(createButton('Clear', () => armCommand(ClearShapesCmd)))

    const doc = new Document()
    activeDoc = doc
    app.start(doc)
    app.createCanvas(mount)
}

run()
