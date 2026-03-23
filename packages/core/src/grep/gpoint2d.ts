import { types, Plane, Vec2 } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderNode, RenderPoint } from '../render/render_node';
import { IStyle } from './i_style';
import { StyleUtils } from './style_utils';

export class GPoint2d extends GNode2d {
    public declare geo: Vec2;

    constructor(plane: Plane, geo: Vec2) {
        super(plane, geo);
    }

    public setStyle(style: IStyle) {
        super.setStyle(style)
        if (this._renderNode) {
            this._renderNode.style = StyleUtils.getPointStyle(this.getStyle())
        }
        return this
    }

    protected _toRenderNodeWithoutMatrix(): RenderNode {
        const render = new RenderPoint();
        render.point = this.plane.getPtAt(this.geo)
        render.style = StyleUtils.getPointStyle(this.getStyle())
        return render;
    }

    // 返回当前二维点映射到平面后的三维坐标。
    public getPoint(): types.IXYZ {
        return this.plane.getPtAt(this.geo)
    }

    public override clone(cloneGeo?: boolean): GPoint2d {
        const gPoint = new GPoint2d(this.plane, cloneGeo ? this.geo.clone() : this.geo)
        return gPoint._copyFrom(this)
    }
}
