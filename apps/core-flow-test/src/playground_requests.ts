import {
    Request,
    registerRequest,
} from '@ccpc/core'
import {
    ArcElement,
    BSplineElement,
    CircleElement,
    EllipseArcElement,
    EllipseElement,
    LineElement,
    PolyLineElement,
    RectLineElement,
} from '@ccpc/editor_sdk'
import type { Polygon } from '@ccpc/math'
import {
    EngineeringSheetElement,
    EngineeringSheetViewElement,
    RandomPolygonElement,
    StyleDemoElement,
} from './playground_elements'

let shapeSeed = 1

function nextShapeName(kind: 'polygon' | 'demo' | 'demoView' | 'styleDemo') {
    const name = `${kind}-${shapeSeed}`
    shapeSeed += 1
    return name
}

@registerRequest('draw-random-polygon')
export class DrawRandomPolygonReq extends Request {
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
export class LoadEngineeringDemoReq extends Request {
    public execute() {
        const frame = this._doc.create(EngineeringSheetElement)
        frame.name = nextShapeName('demo')
        frame.applyDemoData()
        frame.markGRepDirty()

        const front = this._doc.create(EngineeringSheetViewElement)
        front.name = nextShapeName('demoView')
        front.applyDemoGeometry('front')
        front.markGRepDirty()

        const top = this._doc.create(EngineeringSheetViewElement)
        top.name = nextShapeName('demoView')
        top.applyDemoGeometry('top')
        top.markGRepDirty()

        const right = this._doc.create(EngineeringSheetViewElement)
        right.name = nextShapeName('demoView')
        right.applyDemoGeometry('right')
        right.markGRepDirty()

        const section = this._doc.create(EngineeringSheetViewElement)
        section.name = nextShapeName('demoView')
        section.applyDemoGeometry('section')
        section.markGRepDirty()

        return frame
    }
}

@registerRequest('load-style-demo')
export class LoadStyleDemoReq extends Request {
    public execute() {
        const element = this._doc.create(StyleDemoElement)
        element.name = nextShapeName('styleDemo')
        element.markGRepDirty()
        return element
    }
}

@registerRequest('clear-test-shapes')
export class ClearTestShapesReq extends Request {
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
                element instanceof EngineeringSheetViewElement ||
                element instanceof StyleDemoElement)
            .map(element => element.id)

        if (ids.length > 0) {
            this._doc.deleteElementsById(...ids)
        }
    }
}
