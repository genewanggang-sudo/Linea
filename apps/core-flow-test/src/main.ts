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
import { Line2, Plane, Vec2 } from '@ccpc/math'

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
    mount.style.width = '640px'
    mount.style.height = '360px'
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

    public override markGRepDirty(): void {
        this.C_GRep = buildSketchGRep(this)
    }
}

function buildSketchGRep(element: FlowSketchElement): GRep {
    const plane = new Plane()
    const center = new Vec2(element.x, element.y)
    const line = new Line2(
        new Vec2(element.x - element.width * 0.5, element.y),
        new Vec2(element.x + element.width * 0.5, element.y),
    )

    const grep = new GRep()
    grep.addNode(new GPoint2d(plane, center))
    grep.addNode(new GCurve2d(plane, line))
    return grep
}

@registerRequest('flow-create')
class CreateFlowElementReq extends Request {
    public execute(): FlowSketchElement {
        const element = this._doc.create(FlowSketchElement)
        element.name = 'flow-sketch'
        element.x = 10
        element.y = 20
        element.width = 30
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
