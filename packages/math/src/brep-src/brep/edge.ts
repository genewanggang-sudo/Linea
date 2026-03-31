
import { Vertex } from './vertex';
import { Coedge3d } from './coedge3d';
import { Face } from './face';

import { TopoObject } from './topo_object';
import { IDBEdge, IDBTopoObject } from '../type_define/i_types';
import { Shell } from './shell';
import { Box3 } from '../../base/box3';
import { DiscreteParam } from '../../base/discrete_param';
import { PeriodInterval } from '../../base/period_inverval';
import { Tol } from '../../base/tol';
import { Vec3 } from '../../base/vec3';
import { Curve3 } from '../../geometry/curve3d';
import { Loader } from '../../loader/loader';
import { registerGeo } from '../../loader/register_geo';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { types } from '../../type_define/i_types';
import { MathAssert } from '../../util/assert';

// 边的标记: ...| isDegenerate | isSmooth |
const SMOOTH_MASK: number = 1;
const DEGENERATE_MASK: number = 1 << 1; // 退化边

/**
 * @author tiansk
 *  Brep体中的三维边,一条边对应2条CoEdge
 */
@registerGeo
class Edge extends TopoObject {
    // 三维曲线，无限长
    private _curve!: Curve3;

    // Edge的起始点
    private _startVertex: Vertex | undefined;

    // Edge的终止点
    private _endVertex: Vertex | undefined;

    // Edge包含的所有半边，运行时数据，不序列化
    private _coedges: Coedge3d[] = [];

    private _tol?: number;

    constructor(curve?: Curve3, startVertex?: Vertex, endVertex?: Vertex) {
        super();

        if (curve) this._curve = curve;
        if (startVertex) this.setStartVertex(startVertex);
        if (endVertex) this.setEndVertex(endVertex);
    }

    /**
     * 获取所属的Shells
     */
    public getShell(): Shell | undefined {
        return this.getParent() as Shell;
    }

    public getCurve() {
        return this._curve;
    }

    public get tolerance() {
        return this._tol;
    }

    public setCurve(curve: Curve3) {
        this._curve = curve;
    }

    public getSmooth(): boolean {
        return this._flags !== undefined ? (this._flags & SMOOTH_MASK) !== 0 : false;
    }

    public setSmooth(isSmooth: boolean) {
        this._flags = this._flags || 0;
        if (isSmooth) {
            this._flags |= SMOOTH_MASK;
        } else {
            this._flags &= ~SMOOTH_MASK;
        }
    }

    // 判断是否是退化边，用于区分接近0长度的无效edge
    public isDegenerate(): boolean {
        return this._flags !== undefined ? (this._flags & DEGENERATE_MASK) !== 0 : false;
    }

    public setDegenerateFlag(b = false) {
        this._flags = this._flags || 0;
        if (b) {
            this._flags |= DEGENERATE_MASK;
        } else {
            this._flags &= ~DEGENERATE_MASK;
        }
    }

    /**
     * 向Edge中添加一条半边，只能在半边的构造函数中调用！
     * @param coedge
     */
    public addCoedge3d(coedge: Coedge3d): void {
        this._coedges.push(coedge);
    }

    /**
     * 向Edge中删除一条半边，只能在删除半边、环、面的时候调用！
     * @param hEdge
     */
    public deleteCoedge3d(hEdge: Coedge3d): void {
        const index = this._coedges.indexOf(hEdge);
        if (index >= 0) {
            this._coedges.splice(index, 1);
            // TODO... may need to remove relationship coedge -> edge
        }
    }

    /**
     * 将Edge中所有的半边都删除
     */
    public deleteAllCoedge3ds(): void {
        // TODO... may need to remove relationship coedge -> edge
        this._coedges = [];
    }

    /**
     * 获取通过首尾Vertex裁剪curve的结果
     * @deprecated edge中curve的参数域应已根据vertex进行了裁剪，而不必再调用此函数，直接调用getCurve()就行
     */
    public getBoundedCurve(): Curve3 {
        const curve = this._curve.clone();
        const p1 = curve.getParamAt(this._startVertex!.getPoint());
        const p2 = curve.getParamAt(this._endVertex!.getPoint());
        if (Math.abs(p1 - p2) < Tol.NUMBER && this._curve.isPeriodic()) {
            const periodicRange = this._curve.getRange() as PeriodInterval;
            curve.setRange(p1, p1 + periodicRange.period);
        } else {
            curve.setRange(p1, p2);
        }
        return curve;
    }

    public getStartVertexTag(): string {
        return this._startVertex ? this._startVertex.tag : '';
    }

    public getEndVertexTag(): string {
        return this._endVertex ? this._endVertex.tag : '';
    }

