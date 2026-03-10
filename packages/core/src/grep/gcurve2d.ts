import { Curve2, DiscretizeOptions, IVec3, Plane } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderEdge, RenderNode } from '../render/render_node';

export class GCurve2d extends GNode2d {
    public declare geo: Curve2;

    constructor(plane: Plane, geo: Curve2) {
        super(plane, geo);
    }

    // 将二维曲线离散成顺序点列，再映射到所在平面，生成对应的 RenderEdge。
    // 【与当前实现差异】
    // 当前完整实现里这里还会同步线样式。
    // 当前最小化版本未保留 style 体系，因此这里只保留离散后的点数据。
    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscretizeOptions): RenderNode {
        const render = new RenderEdge();
        render.points = [
            this.geo.discretize(discreteParams).map(p => this.plane.toWorld(p)),
        ];
        return render;
    }

    // 将二维曲线离散并映射为三维顺序点列。
    public discrete(params?: DiscretizeOptions): IVec3[] {
        return this.geo.discretize(params).map(v => this.plane.toWorld(v));
    }

    // 克隆当前二维曲线节点。
    // 【与当前实现差异】
    // 当前完整实现会走统一的 _copy() 链复制更多附加信息。
    // 当前最小化版本只复制 plane、geo 和矩阵字段。
    public override clone(cloneGeo?: boolean): GCurve2d {
        const copy = new GCurve2d(this.plane, cloneGeo ? this.geo.clone() : this.geo);
        copy._localMatrix = this._localMatrix?.clone();
        copy._globalMatrix = this._globalMatrix?.clone();
        return copy;
    }
}
