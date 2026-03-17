import { DiscreteParam, Plane, PolyCurve } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderEdge } from '../render/render_node';

export class GPolycurve extends GNode2d {
    public declare geo: PolyCurve

    constructor(plane: Plane, geo: PolyCurve) {
        super(plane, geo)
    }

    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderEdge {
        const render = new RenderEdge()
        const pts = this.geo.toPath(discreteParams)
        render.points = pts.map(p => this.plane.getPtAt(p))
        return render
    }

    public clone(cloneGeo?: boolean) {
        return new GPolycurve(this.plane, cloneGeo ? this.geo.clone() : this.geo)
    }
}
