import { CCanvas } from '@ccpc/canvas'
import {
    Document,
    Element,
    GCurve2d,
    GPoint2d,
    GRep,
    RegisterElement,
    Request,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import { Arc2, Circle2, Line2, Plane, Vec2 } from '@ccpc/math'

const lines: string[] = []

function log(line: string): void {
    lines.push(line)
    const app = document.getElementById('app')
    if (app) {
        app.textContent = lines.join('\n')
    }
}

function createMount(): HTMLElement {
    const mount = document.createElement('div')
    mount.style.width = '1920px'
    mount.style.height = '1080px'
    mount.style.border = '1px solid #999'
    mount.style.marginTop = '16px'
    document.body.appendChild(mount)
    return mount
}

@RegisterElement('flow-sketch-element')
class FlowSketchElement extends Element {
    public x = 0

    public y = 0

    public width = 20

    public height = 20

    public override markGRepDirty(): void {
        this.C_GRep = buildSketchGRep(this)
    }
}

function buildSketchGRep(element: FlowSketchElement): GRep {
    const plane = new Plane()
    const grep = new GRep()

    const left = element.x - element.width * 0.5
    const right = element.x + element.width * 0.5
    const bottom = element.y - element.height * 0.5
    const top = element.y + element.height * 0.5

    const innerMargin = 30
    const titleBlockWidth = 220
    const titleRowHeight = 45
    const titleRows = 3

    const innerLeft = left + innerMargin
    const innerRight = right - innerMargin
    const innerBottom = bottom + innerMargin
    const innerTop = top - innerMargin

    const titleLeft = innerRight - titleBlockWidth
    const titleTop = innerBottom + titleRowHeight * titleRows

    const center = new Vec2(element.x, element.y)

    const addLine = (start: Vec2, end: Vec2) => {
        grep.addNode(new GCurve2d(plane, new Line2(start, end)))
    }

    const addRect = (minX: number, minY: number, maxX: number, maxY: number) => {
        addLine(new Vec2(minX, minY), new Vec2(maxX, minY))
        addLine(new Vec2(maxX, minY), new Vec2(maxX, maxY))
        addLine(new Vec2(maxX, maxY), new Vec2(minX, maxY))
        addLine(new Vec2(minX, maxY), new Vec2(minX, minY))
    }

    grep.addNode(new GPoint2d(plane, center))

    addRect(left, bottom, right, top)
    addRect(innerLeft, innerBottom, innerRight, innerTop)

    addLine(new Vec2(titleLeft, innerBottom), new Vec2(titleLeft, titleTop))
    addLine(new Vec2(titleLeft, titleTop), new Vec2(innerRight, titleTop))

    for (let i = 1; i < titleRows; i += 1) {
        const y = innerBottom + titleRowHeight * i
        addLine(new Vec2(titleLeft, y), new Vec2(innerRight, y))
    }

    const titleCol1 = titleLeft + 80
    const titleCol2 = titleLeft + 150
    addLine(new Vec2(titleCol1, innerBottom), new Vec2(titleCol1, titleTop))
    addLine(new Vec2(titleCol2, innerBottom), new Vec2(titleCol2, titleTop))

    addLine(new Vec2(innerLeft, innerBottom + 120), new Vec2(titleLeft, innerBottom + 120))
    addLine(new Vec2(innerLeft, innerBottom + 240), new Vec2(titleLeft, innerBottom + 240))
    addLine(new Vec2(innerLeft + 120, innerBottom), new Vec2(innerLeft + 120, innerBottom + 240))

    const shapeMinX = innerLeft + 80
    const shapeMaxX = titleLeft - 80
    const shapeMinY = innerBottom + 300
    const shapeMaxY = innerTop - 80
    const shapeCenter = new Vec2((shapeMinX + shapeMaxX) * 0.5, (shapeMinY + shapeMaxY) * 0.5)

    addLine(new Vec2(shapeMinX, shapeMinY), new Vec2(shapeMaxX, shapeMaxY))
    addLine(new Vec2(shapeMinX, shapeMaxY), new Vec2(shapeMaxX, shapeMinY))
    addLine(new Vec2(shapeMinX, shapeCenter.y), new Vec2(shapeMaxX, shapeCenter.y))

    grep.addNode(new GCurve2d(plane, new Circle2(shapeCenter, 120)))
    grep.addNode(new GCurve2d(plane, new Circle2(shapeCenter, 60)))
    grep.addNode(new GCurve2d(plane, new Arc2(shapeCenter, 170, Math.PI * 0.1, Math.PI * 0.9, false)))

    const wavePoints = [
        new Vec2(shapeMinX + 40, shapeMinY + 40),
        new Vec2(shapeMinX + 120, shapeMinY + 140),
        new Vec2(shapeMinX + 200, shapeMinY + 60),
        new Vec2(shapeMinX + 280, shapeMinY + 180),
        new Vec2(shapeMinX + 360, shapeMinY + 90),
        new Vec2(shapeMinX + 440, shapeMinY + 160),
    ]

    for (let i = 0; i < wavePoints.length - 1; i += 1) {
        addLine(wavePoints[i], wavePoints[i + 1])
    }

    addLine(new Vec2(element.x - 40, element.y), new Vec2(element.x + 40, element.y))
    addLine(new Vec2(element.x, element.y - 40), new Vec2(element.x, element.y + 40))

    return grep
}

@registerRequest('flow-create')
class CreateFlowElementReq extends Request {
    public execute(): FlowSketchElement {
        const element = this._doc.create(FlowSketchElement)
        element.name = 'flow-sketch'
        element.x = 0
        element.y = 0
        element.width = 1600
        element.height = 900
        element.markGRepDirty()
        return element
    }
}

function run(): void {
    log('=== Core + Canvas Flow Test ===')

    const mount = createMount()
    log('mount ready')

    const canvas = new CCanvas(mount)
    log('canvas created')

    const doc = new Document()
    log('document created')

    canvas.resetModelView(doc.modelView)
    log('modelView connected to canvas renderer')

    const req = requestMgr.createReq(CreateFlowElementReq)
    log('request created')

    requestMgr.executeReq(req, true)
    log('request executed')

    console.log(doc);

}

try {
    run()
    log('DONE')
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`ERROR: ${message}`)
}
