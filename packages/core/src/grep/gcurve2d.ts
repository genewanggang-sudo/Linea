import { Curve2, DiscreteParam, Plane } from '@ccpc/math';
import type { types } from '@ccpc/math'
import { GNode2d } from './gnode2d';
import { RenderEdge, RenderNode } from '../render/render_node';
import { GNODE_TYPE } from './gnode_type';
import { IStyle } from './i_style';
import { StyleUtils } from './style_utils';

export class GCurve2d extends GNode2d {
    public declare geo: Curve2;

    constructor(plane: Plane, geo: Curve2) {
        super(plane, geo);
    }

    public setStyle(style: IStyle) {
        super.setStyle(style)
        if (this._renderNode) {
            this._renderNode.style = StyleUtils.getLineStyle(this.getStyle())
        }
        return this
    }

    public override getType(): GNODE_TYPE {
        return GNODE_TYPE.GCurve2d
    }

    // 将二维曲线离散成顺序点列，再映射到所在平面，生成对应的 RenderEdge。
    // 【与当前实现差异】
    // 当前完整实现里这里还会同步线样式。
    // 当前最小化版本未保留 style 体系，因此这里只保留离散后的点数据。
    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderNode {
        const render = new RenderEdge();
        render.points = this.geo.discrete(discreteParams).map(p => this.plane.getPtAt(p))
        render.style = StyleUtils.getLineStyle(this.getStyle())
        return render
    }

    // 将二维曲线离散并映射为三维顺序点列。
    public discrete(params?: DiscreteParam): types.IXYZ[] {
        return this.geo.discrete(params).map(v => this.plane.getPtAt(v));
    }

    public clone(cloneGeo?: boolean): GCurve2d {
        const curve2d = new GCurve2d(this.plane, cloneGeo ? this.geo.clone() : this.geo)
        return curve2d._copyFrom(this)
    }
}
