import { Interval } from '../../base/interval';
import { PeriodInterval } from '../../base/period_inverval';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Arc2 } from '../../geometry/arc2d';
import { Arc3 } from '../../geometry/arc3d';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Ln2 } from '../../geometry/ln2';
import { Ln3 } from '../../geometry/ln3';
import { IArc, ILine, IOffsetCurve, INurbsCurve, IExtendCurve } from '../../type_define/i_geometry';
import { CurvesProject } from '../project/curve_curve_project';
import { CurvesColinear } from './curves_colinear';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { OffsetCurve2 } from '../../geometry/offset_curve2';
import { ICurvesOverlapInfo } from './i_overlap';



import { Curve } from '../../geometry/curve';
import { DiscreteParam } from '../../base/discrete_param';
import { NurbsCurve2 } from '../../geometry/nurbs_curve2';
import { SmoothPoly2 } from '../../geometry/smooth_poly2';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { SmoothPoly3 } from '../../geometry/smooth_poly3';
import { Util } from '../../util/util';

function getParam<VectorType extends Vec>(
    crv: Curve<VectorType>,
    pt0: VectorType,
    eps2: number,
): number | undefined {
    const t = crv.getParamAt(pt0);
    const pt = crv.getPtAt(t);
    return pt.sqDistanceTo(pt0) < eps2 ? t : undefined;
}

interface IPair<VectorType> {
    t1: number;
    t2: number;
    pt: VectorType;
}

/**
 * 计算两曲线的重合情况
 */
