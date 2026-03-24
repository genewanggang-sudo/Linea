import { alg, DiscreteParam, EN_GEO_TYPE, Plane, PolyCurve } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderEdge } from '../render/render_node';
import { GNODE_TYPE } from './gnode_type';
import { IStyle } from './i_style';
import { StyleUtils } from './style_utils';

export class GPolycurve extends GNode2d {
    public declare geo: PolyCurve

    constructor(plane: Plane, geo: PolyCurve) {
        super(plane, geo)
    }

    public setStyle(style: IStyle) {
        super.setStyle(style)
        if (this._renderNode) {
            this._renderNode.style = StyleUtils.getLineStyle(this.getStyle())
        }
        return this
    }

    public override getType(): GNODE_TYPE {
        return GNODE_TYPE.GPolycurve
    }

    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderEdge {
        const render = new RenderEdge()
        const pts = alg.DiscreteTopology.discretePolyline(this.geo, discreteParams)
        if (this.geo.getType() === EN_GEO_TYPE.LOOP && pts.length > 0) {
            pts.push(pts[0].clone())
        }
        render.points = pts.map(p => this.plane.getPtAt(p))
        render.style = StyleUtils.getLineStyle(this.getStyle())
        return render
    }

    public clone(cloneGeo?: boolean) {
        const polyCurve = new GPolycurve(this.plane, cloneGeo ? this.geo.clone() : this.geo)
        return polyCurve._copyFrom(this)
    }
}
