import { Curve3, alg, Tol, Util, IntersectCurve3 } from '../../..';



import { Face } from '../../brep/face';
import { BrepPJ } from '../brep_pj';

/**
 * face 与 face求交，返回值为交线
 */
export class FacesX {
    /**
     * Face与Face相交，结果为交线（交点可认为是退化成的线）
     * @param face1
     * @param face2
     * @returns 交线可能不止一条，故返回交线的数组,若无交线，则返回空数组
     */
    public static execute(face1: Face, face2: Face, tolerance: number = Tol.NUMBER): Curve3[] {
        // 不处理平行的情况
        if (face1.isPlane() && face2.isPlane() && face1.getCenterNorm().isParallel(face2.getCenterNorm())) {
            return [];
        }

        // 判断是否有交
        const box1 = face1.getBBox();
        const box2 = face2.getBBox();
        if (!box1.intersectsBox(box2, tolerance)) {
            return [];
        }

        const surface1 = face1.getSurface();
        const surface2 = face2.getSurface();

        const interCurves = alg.X.surfacesSimplified(
            surface1,
            surface2,
            surface1.getDomainU(),
            surface1.getDomainV(),
            surface2.getDomainU(),
            surface2.getDomainV(),
        );

        const result: Curve3[] = [];
        interCurves.forEach(interCurve => {
            let curve = interCurve;
            if (interCurve instanceof IntersectCurve3) {
                curve = interCurve.toNurbs();
            }
            const ranges1 = FacesX._getInterRanges(curve, face1);
            const ranges2 = FacesX._getInterRanges(curve, face2);

            const curveSegments: Curve3[] = []; // 同时在 face1 和 face2 上的线段
            let i = 0;
            let j = 0;
            while (i < ranges1.length && j < ranges2.length) {
                // 遍历寻找相交区间
                const min = Math.max(ranges1[i].min, ranges2[j].min);
                const max = Math.min(ranges1[i].max, ranges2[j].max);
                if (Util.isNearlySmaller(min, max)) {
                    curveSegments.push(curve.clone().setRange(min, max));
                }

                // 跳过末端较小的区间
                if (ranges1[i].max < ranges2[j].max) {
                    i++;
                } else {
                    j++;
                }
            }

            // 合并圆弧
            if (
                curve.isArc3d() &&
                curveSegments.length > 1 &&
                curveSegments[0].getStartPt().equals(curveSegments[curveSegments.length - 1].getEndPt())
            ) {
                // arc3d 的 getParamAt 函数返回值值域为 [range.Min, range.Min + PI2)，故重设最后一段的 range.max，并删掉第一段
                const arc3d = curveSegments[curveSegments.length - 1];
                const max = arc3d.getParamAt(curveSegments[0].getEndPt());
                arc3d.setRange(arc3d.getRange().min, max);

                curveSegments.shift();
            }

            // 合并 nurbs 曲线
            if (
                curve.isNurbsCurve3d() &&
                curveSegments.length > 1 &&
                curveSegments[0].getStartPt().equals(curveSegments[curveSegments.length - 1].getEndPt())
            ) {
                // arc3d 的 getParamAt 函数返回值值域为 [range.Min, range.Min + PI2)，故重设最后一段的 range.max，并删掉第一段
                const arc3d = curveSegments[curveSegments.length - 1];
                const max = arc3d.getParamAt(curveSegments[0].getEndPt());
                arc3d.setRange(arc3d.getRange().min, max);

                curveSegments.shift();
            }

            if (
                curveSegments.length > 1 &&
                curveSegments[0].getStartPt().equals(curveSegments[curveSegments.length - 1].getEndPt())
            ) {
                if (curve.isArc3d()) {
                    // arc3d 的 getParamAt 函数返回值值域为 [range.Min, range.Min + PI2)，故重设最后一段的 range.max，并删掉第一段
                    const arc3d = curveSegments[curveSegments.length - 1];
                    const max = arc3d.getParamAt(curveSegments[0].getEndPt());
                    arc3d.setRange(arc3d.getRange().min, max);
                    curveSegments.shift();
                }

                if (curve.isNurbsCurve3d() && curve.isPeriodic()) {
                    // nurbs3d 的参数域为[0,1]，若为周期函数，它的周期为1，故重设最后一段的 range.max，并删掉第一段
                    // 由于我们默认 nurbs 曲线的参数域为[0,1]，因此该结果不建议继续在几何算法中参与计算
                    const nurbs = curveSegments[curveSegments.length - 1];
                    nurbs.setRange(nurbs.getRange().min, curveSegments[0].getRange().max + 1);
                    curveSegments.shift();
                }
            }

            result.push(...curveSegments);
        });

        return result;
    }

    /**
     * 取 curve 在 face 上的参数区域（默认 curve 在 face 上）
     * @param curve
     * @param face
     * @param face 额外的需要求交的线段
     * @returns [start, end]
     */
    private static _getInterRanges(curve: Curve3, face: Face): { min: number; max: number }[] {
        const tolerance = new Tol(Tol.EDGE_LENGTH_EPS);

        // curve 与 face 的边界求交得到交点参数
        const interParams: number[] = [];
        face.getWires().forEach(wire =>
            wire.getCoedge3ds().forEach(coedge => {
                const edgeCurve = coedge.getCurve();
                const borderCurves = edgeCurve.isSmoothPoly3d() ? edgeCurve.getSegments() : [edgeCurve];
                borderCurves.forEach(borderCurve => {
                    const inters = alg.X.curve3ds(curve, borderCurve, tolerance);
                    interParams.push(...inters.map(info => curve.getParamAt(info.point)));
                });
            }),
        );

        // 没有交点返回整个区间
        const range = curve.getRange();
        if (interParams.length === 0) {
            return [range];
        }

        interParams.sort((a, b) => a - b);
        // min
        if (Util.isNearlyEqual(interParams[0], range.min)) {
            interParams[0] = range.min;
        } else {
            interParams.unshift(range.min);
        }
        // max
        if (Util.isNearlyEqual(interParams[interParams.length - 1], range.max)) {
            interParams[interParams.length - 1] = range.max;
        } else {
            interParams.push(range.max);
        }

        const result: { min: number; max: number }[] = [];
        interParams.forEach((min, index) => {
            const max = interParams[index + 1];
            if (
                max !== undefined &&
                min !== max &&
                BrepPJ.isPtInFace(curve.getPtAt((min + max) / 2), face, Tol.EDGE_LENGTH_EPS)
            ) {
                if (result.length && result[result.length - 1].max === min) {
                    result[result.length - 1].max = max; // 尝试与前一个合并
                } else {
                    result.push({ min, max });
                }
            }
        });
        return result;
    }
}

