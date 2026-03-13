import { PtLoopPJType } from './pj_type';
import { Vec2 } from '../../base/vec2';
import { Loop } from '../../topology/loop';
import { Ln2 } from '../../geometry/ln2';
import { Curve2 } from '../../geometry/curve2';
import { Tol } from '../../base/tol';
import { Util } from '../../util/util';
import { CurvesX } from '../intersect/curves_x';
import { Interval } from '../../base/interval';
import { ICurvesXInfo2d } from '../intersect/x_info';
import { MathError } from '../../util/math_error';



/**
 *
 *  点与Loop的位置关系判断
 *  [参考文献](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf)
 */
class PtLoopPJ {
    /**
     * @param point
     * @param loop
     * @param tolerance
     * @returns `CurvesPJType`
     */
    public static execute(
        pt: Vec2,
        loop: Loop,
        eps: number = Tol.LENGTH,
    ): {
        type: PtLoopPJType;
        curve?: Curve2;
    } {
        const tol = new Tol(eps);
        MathError.mutedWarn(loop.isClosed(tol), 'PtLoopPJ: loop不封闭！！！！！！');
        // const sqrEps = eps * eps;
        // const curveMap = new Map<Curve2, Curve2>();
        // const newCurves = this._decomposeToCurves(loop, curveMap);
        const newCurves = loop.getAllCurves();
        const curvesCount = newCurves.length;
        if (curvesCount < 1) {
            return { type: PtLoopPJType.OUT };
        }

        // 1.与端点重合
        for (let i = 0; i < curvesCount; ++i) {
            const theCurve = newCurves[i];
            const stPt = theCurve.getStartPt();
            if (pt.equals(stPt, eps)) {
                return {
                    type: PtLoopPJType.ONVERTEX,
                    curve: theCurve,
                };
            }
        }

        const ptX = pt.x;
        const ptY = pt.y;
        let prevEndRefY = 0; // 如果startPt在射线上，要看前一条curve的endPt前面段是在上方还是下方：1，上方；-1，下方；0：未记录

        // 如果第一条curve的起点就在射线上，避免不了要计算前一条（非水平直线的）curve的endPt前面段是在上方还是下方
        let lastValidCurve: Curve2 | undefined;
        let prevCurveIntersct: ICurvesXInfo2d[] = [];
        const firstCurveStPt = newCurves[0].getStartPt();
        if (Util.isNearlyEqual(firstCurveStPt.y, ptY, eps) && Util.isNearlyBigger(firstCurveStPt.x, ptX, eps)) {
            // 找到前一条非水平直线的curve
            let tmp = curvesCount - 1;
            lastValidCurve = newCurves[tmp];
            while (lastValidCurve instanceof Ln2 && Math.abs(lastValidCurve.getDirection().y) < eps) {
                tmp--;
                lastValidCurve = newCurves[tmp];
            }

            // 找不到prevValidCurve，只可能是因为，loop是多条水平直线往返构成的环
            if (lastValidCurve === undefined) {
                return this._dealHorizontalLineLoop(pt, loop, eps);
            }

            const line = new Ln2(pt, Vec2.X(), Interval.infinitArray());
            prevCurveIntersct = CurvesX.curve2ds(line, lastValidCurve, tol); // 直线和曲线求交，只用于找在射线上下的参考
            prevCurveIntersct.sort((it1, it2) => it1.param2 - it2.param2);
            const prevEndRefPt = this._getRefPt(lastValidCurve, prevCurveIntersct, false, eps);
            prevEndRefY = prevEndRefPt.y - pt.y;
        }

        let intersctCount = 0;
        for (let i = 0; i < curvesCount; ++i) {
            const theCurve = newCurves[i];
            const stPt = theCurve.getStartPt();
            const endPt = theCurve.getEndPt();
            if (theCurve instanceof Ln2) {
                // 水平直线：特殊处理
                if (Util.isNearlyEqual(stPt.y, ptY, eps) && Util.isNearlyEqual(endPt.y, ptY, eps)) {
                    // 2.1 点在直线上：点在水平线段上
                    if (Util.isNearlySmaller(endPt.x, ptX, eps) === Util.isNearlyBigger(stPt.x, ptX, eps)) {
                        return {
                            type: PtLoopPJType.ONEDGE,
                            curve: theCurve,
                        };
                    }
                    continue; // 不在水平线段上，不用处理
                }

                // 直线的y值区间包含点的y值
                const yRange = new Interval(stPt.y, endPt.y, true);
                if (yRange.containsPt(ptY, eps)) {
                    // 计算与射线（直线）的交点: y = ptY
                    const intersctT = (ptY - theCurve.getOrigin().y) / theCurve.getDirection().y;
                    // 当theCurve斜率大于1的时候，y的range包含了ptY基本上x的range也就包含了x；但是
                    // 当theCurve斜率很小的时候，即使y的range包含了ptY，y在yRange外面很小，但是x可能出了xRange很多，因此需要判断交点是否在参数范围内（见bugTest_40488962，仔细思考）
                    if (theCurve.getRange().containsPt(intersctT, eps)) {
                        const intersctX = theCurve.getOrigin().x + intersctT * theCurve.getDirection().x; // 交点x坐标

                        // 2.2 点在直线上
                        if (Util.isNearlyEqual(intersctX, ptX, eps) || theCurve.containsPt(pt, eps)) {
                            return {
                                type: PtLoopPJType.ONEDGE,
                                curve: theCurve,
                            };
                        }

                        // 3.ray与line相交: ptX + eps < intersctX
                        if (Util.isNearlyBigger(intersctX, ptX, eps)) {
                            // 3.1 如果交点是直线段起点：需要寻找上一条曲线，两条曲线联合起来判断是否被射线穿过
                            if (Util.isNearlyEqual(stPt.y, ptY, eps)) {
                                // 未来可能出现loop有容差，或者上一直线接近水平又不完全水平，导致起点在ray上但是上一条curve的终点不在ray上
                                // MathAssert.assert(Util.isNearlyEqual(newCurves[i - 1].getEndPt().y, ptY, eps), 'PtLoopPJ: 两曲线连接处容差过大！');

                                const theStartRefY = endPt.y - ptY;
                                // theStartRefY * prevEndRefY < 0：两条curve在交点处被ray贯穿一次; > 0: 两条curve在ray同一侧
                                intersctCount = theStartRefY * prevEndRefY < 0 ? intersctCount + 1 : intersctCount;
                            } else if (Util.isNearlyEqual(endPt.y, ptY, eps)) {
                                prevEndRefY = stPt.y - ptY; // 3.2 交点是直线的终点，也会是下一曲线的起点，记录在射线上下关系，并在下一曲线中起点处理
                            } else {
                                intersctCount++; // 3.3 交于非端点
                            }
                        }
                    } else if (Util.isNearlyEqual(endPt.y, ptY, eps)) {
                        prevEndRefY = stPt.y - ptY;
                    }
                }
                // } else if (theCurve instanceof Arc2 && theCurve.isEqualAB()) {
                //     // 如果出现问题或者效率变低，在考虑使用圆弧特殊处理，分解成两段。否则，为了代码简单，非线性曲线统一求交处理
                //     const realCurve = curveMap.get(theCurve) || theCurve;

                //     const r = theCurve.getRadius();
                //     const r2 = r * r;
                //     const center = theCurve.getCenter();
                //     const sqrDist = center.sqDistanceTo(pt);
                //     if (Util.isNearlyBigger(ipY, ptY, eps) === Util.isNearlySmaller(ipNextY, ptY, eps)) {
                //         const midX = theCurve.getMidPt().x;
                //         // 2.点在圆弧上
                //         if (Util.isNearlyEqual(sqrDist, r2, sqrEps) && ((midX < center.x) === (ptX < center.x))) {
                //             return {
                //                 type: PtLoopPJType.ONEDGE,
                //                 curve: realCurve,
                //             };
                //         }

                //         // 3.点与圆弧相交

                //         // 3.1点与起点相交

                //         // 3.2
                //     }
            } else {
                // 需要直线和curve所有的交点，用于判断，当如果curve起点或者终点在ray上或者相切时，端点在射线上方还是下方
                let lineIntersctResult: ICurvesXInfo2d[];
                if (theCurve === lastValidCurve) {
                    lineIntersctResult = prevCurveIntersct;
                } else {
                    const line = new Ln2(pt, Vec2.X(), Interval.infinitArray());
                    lineIntersctResult = CurvesX.curve2ds(line, theCurve, tol);
                    lineIntersctResult.sort((it1, it2) => it1.param2 - it2.param2);
                }

                for (let j = 0; j < lineIntersctResult.length; j++) {
                    const it = lineIntersctResult[j];
                    if (it.param1 < -eps) {
                        continue;
                    }

                    // 2.点在曲线上
                    if (Util.isNearlyEqual(it.param1, 0, eps) || theCurve.containsPt(pt, eps)) {
                        return {
                            type: PtLoopPJType.ONEDGE,
                            curve: theCurve,
                        };
                    }

                    // 3.射线和曲线相交
                    // 3.1 交点是曲线段起点：需要寻找上一条曲线，两条曲线联合起来判断是否被射线穿过
                    if (Util.isNearlyEqual(it.param2, theCurve.getStartParam(), eps)) {
                        // 未来可能出现loop有容差，或者上一直线接近水平又不完全水平，导致起点在ray上但是上一条curve的终点不在ray上
                        // MathAssert.assert(Util.isNearlyEqual(newCurves[i - 1].getEndPt().y, ptY, eps), 'PtLoopPJ: 两曲线连接处容差过大！');

                        const theStartRefPt = this._getRefPt(theCurve, lineIntersctResult, true, eps);
                        const theStartRefY = theStartRefPt.y - pt.y;
                        // theStartRefY * prevYUpRay < 0：两条curve在交点处被ray贯穿一次; > 0: 两条curve在ray同一侧
                        intersctCount = theStartRefY * prevEndRefY < 0 ? intersctCount + 1 : intersctCount;
                    } else if (Util.isNearlyEqual(it.param2, theCurve.getEndParam(), eps)) {
                        const prevEndRefPt = this._getRefPt(theCurve, lineIntersctResult, false, eps); // 3.2 交点是曲线的终点
                        prevEndRefY = prevEndRefPt.y - pt.y;
                    } else {
                        // 3.3 交于非端点
                        const tangent = theCurve.getTangentAt(it.param2);
                        // 3.3.1 相切
                        if (Math.abs(tangent.y) < eps) {
                            let prevRefT: number;
                            if (j - 1 < 0) {
                                prevRefT = theCurve.getStartParam();
                            } else {
                                prevRefT = lineIntersctResult[j - 1].param2;
                            }
                            const prevRefPt = theCurve.getPtAt((it.param2 + prevRefT) / 2);
                            const prevRefY = prevRefPt.y - pt.y;

                            let nextRefT: number;
                            if (j + 1 > lineIntersctResult.length - 1) {
                                nextRefT = theCurve.getStartParam();
                            } else {
                                nextRefT = lineIntersctResult[j + 1].param2;
                            }
                            const nextRefPt = theCurve.getPtAt((it.param2 + nextRefT) / 2);
                            const nextRefY = nextRefPt.y - pt.y;

                            if (prevRefY * nextRefY > 0) {
                                continue; // 相切，但未左右贯穿，不需要处理
                            }
                        }

                        intersctCount++;
                    }
                }
            }
        }

        return { type: (intersctCount % 2) as PtLoopPJType };
    }

