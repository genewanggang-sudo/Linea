import { Tol, Vec3, alg, Curve3, Interval, Polygon } from '../../..';
import { Face } from '../../brep/face';



export class CurveFacesOverlap {
    /**
     * 计算line与Face的有交点
     * @param curve
     * @param face
     */
    public static execute(curve: Curve3, face: Face, tol = Tol.DEFAULT, facePoly?: Polygon): Interval[] {
        const poly2d = facePoly || face.calcPolygon();
        const surf = face.getSurface();
        const curveRange = curve.getRange();

        const curveKnots: { xPt: Vec3; curveT: number }[] = [];
        const edges = face.getEdges();
        for (const ie of edges) {
            const edgeCurve = ie.getCurve();
            const xPtInfos = alg.X.curve3ds(curve, edgeCurve, tol);
            for (const xInfo of xPtInfos) {
                if (curveKnots.length > 0) {
                    const prevXInfo = curveKnots[curveKnots.length - 1];
                    if (xInfo.point.sqDistanceTo(prevXInfo.xPt) < tol.edgeLengthEps2) {
                        continue;
                    }
                }

                curveKnots.push({ xPt: xInfo.point, curveT: xInfo.param1 });
            }
        }

        if (
            curveKnots.length > 1 &&
            curveKnots[0].xPt.sqDistanceTo(curveKnots[curveKnots.length - 1].xPt) < tol.edgeLengthEps2
        ) {
            curveKnots.pop();
        }

        curveKnots.sort((a, b) => a.curveT - b.curveT);

        const curveSegs: Interval[] = [];
        for (let i = 0; i < curveKnots.length; i++) {
            if (i === 0) {
                const midParam = (curveKnots[i].curveT + curveRange.min) / 2;
                const midPt = curve.getPtAt(midParam);
                const uv = surf.getUVAt(midPt);
                const position = alg.PJ.ptToPolygon(uv, poly2d, tol.numberEps);
                if (position !== alg.PtLoopPJType.OUT) {
                    const range = curveRange.clone();
                    range.max = curveKnots[i].curveT;
                    if (range.getLength() > tol.numberEps) {
                        curveSegs.push(range);
                    }
                }
            } else {
                const midParam = (curveKnots[i - 1].curveT + curveKnots[i].curveT) / 2;
                const midPt = curve.getPtAt(midParam);
                const uv = surf.getUVAt(midPt);
                const position = alg.PJ.ptToPolygon(uv, poly2d, tol.numberEps);
                if (position !== alg.PtLoopPJType.OUT) {
                    const range = curveRange.clone();
                    range.min = curveKnots[i - 1].curveT;
                    range.max = curveKnots[i].curveT;
                    if (range.getLength() > tol.numberEps) {
                        curveSegs.push(range);
                    }
                }
            }

            if (i === curveKnots.length - 1) {
                // 处理最后一个节点后的一段
                const midParam = (curveKnots[i].curveT + curveRange.max) / 2;
                const midPt = curve.getPtAt(midParam);
                const uv = surf.getUVAt(midPt);
                const position = alg.PJ.ptToPolygon(uv, poly2d, tol.numberEps);
                if (position !== alg.PtLoopPJType.OUT) {
                    const range = curveRange.clone();
                    range.min = curveKnots[i].curveT;
                    if (range.getLength() > tol.numberEps) {
                        curveSegs.push(range);
                    }
                }
            }
        }

        return curveSegs;
    }
}