export class CurvesOverlap {
    public static curve2ds(
        curve1: Curve2,
        curve2: Curve2,
        tol: Tol = new Tol(),
    ): ICurvesOverlapInfo[] {
        let ret: ICurvesOverlapInfo[] | undefined;

        if (curve1 instanceof Ln2) {
            if (curve2 instanceof Ln2) {
                return CurvesOverlap.lines<Vec2>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc2) {
            if (curve2 instanceof Arc2) {
                return CurvesOverlap.arcs<Vec2>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof OffsetCurve2 && curve2 instanceof OffsetCurve2) {
            ret = CurvesOverlap.offsetCurves<Vec2>(curve1, curve2, tol);
            if (ret) return ret;
        }

        if (
            curve1 instanceof NurbsCurve2 ||
            curve1 instanceof SmoothPoly2 ||
            curve2 instanceof NurbsCurve2 ||
            curve2 instanceof SmoothPoly2
        ) {
            return CurvesOverlap.generalCurves(curve1, curve2, tol);
        }

        return [];
    }

    public static curve3ds(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] {
        let ret: ICurvesOverlapInfo[] | undefined;

        if (curve1 instanceof Ln3) {
            if (curve2 instanceof Ln3) {
                return CurvesOverlap.lines<Vec3>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc3) {
            if (curve2 instanceof Arc3) {
                return CurvesOverlap.arcs<Vec3>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof OffsetCurve3 && curve2 instanceof OffsetCurve3) {
            ret = CurvesOverlap.offsetCurves<Vec3>(curve1, curve2, tol);
            if (ret) return ret;
        }

        if (curve1 instanceof NurbsCurve3 && curve2 instanceof NurbsCurve3) {
            ret = CurvesOverlap.nurbsCurves<Vec3>(curve1, curve2, tol);
            if (ret) return ret;
        }

        if (
            curve1 instanceof NurbsCurve3 ||
            curve1 instanceof SmoothPoly3 ||
            curve2 instanceof NurbsCurve3 ||
            curve2 instanceof SmoothPoly3
        ) {
            return CurvesOverlap.generalCurves(curve1, curve2, tol);
        }

        return [];
    }

    public static lines<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] {
        if (CurvesColinear.lines(line1, line2, tol)) {
            return CurvesOverlap._linesOverlap(line1, line2, tol);
        }

        function sqPtToline(pt: VectorType, line: ILine<VectorType>): number {
            return line.getPtAt(line.getParamAt(pt)).sqDistanceTo(pt);
        }

        const length1 = line1.getRange().getLength();
        const length2 = line2.getRange().getLength();
        if (length1 > 1 && length2 > 1) {
            return [];
        }

        // 不同于Colinear的是，即使两条直线方向不完全平行，只要一条直线的起点和终点距离另外一条直线都小于容差，也可认为与另外一条直线重合
        if (length1 < length2) {
            if (
                sqPtToline(line1.getStartPt(), line2) < tol.lengthEps2 &&
                sqPtToline(line1.getEndPt(), line2) < tol.lengthEps2
            ) {
                const overlaps = CurvesOverlap._linesOverlap(line2, line1, tol);
                if (overlaps.length > 0) {
                    [overlaps[0].range1, overlaps[0].range2] = [overlaps[0].range2, overlaps[0].range1];
                }
                return overlaps;
            }
        } else {

            if (
                sqPtToline(line2.getStartPt(), line1) < tol.lengthEps2 &&
                sqPtToline(line2.getEndPt(), line1) < tol.lengthEps2
            ) {
                return CurvesOverlap._linesOverlap(line1, line2, tol);
            }
        }

        return [];
    }

    public static arcs<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] {
        if (!CurvesColinear.arcs(arc1, arc2, tol)) return [];
        return CurvesOverlap._arcsOverlap(arc1, arc2, tol);
    }

    public static offsetCurves<VectorType extends Vec>(
        offCurv1: IOffsetCurve<VectorType>,
        offCurv2: IOffsetCurve<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] | undefined {
        if (!CurvesColinear.offsetCurves(offCurv1, offCurv2, tol)) return [];
        return CurvesOverlap._offsetCurvesOverlap(offCurv1, offCurv2, tol);
    }

    public static extendCurves<VectorType extends Vec>(
        etdCurv1: IExtendCurve<VectorType>,
        etdCurv2: IExtendCurve<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] | undefined {
        if (!CurvesColinear.extendCurves(etdCurv1, etdCurv2, tol)) return [];
        return CurvesOverlap._extendCurvesOverlap(etdCurv1, etdCurv2, tol);
    }

    public static nurbsCurves<VectorType extends Vec>(
        nurbsCurv1: INurbsCurve<VectorType>,
        nurbsCurv2: INurbsCurve<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] | undefined {
        if (!CurvesColinear.nurbsCurves(nurbsCurv1, nurbsCurv2, tol)) {
            return undefined; // nurbs可能存在部分重合的情况，需要采样判断
        }
        // nurbs参数一样的完全重合的情况，用下面的方法计算重合段
        return CurvesOverlap._nurbsCurvesOverlap(nurbsCurv1, nurbsCurv2, tol);
    }

    public static generalCurves<VectorType extends Vec>(
        crv1: Curve<VectorType>,
        crv2: Curve<VectorType>,
        tol = Tol.DEFAULT,
        testPointCount = DiscreteParam.NORMAL.hintSegmentCount,
    ): ICurvesOverlapInfo[] {
        const eps2 = tol.edgeLengthEps2;

        const isCrv1Closed = crv1.getStartPt().sqDistanceTo(crv1.getEndPt()) < eps2;
        const isCrv2Closed = crv2.getStartPt().sqDistanceTo(crv2.getEndPt()) < eps2;

        // both closed
        if (isCrv1Closed && isCrv2Closed) {
            // const stPt1 = crv1.getStartPt();
            const stPt2 = crv2.getStartPt();
            const st2On1 = crv1.getParamAt(stPt2);
            const tan1 = crv1.getTangentAt(st2On1);
            const isSameDirection = tan1.dot(crv2.getStartTangent()) > 0;

            if (CurvesColinear.testBySamples(crv1, crv2, crv2.getRange(), tol)) {
                const range1 = crv1.getRange().clone();
                const range2 = crv2.getRange().clone();
                return [{ range1, range2, isSameDirection }];
            }
            return [];
        }

        if (isCrv1Closed) {
            const rets = CurvesOverlap._generalOpenCurves(crv2, crv1, true, tol, testPointCount);
            for (const ret of rets) {
                [ret.range1, ret.range2] = [ret.range2, ret.range1];
            }
            return rets;
        }

        return CurvesOverlap._generalOpenCurves(crv1, crv2, isCrv2Closed, tol, testPointCount);
    }

    private static _linesOverlap<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        tol = Tol.DEFAULT,
    ): ICurvesOverlapInfo[] {
        const r1 = line1.getRange();
        const r2on1 = CurvesProject.lines(line2, line1);
        const overlaps1 = r1.intersected(r2on1, tol.lengthEps);

        if (overlaps1.length === 0) {
            return [];
        }

        const overlap1 = overlaps1[0];
        const sameDirection = line1.getDirection().dot(line2.getDirection()) > 0;
        const param2st = line2.getParamAt(line1.getPtAt(overlap1.min));
        const param2ed = line2.getParamAt(line1.getPtAt(overlap1.max));

        return [
            {
                range1: overlap1,
                range2: sameDirection ? new Interval(param2st, param2ed) : new Interval(param2ed, param2st),
                isSameDirection: sameDirection,
            },
        ];
    }

    private static _arcsOverlap<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        tol: Tol,
    ): ICurvesOverlapInfo[] {
        // 两整圆是重合的，获取重叠的圆弧
        const range1 = arc1.getRange();
        const range2 = arc2.getRange();
        const sameDir = CurvesColinear.areArcsSameDirection(arc1, arc2);

        if (arc1.isClosed() && arc2.isClosed()) {
            return [
                {
                    range1,
                    range2,
                    isSameDirection: sameDir,
                },
            ];
        }

        const param2stOn1 = arc1.getParamAt(arc2.getStartPt());
        const param2edOn1 = arc1.getParamAt(arc2.getEndPt());
        const range2on1 = sameDir
            ? new PeriodInterval(param2stOn1, param2edOn1)
            : new PeriodInterval(param2edOn1, param2stOn1);
        const ranges = range1.intersected(range2on1, tol.numberEps);
        const rets = ranges.map(range => {
            const stPt = arc1.getPtAt(range.min);
            const edPt = arc1.getPtAt(range.max);
            return {
                range1: range,
                range2: sameDir ? arc2.getParamRangeAt(stPt, edPt) : arc2.getParamRangeAt(edPt, stPt),
                isSameDirection: sameDir,
            };
        });
        return rets;
    }

