import { types, Plane, Vec2 } from '@ccpc/math';
import { GNode2d } from './gnode2d';
import { RenderNode, RenderPoint } from '../render/render_node';

export class GPoint2d extends GNode2d {
    public declare geo: Vec2;

    constructor(plane: Plane, geo: Vec2) {
        super(plane, geo);
    }

    // 将二维点映射到所在平面，并生成对应的 RenderPoint。
    // 【与当前实现差异】
    // 当前完整实现里这里还会同步点样式。
    // 当前最小化版本未保留 style 体系，因此这里只保留点坐标转换。
    protected _toRenderNodeWithoutMatrix(): RenderNode {
        const render = new RenderPoint();
        render.point = this.plane.getPtAt(this.geo)
        return render;
    }

    // 返回当前二维点映射到平面后的三维坐标。
    public getPoint(): types.IXYZ {
        return this.plane.getPtAt(this.geo)
    }

    // TODO GPoint2d的clone方法待修改
    public override clone(cloneGeo?: boolean): GPoint2d {
        const copy = new GPoint2d(this.plane, cloneGeo ? this.geo.clone() : this.geo);
        copy._localMatrix = this._localMatrix?.clone();
        copy._globalMatrix = this._globalMatrix?.clone();
        return copy;
    }
}
