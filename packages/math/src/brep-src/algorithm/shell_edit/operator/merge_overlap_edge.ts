import { Curve3, alg, Tol } from '../../../..';
import { Edge } from '../../../brep/edge';
import { Shell } from '../../../brep/shell';



// 合并重叠的边，两条边完全重叠，且使用的顶点相同
export function mergeOverlapEdges(es: Edge[], tol?: Tol) {
    const tolerance = tol || Tol.DEFAULT;
    const allEdges = Array.from(new Set<Edge>(es));

    // 得到完全重叠的边
    const sameEdgesMap = new Map<Curve3, Edge[]>();
    for (const edge of allEdges) {
        const edgeSeg = edge.getCurve()!;
        let bMatch = false;
        for (const [first, second] of sameEdgesMap) {
            // same edge.
            if (
                alg.PJ.curvesOverlap(first, edgeSeg, tolerance.lengthEps, tolerance.angleEps) ===
                alg.CurvesPJType.TOTALLY_OVERLAP
            ) {
                second.push(edge);
                bMatch = true;
                break;
            }
        }
        if (!bMatch) {
            const edgeArray = Array.from([edge]);
            sameEdgesMap.set(edgeSeg, edgeArray);
        }
    }

    // 删除一些重复的边
    for (const edgeArray of sameEdgesMap.values()) {
        if (edgeArray.length <= 1) {
            continue;
        }

        // add coedges to the first edge.
        const firstEdge = edgeArray[0];
        const smoothFlag = edgeArray.every(it => it.getSmooth());
        for (let index = 1; index < edgeArray.length; index++) {
            const curEdge = edgeArray[index];
            const coedges = curEdge.getCoedge3ds().slice();
            let reverseFlag = false;
            if (
                curEdge.getStartVertex() !== firstEdge.getStartVertex() ||
                !curEdge.getCurve().getStartTangent().equals(firstEdge.getCurve().getStartTangent(), tolerance.angleEps)
            ) {
                reverseFlag = true;
            }
            for (const coedge of coedges) {
                coedge.setEdge(firstEdge);
                if (reverseFlag) {
                    coedge.reverse();
                }
            }
            const shell = curEdge.getParent() as Shell;
            if (shell) {
                shell.deleteEdge(curEdge);
                // TODO... add firstEdge to shell?
            }
            curEdge.dispose();
        }
        firstEdge.setSmooth(smoothFlag);
    }
}