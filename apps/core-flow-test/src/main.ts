import {
    Document,
    Element,
    GCurve2d,
    GRep,
    RegisterElement,
    Request,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import { Arc2, Ln2, Plane, Vec2 } from '@ccpc/math'
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

function nextShapeName(kind: ShapeKind): string {
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

@registerRequest('clear-test-shapes')
class ClearTestShapesReq extends Request {
    public execute(): void {
        const ids = this._doc.elementMgr
            .getAllElements()
            .filter(element => element instanceof TestShapeElement)
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

function run(): void {
    const toolbar = createToolbar()
    const mount = createMount()

    toolbar.appendChild(createButton('Draw Line', () => armCommand(DrawLineCmd)))
    toolbar.appendChild(createButton('Draw Arc', () => armCommand(DrawArcCmd)))
    toolbar.appendChild(createButton('Draw Ellipse Arc', () => armCommand(DrawEllipseArcCmd)))
    toolbar.appendChild(createButton('Clear', () => armCommand(ClearShapesCmd)))

    const doc = new Document()
    activeDoc = doc
    app.start(doc)
    app.createCanvas(mount)
}

run()