    private static _offsetCurvesOverlap<VectorType extends Vec>(
        offCurv1: IOffsetCurve<VectorType>,
        offCurv2: IOffsetCurve<VectorType>,
        tol: Tol,
    ): ICurvesOverlapInfo[] | undefined {
        const range1 = offCurv1.getRange();
        const range2 = offCurv2.getRange();

        const baseCv1 = offCurv1.getBaseCurve();
        const baseCv2 = offCurv2.getBaseCurve();
        if (
            (baseCv1 instanceof Arc3 && baseCv2 instanceof Arc3) ||
            (baseCv1 instanceof Arc2 && baseCv2 instanceof Arc2)
        ) {
            const sameDir = CurvesColinear.areArcsSameDirection(baseCv1 as IArc<Vec>, baseCv2 as IArc<Vec>);

            const isFullPeriod1 = Math.abs(range1.getLength() - (range1 as PeriodInterval).period) < tol.numberEps;
            const isFullPeriod2 = Math.abs(range2.getLength() - (range2 as PeriodInterval).period) < tol.numberEps;
            if (isFullPeriod1 && isFullPeriod2) {
                return [
                    {
                        range1,
                        range2,
                        isSameDirection: sameDir,
                    },
                ];
            }

            const period = (range1 as PeriodInterval).period;
            const param2stOn1 = offCurv1.getParamAt(offCurv2.getStartPt());
            const param2edOn1 = offCurv1.getParamAt(offCurv2.getEndPt());
            const range2on1 = sameDir
                ? new PeriodInterval(param2stOn1, param2edOn1, period)
                : new PeriodInterval(param2edOn1, param2stOn1, period);
            const ranges = range1.intersected(range2on1, tol.numberEps);
            const rets = ranges.map(_range1 => {
                const stPt = offCurv1.getPtAt(_range1.min);
                const edPt = offCurv1.getPtAt(_range1.max);
                const param1On2 = offCurv2.getParamAt(stPt);
                const param2On2 = offCurv2.getParamAt(edPt);
                const period2 = offCurv2.getParamMapper().getPeriod();
                const _range2 = sameDir
                    ? new PeriodInterval(param1On2, param2On2, period2)
                    : new PeriodInterval(param2On2, param1On2, period2);

                return {
                    range1: _range1,
                    range2: _range2,
                    isSameDirection: sameDir,
                };
            });
            return rets;
        }

        if (
            (baseCv1 instanceof NurbsCurve3 && baseCv2 instanceof NurbsCurve3) ||
            (baseCv1 instanceof NurbsCurve2 && baseCv2 instanceof NurbsCurve2)
        ) {
            const param2 = baseCv2.getParamAt(baseCv1.getStartPt() as any); // ts 语法检测未通过，下同
            const sameDir = baseCv1.getStartTangent().dot(baseCv2.getTangentAt(param2) as any) > 0;

            if (range1 instanceof PeriodInterval && range2 instanceof PeriodInterval) {
                const isFullPeriod1 = Math.abs(range1.getLength() - (range1 as PeriodInterval).period) < tol.numberEps;
                const isFullPeriod2 = Math.abs(range2.getLength() - (range2 as PeriodInterval).period) < tol.numberEps;
                if (isFullPeriod1 && isFullPeriod2) {
                    return [
                        {
                            range1,
                            range2,
                            isSameDirection: sameDir,
                        },
                    ];
                }
            }

            const param2stOn1 = offCurv1.getParamAt(offCurv2.getStartPt());
            const param2edOn1 = offCurv1.getParamAt(offCurv2.getEndPt());
            let range2on1: Interval;
            if (range1 instanceof PeriodInterval && range2 instanceof PeriodInterval) {
                const period = range1.period;
                range2on1 = sameDir
                    ? new PeriodInterval(param2stOn1, param2edOn1, period)
                    : new PeriodInterval(param2edOn1, param2stOn1, period);
            } else {
                range2on1 = sameDir ? new Interval(param2stOn1, param2edOn1) : new Interval(param2edOn1, param2stOn1);
            }

            const ranges = range1.intersected(range2on1, tol.numberEps);
            const rets = ranges.map(_range1 => {
                const stPt = offCurv1.getPtAt(_range1.min);
                const edPt = offCurv1.getPtAt(_range1.max);
                const param1On2 = offCurv2.getParamAt(stPt);
                const param2On2 = offCurv2.getParamAt(edPt);
                const period2 = offCurv2.getParamMapper().getPeriod();
                let _range2: Interval;
                if (period2) {
                    _range2 = sameDir
                        ? new PeriodInterval(param1On2, param2On2, period2)
                        : new PeriodInterval(param2On2, param1On2, period2);
                } else {
                    _range2 = sameDir ? new Interval(param1On2, param2On2) : new Interval(param2On2, param1On2);
                }

                return {
                    range1: _range1,
                    range2: _range2,
                    isSameDirection: sameDir,
                };
            });
            return rets;
        }

        return undefined;
    }