    // private static _decomposeToCurves(loop: Loop, map: Map<Curve2, Curve2>): Curve2[] {
    //     const result: Curve2[] = [];
    //     const curves = loop.getAllCurves();
    //     for (const curve of curves) {
    //         if (curve instanceof Ln2) {
    //             result.push(curve);
    //         } else if (curve instanceof Arc2) {
    //             const montonies = this._decomposeToArcs(curve as Arc2);
    //             if (montonies.length <= 0) {
    //                 result.push(curve);
    //             } else {
    //                 montonies.forEach(it => {
    //                     result.push(it);
    //                     map.set(it, curve);
    //                 });
    //             }
    //         } else {
    //             throw new Error('not implemented');
    //         }
    //     }
    //     return result;
    // }

    // /**
    //  * Decompose an arc into monotony arc
    //  * @param arc
    //  */
    // private static _decomposeToArcs(arc: Arc2): Arc2[] {
    //     const center = arc.getCenter();
    //     const radius = arc.getRadius();
    //     const vec = new Vec2(0, 1);
    //     const upPt = center.added(vec.multiplied(radius));
    //     const downPt = center.added(vec.multiplied(-radius));
    //     return GeomUtil.splitCurveByPoints(arc, [upPt, downPt]) as Arc2[];
    // }

