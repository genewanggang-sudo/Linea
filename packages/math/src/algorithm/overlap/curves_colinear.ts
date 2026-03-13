import { Tol } from '../../base/tol';
import { Util } from '../../util/util';
import { Vec } from '../../base/vec';
import { IArc, ILine, IOffsetCurve, INurbsCurve, IExtendCurve } from '../../type_define/i_geometry';
import { Arc2 } from '../../geometry/arc2d';
import { Arc3 } from '../../geometry/arc3d';
import { Ln2 } from '../../geometry/ln2';
import { Ln3 } from '../../geometry/ln3';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { OffsetCurve2 } from '../../geometry/offset_curve2';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { NurbsCurve2 } from '../../geometry/nurbs_curve2';
import { SmoothPoly3 } from '../../geometry/smooth_poly3';
import { SmoothPoly2 } from '../../geometry/smooth_poly2';
import { Curve3 } from '../../geometry/curve3d';
import { Curve2 } from '../../geometry/curve2';
import { Curve } from '../../geometry/curve';
import { DiscreteParam } from '../../base/discrete_param';
import { CurvesOverlap } from './curves_overlap';
import { MathError } from '../../util/math_error';
import { CurveUtil } from '../../util/curve_util';



export class CurvesColinear {
    public static curve3ds(curve1: Curve3, curve2: Curve3, tol: Tol = Tol.DEFAULT): boolean {
        if (curve1 instanceof Ln3) {
            if (curve2 instanceof Ln3) {
                return CurvesColinear.lines(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc3) {
            if (curve2 instanceof Arc3) {
                return CurvesColinear.arcs(curve1, curve2, tol);
            }
        } else if (curve1 instanceof OffsetCurve3) {
            if (curve2 instanceof OffsetCurve3) {
                return CurvesColinear.offsetCurves(curve1, curve2, tol);
            }
        } else if (curve1 instanceof NurbsCurve3) {
            if (curve2 instanceof NurbsCurve3) {
                return CurvesColinear.nurbsCurves(curve1, curve2, tol);
            }
        }

        if (
            curve1 instanceof NurbsCurve3 ||
            curve1 instanceof SmoothPoly3 ||
            curve2 instanceof NurbsCurve3 ||
            curve2 instanceof SmoothPoly3
        ) {
            // 改成判断所有段都重合？
            return CurvesOverlap.generalCurves(curve1, curve2, tol).length > 0;
        }

        return false;
    }

    public static curve2ds(curve1: Curve2, curve2: Curve2, tol: Tol = Tol.DEFAULT): boolean {
        if (curve1 instanceof Ln2) {
            if (curve2 instanceof Ln2) {
                return CurvesColinear.lines(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc2) {
            if (curve2 instanceof Arc2) {
                return CurvesColinear.arcs(curve1, curve2, tol);
            }
        } else if (curve1 instanceof OffsetCurve2) {
            if (curve2 instanceof OffsetCurve2) {
                return CurvesColinear.offsetCurves(curve1, curve2, tol);
            }
        } else if (curve1 instanceof NurbsCurve2) {
            if (curve2 instanceof NurbsCurve2) {
                return CurvesColinear.nurbsCurves(curve1, curve2, tol);
            }
        }

        if (
            curve1 instanceof NurbsCurve2 ||
            curve1 instanceof SmoothPoly2 ||
            curve2 instanceof NurbsCurve2 ||
            curve2 instanceof SmoothPoly2
        ) {
            // 改成判断所有段都重合？
            return CurvesOverlap.generalCurves(curve1, curve2, tol).length > 0;
        }

        return false;
    }

    public static lines(line1: Ln2, line2: Ln2, tol?: Tol): boolean;

    public static lines(line1: Ln3, line2: Ln3, tol?: Tol): boolean;

    public static lines<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        tol?: Tol,
    ): boolean;

    public static lines<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        tol: Tol = Tol.DEFAULT,
    ): boolean {
        function sqPtToline(pt: VectorType, line: ILine<VectorType>): number {
            return line.getPtAt(line.getParamAt(pt)).sqDistanceTo(pt);
        }
        return (
            line1.getDirection().isParallel(line2.getDirection(), tol.angleEps) &&
            (sqPtToline(line1.getMidPt(), line2) < tol.lengthEps2 ||
                sqPtToline(line2.getMidPt(), line1) < tol.lengthEps2)
        );
    }

    public static arcs(arc1: Arc3, arc2: Arc3, tol?: Tol): boolean;

    public static arcs(arc1: Arc2, arc2: Arc2, tol?: Tol): boolean;

    public static arcs<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        tol: Tol,
    ): boolean;

    public static arcs<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        tol: Tol,
    ): boolean {
        if (!arc1.getCenter().equals(arc2.getCenter(), tol.lengthEps)) return false;
        if (
            arc1 instanceof Arc3 &&
            arc2 instanceof Arc3 &&
            !arc1.getNormal().isParallel(arc2.getNormal(), tol.angleEps)
        )
            return false;

        const a1 = arc1.getA();
        const b1 = arc1.getB();
        const a2 = arc2.getA();
        const b2 = arc2.getB();

        if (Math.abs(a1 - b1) < tol.lengthEps) {
            // 圆
            return Math.abs(a2 - b2) < tol.lengthEps && Math.abs(a1 + b1 - a2 - b2) < tol.lengthEps * 2;
        }
        if (Math.abs(a1 - a2) < tol.lengthEps) {
            // aa 对齐
            return (
                Math.abs(b1 - b2) < tol.lengthEps &&
                arc1.getCoord().getDx().isParallel(arc2.getCoord().getDx(), tol.angleEps)
            );
        }
        if (Math.abs(a1 - b2) < tol.lengthEps) {
            // ab 对齐
            return (
                Math.abs(a2 - b1) < tol.lengthEps &&
                arc1.getCoord().getDx().isPerpendicular(arc2.getCoord().getDx(), tol.angleEps)
            );
        }
        return false;
    }