    private static _extendCurvesOverlap<VectorType extends Vec>(
        etdCurv1: IExtendCurve<VectorType>,
        etdCurv2: IExtendCurve<VectorType>,
        tol: Tol,
    ): ICurvesOverlapInfo[] {
        // 走到这的前提是曲线已经重合了，只判断参数域重合区间
        // 因为此处判断两个nurbs重合就是判断参数一模一样，所以可以反求参数计算参数域交集
        const range1 = etdCurv1.getRange();
        const midPt = etdCurv2.getBaseCurve().getMidPt();
        const param2stOn = etdCurv1.getParamAt(midPt); // 如果在这个地方自交，有两个参数那就可能会出错
        let sameDir: boolean;
        const tangent1 = etdCurv1.getTangentAt(param2stOn);
        const tangent2 = etdCurv2.getBaseCurve().getMidTangent();
        if (tangent1.isSameDirection(tangent2, tol.lengthEps)) {
            sameDir = true;
        } else if (tangent1.isOpposite(tangent2, tol.lengthEps)) {
            sameDir = false;
        } else {
            const bRange2 = etdCurv2.getBaseCurve().getRange();
            const headPt2 = etdCurv2.getPtAt(bRange2.min - 0.1);
            const param2stOn2 = etdCurv1.getParamAt(headPt2); // 如果在这个地方自交，有两个参数那就可能会出错
            const tangent21 = etdCurv1.getTangentAt(param2stOn2);
            const tangent22 = etdCurv2.getTangentAt(bRange2.min - 0.1);
            sameDir = tangent21.isSameDirection(tangent22, tol.lengthEps);
        }

        const param2stOn1 = etdCurv1.getParamAt(etdCurv2.getStartPt());
        const param2edOn1 = etdCurv1.getParamAt(etdCurv2.getEndPt());
        const range2on1 = sameDir ? new Interval(param2stOn1, param2edOn1) : new Interval(param2edOn1, param2stOn1);

        const ranges = range1.intersected(range2on1, tol.numberEps);
        const rets = ranges.map(range => {
            const stPt = etdCurv1.getPtAt(range.min);
            const edPt = etdCurv1.getPtAt(range.max);
            const param1On2 = etdCurv2.getParamAt(stPt);
            const param2On2 = etdCurv2.getParamAt(edPt);
            const _range2 = sameDir ? new Interval(param1On2, param2On2) : new Interval(param2On2, param1On2);
            return {
                range1: range,
                range2: _range2,
                isSameDirection: sameDir,
            };
        });

        return rets;
    }