    private static _dealHorizontalLineLoop(
        pt: Vec2,
        loop: Loop,
        eps: number = Tol.LENGTH,
    ): {
        type: PtLoopPJType;
        curve?: Curve2;
    } {
        const ptX = pt.x;
        for (const curv of loop.getAllCurves()) {
            if (Util.isNearlyEqual(curv.getStartPt().x, ptX, eps)) {
                return {
                    type: PtLoopPJType.ONVERTEX,
                    curve: curv,
                };
            }
            if (
                Util.isNearlyBigger(curv.getStartPt().x, ptX, eps) === Util.isNearlySmaller(curv.getEndPt().x, ptX, eps)
            ) {
                return {
                    type: PtLoopPJType.ONEDGE,
                    curve: curv,
                };
            }

            return { type: PtLoopPJType.OUT };
        }

        return { type: PtLoopPJType.OUT };
    }

    // 找到端点最近的参考点，用于判断曲线上的点在射线上方还是下方
    private static _getRefPt(
        curve: Curve2,
        rayIntResult: ICurvesXInfo2d[],
        isNearStartPt: boolean,
        eps: number = Tol.LENGTH,
    ): Vec2 {
        let refT: number;
        if (rayIntResult.length < 2) {
            // 如果计算到交点个数为0，可能是求交失误或者loop容差
            refT = isNearStartPt ? curve.getEndParam() : curve.getStartParam(); // 只有一个交点，就是curve的某一端点。选择另一端点作参考
        } else {
            const intersctPtParam = isNearStartPt ? curve.getStartParam() : curve.getEndParam();
            let nearIntersctT: number;
            if (curve.getStartPt().equals(curve.getEndPt(), eps)) {
                // 对于起点和终点相同的曲线，譬如说一个圆，交点个数比预期少一个（起点是交点，中间有个交点，终点也是个交点，但起点终点重合）
                if (Math.abs(curve.getStartParam() - rayIntResult[0].param2) < eps) {
                    nearIntersctT = isNearStartPt
                        ? rayIntResult[1].param2
                        : rayIntResult[rayIntResult.length - 1].param2; // 交点在起点时
                } else {
                    // Math.abs(curve.getEndParam() - rayIntResult[rayIntResult.length - 1].param2) < eps;
                    nearIntersctT = isNearStartPt
                        ? rayIntResult[0].param2
                        : rayIntResult[rayIntResult.length - 2].param2; // 交点在终点时
                }
            } else {
                nearIntersctT = isNearStartPt ? rayIntResult[1].param2 : rayIntResult[rayIntResult.length - 2].param2;
            }
            refT = (nearIntersctT + intersctPtParam) / 2;
        }

        return curve.getPtAt(refT);
    }
}

export { PtLoopPJ };