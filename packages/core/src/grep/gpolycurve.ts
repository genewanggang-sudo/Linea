import { alg, DiscreteParam, EN_GEO_TYPE, Plane, PolyCurve } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderEdge } from '../render/render_node';

export class GPolycurve extends GNode2d {
    public declare geo: PolyCurve

    constructor(plane: Plane, geo: PolyCurve) {
        super(plane, geo)
    }

    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderEdge {
        const render = new RenderEdge()
        const pts = alg.DiscreteTopology.discretePolyline(this.geo, discreteParams)
        if (this.geo.getType() === EN_GEO_TYPE.LOOP && pts.length > 0) {
            pts.push(pts[0].clone())
        }
        render.points = pts.map(p => this.plane.getPtAt(p))
        return render
    }

    public clone(cloneGeo?: boolean) {
        const polyCurve = new GPolycurve(this.plane, cloneGeo ? this.geo.clone() : this.geo)
        return polyCurve._copyFrom(this)
    }
}
