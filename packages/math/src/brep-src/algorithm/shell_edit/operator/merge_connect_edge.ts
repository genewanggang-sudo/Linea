import { alg, Ln3, Curve3, Arc3, NurbsCurve3, Util } from '../../../..';
import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';
import { Shell } from '../../../brep/shell';
import { Coedge3d } from '../../../brep/coedge3d';



/**
 * check edge1 and edge2 can merge to one edge on the connected vertex. conditions:
 * 1.edge1 and edge2 has same number of half edges.
 * 2.edge curve is line, edge1 and edge2 is colinear and not overlaped.
 * 3.edge1 and edge2 is connected on the same vertex.
 * 4.connected vertex's involve edges should be edge1 and edge2.
 * 5.any half edge in edge1 should has prev or next half edge(in same wire) in edge2.
 *
 * @param edge1
 * @param edge2
 */
function canMergeConnectedEdge(edge1: Edge, edge2: Edge, commonV: Vertex): boolean {
    if (!edge1 || !edge2) {
        return false;
    }

    const halfEdges1 = edge1.getCoedge3ds();
    const halfEdges2 = edge2.getCoedge3ds();
    if (!halfEdges1.length || !halfEdges2.length || halfEdges1.length !== halfEdges2.length) {
        return false;
    }

    // 边是连续的，且不重叠.
    const bc1 = edge1.getCurve();
    const bc2 = edge2.getCurve();
    if (
        !alg.CurvesColinear.curve3ds(bc1 as Ln3, bc2 as Ln3) ||
        alg.PJ.curvesOverlap(bc1, bc2) === alg.CurvesPJType.OVERLAP
    ) {
        return false;
    }

    // check edge1 and edge2 is connected.
    const vertices1: Vertex[] = [edge1.getStartVertex(), edge1.getEndVertex()];
    const vertices2: Vertex[] = [edge2.getStartVertex(), edge2.getEndVertex()];
    if (!(vertices1.some(_ => _ === commonV) && vertices2.some(_ => _ === commonV))) {
        return false;
    }

    // connected vertex's involve edges should be edge1 and edge2.
    const involveEdges = commonV.getEdges().filter(e => e.getCoedge3ds().length);
    if (involveEdges.length !== 2 || involveEdges.indexOf(edge1) < 0 || involveEdges.indexOf(edge2) < 0) {
        return false;
    }

    // TODO... any half edge in edge1 should has prev or next half edge(in same loop) in edge2.
    // for (const he of halfEdges1) {
    //     if (!he.prev || !he.next || (halfEdges2.indexOf(he.prev) === -1) && (halfEdges2.indexOf(he.next) === -1)) {
    //         return false;
    //     }
    // }

    return true;
}

// 将相连接的边合并，支持直线边、圆弧、nurbs
// 如果合并成功，则返回新的边；如果不满足合并的条件，则返回undefined
export function mergeConnectedEdge(edge1: Edge, edge2: Edge, commonV: Vertex): Edge | undefined {
    if (!canMergeConnectedEdge(edge1, edge2, commonV)) {
        return undefined;
    }

    // 得到连接点
    const vertex = commonV;
    const vertex0 = edge1.getStartVertex() === vertex ? edge1.getEndVertex() : edge1.getStartVertex();
    const vertex1 = edge2.getStartVertex() === vertex ? edge2.getEndVertex() : edge2.getStartVertex();
    const shell = vertex.getParent() as Shell;

    let newEdgeCurve: Curve3 | undefined;
    const edge1Curve = edge1.getCurve();
    if (edge1Curve instanceof Ln3) {
        newEdgeCurve = new Ln3(vertex0.getPoint(), vertex1.getPoint());
    } else if (edge1Curve instanceof Arc3) {
        if (edge1Curve.isEqualAB()) {
            const n = edge1.getStartVertex() === vertex ? edge1Curve.getNormal().reversed() : edge1Curve.getNormal();
            newEdgeCurve = Arc3.makeArcByStartEndPoints(
                edge1Curve.getCenter(),
                edge1Curve.getRadius(),
                n,
                vertex0.getPoint(),
                vertex1.getPoint(),
                true,
            );
        } else {
            const a = edge1Curve.getCenter().added(edge1Curve.getCoord().getDx().multiplied(edge1Curve.getA()));
            const sign = edge1.getStartVertex() === vertex ? -1 : 1;
            const b = edge1Curve.getCenter().added(
                edge1Curve
                    .getCoord()
                    .getDy()
                    .multiplied(sign * edge1Curve.getB()),
            );
            newEdgeCurve = Arc3.makeEllipseByFivePoints(
                edge1Curve.getCenter(),
                a,
                b,
                vertex0.getPoint(),
                vertex1.getPoint(),
            );
        }
    } else if (edge1Curve instanceof NurbsCurve3) {
        if (edge1.getStartVertex() === vertex) {
            const max = edge1Curve.getRange().max;
            const min = edge1Curve.getRange().min - edge2.getCurve().getRange().getLength();
            if (Util.isNearlyBiggerOrEqual(min, 0)) {
                newEdgeCurve = edge1Curve.clone();
                newEdgeCurve.setRange(min, max);
                newEdgeCurve.reverse();
            }
        } else {
            const min = edge1Curve.getRange().min;
            const max = edge1Curve.getRange().max + edge2.getCurve().getRange().getLength();
            if (Util.isNearlySmallerOrEqual(max, 1)) {
                newEdgeCurve = edge1Curve.clone();
                newEdgeCurve.setRange(min, max);
            }
        }
    }
    if (!newEdgeCurve) {
        return undefined;
    }

    const newEdge = new Edge(newEdgeCurve, vertex0, vertex1);
    shell.addEdge(newEdge);

    // 创建新的半边
    const stangent = newEdgeCurve.getStartTangent();
    const startHalfEdges1 = edge1.getCoedge3ds().filter(he => he.getStartVertex() === vertex0);
    const startHalfEdges2 = edge2.getCoedge3ds().filter(he => he.getStartVertex() === vertex1);
    for (const he of startHalfEdges1.concat(startHalfEdges2)) {
        const loop = he.getWire()!;

        const sameDir = he.getStartVertex() === vertex0 && he.getCurve().getStartTangent().equals(stangent);
        const newHalfEdge = new Coedge3d(newEdge, sameDir);

        const originCoedges = loop.getCoedge3ds();
        const index = originCoedges.indexOf(he);
        const nextHe = originCoedges[(index + 1) % originCoedges.length];

        loop.insertCoedge3d(index, newHalfEdge);
        loop.deleteCoedge3d(he);
        loop.deleteCoedge3d(nextHe);
    }

    // 更新合并边上面的标记位
    if (edge1.getFlags() && edge2.getFlags()) {
        newEdge.setFlags(edge1.getFlags()! & edge2.getFlags()!);
    }

    // 清除关系
    edge1.dispose();
    edge2.dispose();
    shell.deleteEdge(edge1);
    shell.deleteEdge(edge2);
    shell.deleteVertex(vertex);

    return newEdge;
}