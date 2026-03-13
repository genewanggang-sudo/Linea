import { types } from '../../type_define/i_types';
import { PtLoopPJType } from './pj_type';
import { Tol } from '../../base/tol';
import { Vec2 } from '../../base/vec2';



interface IRange {
    min: number;
    max: number;
}

interface ISegment extends IRange {
    stPoint: types.IXY;
    edPoint: types.IXY;
}

interface INode extends IRange {
    st: number;
    ed: number;
}

interface INodeIndex {
    layer: number;
    index: number;
}

// this can be optimized by reducing array alloc
class SegmentTree {
    // all the nodes stored by layers:
    // [0] for segment, [1] for nodes on layer 1, [nodes.length - 1][0] for root
    private _nodes: IRange[][] = [];

    constructor(pointLoops: types.IXY[][], nodeSize = 4) {
        const segments: ISegment[] = [];
        pointLoops.forEach(pts => {
            for (let i = 0; i < pts.length; i++) {
                const st = pts[i];
                const ed = pts[(i + 1) % pts.length];
                const [min, max] = st.y < ed.y ? [st.y, ed.y] : [ed.y, st.y];
                segments.push({ stPoint: st, edPoint: ed, min, max });
            }
        });
        segments.sort((seg1, seg2) => (seg1.min === seg2.min ? seg1.max - seg2.max : seg1.min - seg2.min));
        this._nodes.push(segments);

        for (let baseNodes: IRange[] = segments; baseNodes.length > 1;) {
            const n = Math.ceil(baseNodes.length / nodeSize);
            const newNodes = new Array<INode>(n);
            for (let i = 0; i < n; i++) {
                const st = i * nodeSize;
                const ed = i === n - 1 ? baseNodes.length : st + nodeSize;
                let max = baseNodes[st].max;
                for (let ni = st + 1; ni < ed; ni++) {
                    if (baseNodes[ni].max > max) max = baseNodes[ni].max;
                }
                const min = baseNodes[st].min;
                newNodes[i] = { min, max, st, ed };
            }
            this._nodes.push(newNodes);
            baseNodes = newNodes;
        }
    }

    public findSegments(y: number, eps: number = Tol.LENGTH): ISegment[] {
        const stack: INodeIndex[] = [{ layer: this._nodes.length - 1, index: 0 }];
        const ret: ISegment[] = [];
        const upY = y + eps;
        const downY = y - eps;
        while (stack.length > 0) {
            const idx = stack.pop()!;
            const node = this._nodes[idx.layer][idx.index] as INode;
            const children = this._nodes[idx.layer - 1];
            for (let i = node.st; i < node.ed; i++) {
                const child = children[i];
                if (child.min < upY && child.max > downY) {
                    if ((child as ISegment).stPoint) {
                        ret.push(child as ISegment);
                    } else {
                        stack.push({ layer: idx.layer - 1, index: i });
                    }
                }
            }
        }
        return ret;
    }
}

/**
 * 仅用于点和多边形的内外关系判断
 * 通过对边的排序，使得对多个点的判断效率为 O(n log(m))，n为点数，m为边数
 */
export class PtPolygonPositionJudger {
    private _tree: SegmentTree;

    constructor(pointLoops: types.IXY[][]) {
        this._tree = new SegmentTree(pointLoops);
    }

    // judg by ray (1, 0) from point
    public judge(point: types.IXY, eps: number = Tol.LENGTH): PtLoopPJType {
        const segs = this._tree.findSegments(point.y, eps);
        let rightSegCount = 0;
        let isNearEdge = false;

        for (const seg of segs) {
            const dp = new Vec2(point).subtract(seg.stPoint);

            // near point
            if (dp.getSqLength() < eps * eps) return PtLoopPJType.ONVERTEX;

            // near edge
            const dir = new Vec2(seg.edPoint).subtract(seg.stPoint);
            const segLen = dir.getLength();
            dir.multiply(1 / segLen);

            const param = dp.dot(dir);
            const dist = dp.dot({ x: -dir.y, y: dir.x });

            if (Math.abs(dist) < eps && param > 0 && param < segLen) {
                isNearEdge = true;
                continue;
            }

            // y on point
            if (Math.abs(dp.y) < eps) continue;

            // normal
            const x = param * dir.x + seg.stPoint.x;
            if (x > point.x) rightSegCount++;
        }

        if (isNearEdge) return PtLoopPJType.ONEDGE;

        return rightSegCount % 2 === 0 ? PtLoopPJType.OUT : PtLoopPJType.IN;
    }
}