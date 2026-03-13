import { Box3, Curve3, SmoothPoly3, Vec3 } from '../..';
import { Edge } from '../brep/edge';



/**
 * 多个边组成的连续边
 */
export class ContinuousEdge {
    // 多个边
    private _edges: Edge[];

    // 顺序标记
    private _flags: boolean[];

    // 参考曲线
    private _refCurve?: Curve3;

    constructor(edges: Edge[], flags: boolean[], refCurve?: Curve3) {
        this._edges = edges;
        this._flags = flags;
        this._refCurve = refCurve;
    }

    public getEdges(): ReadonlyArray<Edge> {
        return this._edges;
    }

    public getFlags(): ReadonlyArray<boolean> {
        return this._flags;
    }

    public getRefCurve(): Curve3 | undefined {
        return this._refCurve;
    }

    public isClose(): boolean {
        const length = this._edges.length;
        if (length <= 1) {
            return false;
        }
        const spt = this._flags[0]
            ? this._edges[0].getStartVertex().getPoint()
            : this._edges[0].getEndVertex().getPoint();
        const ept = this._flags[length - 1]
            ? this._edges[length - 1].getEndVertex().getPoint()
            : this._edges[length - 1].getStartVertex().getPoint();
        return spt.equals(ept);
    }

    public getBBox(): Box3 {
        const box = new Box3();

        this._edges.forEach(edge => {
            box.union(edge.getBBox());
        });

        return box;
    }

    public getSmoothPoly(): SmoothPoly3 | undefined {
        if (!this._edges.length) {
            return undefined;
        }
        const pts: Vec3[] = [];
        pts.push(
            this._flags[0] ? this._edges[0].getStartVertex().getPoint() : this._edges[0].getEndVertex().getPoint(),
        );
        for (let index = 0; index < this._edges.length; index++) {
            pts.push(
                this._flags[index]
                    ? this._edges[index].getEndVertex().getPoint()
                    : this._edges[index].getStartVertex().getPoint(),
            );
        }

        return new SmoothPoly3(pts);
    }
}