    private static _nurbsCurvesOverlap<VectorType extends Vec>(
        nurbsCurv1: INurbsCurve<VectorType>,
        nurbsCurv2: INurbsCurve<VectorType>,
        tol: Tol,
    ): ICurvesOverlapInfo[] {
        // 因为此处判断两个nurbs重合就是判断参数一模一样，所以可以反求参数计算参数域交集
        const range1 = nurbsCurv1.getRange();
        const range2 = nurbsCurv2.getRange();
        const param2stOn1 = nurbsCurv1.getParamAt(nurbsCurv2.getStartPt());
        let sameDir: boolean;
        const tangent1 = nurbsCurv1.getTangentAt(param2stOn1);
        const tangent2 = nurbsCurv2.getStartTangent();
        if (tangent1.isSameDirection(tangent2, tol.lengthEps)) {
            sameDir = true;
        } else if (tangent1.isOpposite(tangent2, tol.lengthEps)) {
            sameDir = false;
        } else {
            // 反求参数位置在0和1的地方切向不同
            const range = nurbsCurv2.getRange();
            if (range instanceof PeriodInterval) {
                const t = range.period - param2stOn1;
                const tangent12 = nurbsCurv1.getTangentAt(t, false);
                if (tangent12.isSameDirection(tangent2, tol.lengthEps)) {
                    sameDir = true;
                } else if (tangent12.isOpposite(tangent2, tol.lengthEps)) {
                    sameDir = false;
                } else {
                    sameDir = tangent1.dot(tangent2) > 0;
                }
            } else {
                sameDir = tangent1.dot(tangent2) > 0;
            }
        }

        if (
            range1 instanceof PeriodInterval &&
            range1.isClosed() &&
            range2 instanceof PeriodInterval &&
            range2.isClosed()
        ) {
            return [
                {
                    range1,
                    range2,
                    isSameDirection: sameDir,
                },
            ];
        }

        const param2edOn1 = nurbsCurv1.getParamAt(nurbsCurv2.getEndPt());
        let range2on1: Interval;
        if (range1 instanceof PeriodInterval && range2 instanceof PeriodInterval) {
            const period = range1.period;
            range2on1 = sameDir
                ? new PeriodInterval(param2stOn1, param2edOn1, period)
                : new PeriodInterval(param2edOn1, param2stOn1, period);
        } else {
            range2on1 = sameDir ? new Interval(param2stOn1, param2edOn1) : new Interval(param2edOn1, param2stOn1);
        }

        const ranges = range1.intersected(range2on1, tol.numberEps);
        const rets = ranges.map(range => {
            const stPt = nurbsCurv1.getPtAt(range.min);
            const edPt = nurbsCurv1.getPtAt(range.max);
            const param1On2 = nurbsCurv2.getParamAt(stPt);
            const param2On2 = nurbsCurv2.getParamAt(edPt);
            let _range2: Interval;
            if (range2 instanceof PeriodInterval) {
                _range2 = sameDir
                    ? new PeriodInterval(param1On2, param2On2, range2.period)
                    : new PeriodInterval(param2On2, param1On2, range2.period);
            } else {
                _range2 = sameDir ? new Interval(param1On2, param2On2) : new Interval(param2On2, param1On2);
            }
            return {
                range1: range,
                range2: _range2,
                isSameDirection: sameDir,
            };
        });

        return rets;
    }