    public setStartVertex(startVertex: Vertex) {
        if (this._startVertex) {
            if (this._startVertex === startVertex) {
                return;
            }

            // 如果整圆edge，起点和终点vertex一样，不能删除
            if (this._endVertex && this._startVertex !== this._endVertex) {
                this._startVertex.deleteEdge(this);
            }
        }

        this._startVertex = startVertex;

        if (this._startVertex) {
            this._startVertex.addEdge(this);
        }
    }

    public setEndVertex(endVertex: Vertex) {
        if (this._endVertex) {
            if (this._endVertex === endVertex) {
                return;
            }

            // 如果整圆edge，起点和终点vertex一样，不能删除
            if (this._startVertex && this._startVertex !== this._endVertex) {
                this._endVertex.deleteEdge(this);
            }
        }

        this._endVertex = endVertex;

        if (this._endVertex) {
            this._endVertex.addEdge(this);
        }
    }

    public getAnotherVertex(vertex: Vertex): Vertex {
        MathAssert.assert(
            vertex !== undefined &&
            ((this._startVertex && this._startVertex.tag === vertex.tag) ||
                (this._endVertex && this._endVertex.tag === vertex.tag)),
            'Edge.getAnotherVertex: unknown vertex',
        );
        if (this._startVertex && this._startVertex.tag === vertex.tag) {
            return this._endVertex!;
        }
        return this._startVertex!;
    }

    /**
     * 获取其他半边
     * @param tag
     */
    public getOtherCoedge3ds(coedge: Coedge3d): Coedge3d[] {
        return this.getCoedge3ds().filter(c3d => c3d.tag !== coedge.tag);
    }

    /**
     * 获取edge关联的全部Coedge3d
     */
    public getCoedge3ds(): ReadonlyArray<Coedge3d> {
        return this._coedges;
    }

    /**
     * 获取edge对应的face
     */
    public getFaces(): Face[] {
        const faces: Face[] = [];
        for (const ce of this._coedges) {
            const face = ce.getFace();
            if (face) {
                faces.push(face);
            }
        }
        return faces;
    }

    /**
     * 获取edge对应的起始Vertex
     */
    public getStartVertex(): Vertex {
        return this._startVertex!;
    }

    /**
     * 获取edge对应的终止Vertex
     */
    public getEndVertex(): Vertex {
        return this._endVertex!;
    }

    /**
     * 清除Edge中的拓扑关系
     */
    public dispose(): void {
        this.deleteAllCoedge3ds();
        if (this._startVertex) {
            this._startVertex.deleteEdge(this);
        }
        if (this._endVertex) {
            this._endVertex.deleteEdge(this);
        }
    }

    public getBBox(): Box3 {
        if (this._curve.isLine3d()) {
            return new Box3([this.getStartVertex().getPoint(), this.getEndVertex().getPoint()]);
        }
        return this._curve.getBBox();
    }

    public updateTolerance() {
        if (this._startVertex && this._endVertex) {
            const stSqrDist = this._curve.getStartPt().sqDistanceTo(this.getStartVertex().getPoint());
            const endSqrDist = this._curve.getEndPt().sqDistanceTo(this.getEndVertex().getPoint());
            const maxSqrDist = stSqrDist > endSqrDist ? stSqrDist : endSqrDist;
            if (maxSqrDist > Tol.LENGTH_2) {
                this._tol = Math.sqrt(maxSqrDist);
            }
        }
    }

    /**
     * 离散。因为曲线不精确，所以首尾顶点用 vertex 替代
     * @param params
     */
    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        const pts = this._curve.discrete(params);
        if (this._startVertex) pts[0] = this._startVertex.getPoint().clone();
        if (this._endVertex) pts[pts.length - 1] = this._endVertex.getPoint().clone();
        return pts;
    }

    public tessellate(params = DiscreteParam.NORMAL): types.IRenderNode {
        const curve = this._curve.discrete(params).map(_ => _.toArray3());

        return {
            edges: [curve],
        };
    }

    public dump(): IDBEdge {
        // 对于直线边，不存储其内部的曲线
        const result = super.dump() as IDBEdge;
        result.c = !this._curve.isLine3d() ? this._curve.dump() : undefined;
        result.sVTag = this._startVertex ? this._startVertex.tag : '';
        result.eVTag = this._endVertex ? this._endVertex.tag : '';
        return result;
    }

    public load({ tag, flag, data, c, _d }: IDBEdge) {
        super.load({ tag, flag, data, _d } as IDBTopoObject);
        if (c) {
            const curve3d: Curve3 = Loader.load(c) as Curve3;
            this._curve = curve3d;
        }
        return this;
    }

    public getType(): EN_GEO_TYPE.BREP_EDGE {
        return EN_GEO_TYPE.BREP_EDGE;
    }
}

export { Edge };