    public static areArcsSameDirection<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
    ): boolean {
        if (arc1 instanceof Arc2 && arc2 instanceof Arc2) {
            return arc1.isCCW() === arc2.isCCW();
        }
        if (arc1 instanceof Arc3 && arc2 instanceof Arc3) {
            return arc1.getNormal().dot(arc2.getNormal()) > 0;
        }
        MathError.assert('arc1 and arc2 not same type');
        return false;
    }

    public static offsetCurves(offCurv1: OffsetCurve3, offCurv2: OffsetCurve3, tol?: Tol): boolean;

    public static offsetCurves(offCurv1: OffsetCurve2, offCurv2: OffsetCurve2, tol?: Tol): boolean;

    public static offsetCurves<VectorType extends Vec>(
        offCurv1: IOffsetCurve<VectorType>,
        offCurv2: IOffsetCurve<VectorType>,
        tol: Tol,
    ): boolean;

    public static offsetCurves<VectorType extends Vec>(
        offCurv1: IOffsetCurve<VectorType>,
        offCurv2: IOffsetCurve<VectorType>,
        tol: Tol,
    ): boolean {
        if (offCurv1 instanceof OffsetCurve2 && offCurv2 instanceof OffsetCurve2) {
            if (!Util.isNearlyEqual(offCurv1.getOffset(), offCurv2.getOffset(), tol.lengthEps)) {
                return false;
            }

            return CurvesColinear.curve2ds(
                (offCurv1 as OffsetCurve2).getBaseCurve(),
                (offCurv2 as OffsetCurve2).getBaseCurve(),
                tol,
            );
        }

        if (offCurv1 instanceof OffsetCurve3 && offCurv2 instanceof OffsetCurve3) {
            const baseCrv1 = (offCurv1 as OffsetCurve3).getBaseCurve();
            const baseCrv2 = (offCurv2 as OffsetCurve3).getBaseCurve();

            if (!offCurv1.getDz().isParallel(offCurv2.getDz(), tol.angleEps)) {
                return false;
            }

            const dzSign = offCurv1.getDz().dot(offCurv2.getDz());
            if (!Util.isNearlyEqual(offCurv1.getOffsetZ(), offCurv2.getOffsetZ() * dzSign, tol.lengthEps)) {
                return false;
            }

            let xySign = dzSign;
            if (baseCrv1 instanceof Arc3 && baseCrv2 instanceof Arc3) {
                const arcNormalSign = baseCrv1.getNormal().dot(baseCrv2.getNormal());
                xySign *= arcNormalSign; // 对于arc3d方向相反的，同时dz方向也相反的，sign其实是相同的
            } else if (baseCrv1 instanceof NurbsCurve3 && baseCrv2 instanceof NurbsCurve3) {
                const arcNormalSign = CurveUtil.getDzByCurve(baseCrv1).dot(CurveUtil.getDzByCurve(baseCrv2));
                xySign *= arcNormalSign;
            }

            if (!Util.isNearlyEqual(offCurv1.getOffsetXY(), offCurv2.getOffsetXY() * xySign, tol.lengthEps)) {
                return false;
            }

            return CurvesColinear.curve3ds(baseCrv1, baseCrv2, tol);
        }

        return false;
    }

    public static extendCurves<VectorType extends Vec>(
        etdCurv1: IExtendCurve<VectorType>,
        etdCurv2: IExtendCurve<VectorType>,
        tol: Tol,
    ): boolean {
        const baseCrv1 = etdCurv1.getBaseCurve();
        const baseCrv2 = etdCurv2.getBaseCurve();

        if (baseCrv1 instanceof Curve3 && baseCrv2 instanceof Curve3) {
            const isBaseColinear = CurvesColinear.curve3ds(baseCrv1, baseCrv2, tol);
            if (!isBaseColinear) {
                return false;
            }
        }
        if (baseCrv1 instanceof Curve2 && baseCrv2 instanceof Curve2) {
            const isBaseColinear = CurvesColinear.curve2ds(baseCrv1, baseCrv2, tol);
            if (!isBaseColinear) {
                return false;
            }
        }

        const bRange1 = baseCrv1.getRange();
        const bRange2 = baseCrv2.getRange();
        return bRange1.equals(bRange2, tol.numberEps);
    }

    /**
     * 采用采样的方式，判断 crv 在 range 范围内是否与 crv0 重合
     * @param crv0
     * @param crv
     * @param range
     * @param tol
     * @param pointCount
     * @returns
     */
    public static testBySamples<VectorType extends Vec>(
        crv0: Curve<VectorType>,
        crv: Curve<VectorType>,
        range = crv.getRange(),
        tol = Tol.DEFAULT,
        pointCount: number = DiscreteParam.NORMAL.hintSegmentCount,
    ): boolean {
        const dt = (range.max - range.min) / (pointCount + 1);
        const range0 = crv0.getRange();

        for (let i = 0; i < pointCount; i++) {
            const t = dt * (i + 0.9 + Math.random() * 0.2) + range.min;
            const pt = crv.getPtAt(t);
            const t0 = crv0.getParamAt(pt);
            const pt0 = crv0.getPtAt(t0);

            if (!range0.containsPt(t0) || pt0.sqDistanceTo(pt) > tol.edgeLengthEps2) return false;
        }
        return true;
    }

    // 只是判断是否共线，曲线完全重合，不考虑参数域情况下一模一样，不是判断是否存在重合
    public static nurbsCurves<VectorType extends Vec>(
        nurbsCurv1: INurbsCurve<VectorType>,
        nurbsCurv2: INurbsCurve<VectorType>,
        tol: Tol,
    ): boolean {
        const degree1 = nurbsCurv1.getDegree();
        const degree2 = nurbsCurv2.getDegree();
        const knots1 = nurbsCurv1.getKnots();
        const knots2 = nurbsCurv2.getKnots();
        const ctrlPts1 = nurbsCurv1.getControlPoints();
        const ctrlPts2 = nurbsCurv2.getControlPoints();
        if (degree1 !== degree2 || knots1.length !== knots2.length || ctrlPts1.length !== ctrlPts2.length) {
            return false;
        }

        let isColieaner = true;
        for (let i = 0; i < ctrlPts1.length; i++) {
            if (!ctrlPts1[i].equals(ctrlPts2[i], tol.lengthEps)) {
                isColieaner = false;
                break;
            }
        }
        let isSameDir = true;
        if (!isColieaner) {
            // 如果正向不重合，反向判断一下
            let reverseColieaner = true;
            for (let i = 0; i < ctrlPts1.length; i++) {
                if (!ctrlPts1[i].equals(ctrlPts2[ctrlPts1.length - 1 - i], tol.lengthEps)) {
                    reverseColieaner = false;
                    break;
                }
            }
            if (reverseColieaner) {
                isSameDir = false;
            } else {
                return false;
            }
        }

        for (let i = 0; i < knots1.length; i++) {
            let iknots2 = knots2[i];
            if (!isSameDir) {
                iknots2 = knots2[knots2.length - 1] - knots2[knots2.length - 1 - i];
            }
            if (!Util.isNearlyEqual(knots1[i], iknots2, tol.numberEps)) {
                return false;
            }
        }

        const weights1 = nurbsCurv1.getWeights();
        const weights2 = nurbsCurv2.getWeights();
        for (let i = 0; i < weights1.length; i++) {
            if (!Util.isNearlyEqual(weights1[i], weights2[i], tol.numberEps)) {
                return false;
            }
        }

        return true;
    }
}