    /**
     *
     * @param crv1 openCrv
     * @param crv2
     * @param tol
     * @param testPointCount
     * @returns
     */
    private static _generalOpenCurves<VectorType extends Vec>(
        crv1: Curve<VectorType>,
        crv2: Curve<VectorType>,
        isCrv2Closed: boolean,
        tol: Tol,
        testPointCount: number,
    ): ICurvesOverlapInfo[] {
        const pair0s: Partial<IPair<VectorType>>[] = [
            { t1: crv1.getRange().min },
            { t1: crv1.getRange().max },
            { t2: crv2.getRange().min },
            { t2: crv2.getRange().max },
        ];
        const pairs: IPair<VectorType>[] = [];

        // full fill params
        for (const pair of pair0s) {
            if (pair.t1 !== undefined) {
                pair.pt = crv1.getPtAt(pair.t1);
                pair.t2 = getParam(crv2, pair.pt, tol.edgeLengthEps2);
                if (pair.t2 !== undefined) {
                    pairs.push(pair as IPair<VectorType>);
                }
            } else {
                pair.pt = crv2.getPtAt(pair.t2!);
                pair.t1 = getParam(crv1, pair.pt, tol.edgeLengthEps2);
                if (pair.t1 !== undefined) {
                    pairs.push(pair as IPair<VectorType>);
                }
            }
        }

        if (pairs.length < 2) return [];

        const rets: ICurvesOverlapInfo[] = [];

        const tryPair = (pair1: IPair<VectorType>, pair2: IPair<VectorType>, isSameDirection0: boolean) => {
            const isSameDirection = pair1.t2 < pair2.t2;
            if (isSameDirection !== isSameDirection0) return;

            const cloneRange = crv2.getRange().clone();
            const range2 = isSameDirection ? cloneRange.set(pair1.t2, pair2.t2) : cloneRange.set(pair2.t2, pair1.t2);

            if (
                Util.isNearlySmallerOrEqual(crv2.getRange().max, range2.min) ||
                Util.isNearlyBiggerOrEqual(crv2.getRange().min, range2.max)
            ) {
                return; // 如果不再参数域内，就不用考虑了
            }

            if (
                crv2.getPtAt(range2.min).sqDistanceTo(crv2.getPtAt(range2.max)) > tol.edgeLengthEps2 &&
                CurvesColinear.testBySamples(crv1, crv2, range2, tol)
            ) {
                const range1 = crv1.getRange().clone().set(pair1.t1, pair2.t1);
                rets.push({ range1, range2, isSameDirection });
            }
        };

        pairs.sort((a, b) => (a.t1 !== b.t1 ? a.t1 - b.t1 : a.t2 - b.t2));

        const isSameDirection = crv1.getTangentAt(pairs[0].t1).dot(crv2.getTangentAt(pairs[0].t2)) > 0;

        if (isCrv2Closed && pairs.length === 4) {
            // four points with loop
            const ps = pair0s as IPair<VectorType>[];
            if (isSameDirection) {
                tryPair(ps[0], ps[3], isSameDirection);
                tryPair(ps[2], ps[1], isSameDirection);
            } else {
                tryPair(ps[0], ps[2], isSameDirection);
                tryPair(ps[3], ps[1], isSameDirection);
            }
        } else {
            for (let i = 1; i < pairs.length; i++) {
                if (pairs[i].pt.sqDistanceTo(pairs[i - 1].pt) > tol.edgeLengthEps2) {
                    tryPair(pairs[i - 1], pairs[i], isSameDirection);
                }
            }
        }
        return rets;
    }
}