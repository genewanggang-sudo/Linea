import { Tol } from '../../base/tol';
import { ICurvesXInfo2d, ICurvesXInfo3d, ICurvesXInfo } from './x_info';
import { Vec } from '../../base/vec';
import { Curve } from '../../geometry/curve';
import { Curve3 } from '../../geometry/curve3d';
import { Curve2 } from '../../geometry/curve2';
import { Vec3 } from '../../base/vec3';
import { Vec2 } from '../../base/vec2';
import { LinesX } from './curves_x/lines_x';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { NurbsCurve2 } from '../../geometry/nurbs_curve2';
import { Ln3 } from '../../geometry/ln3';
import { Ln2 } from '../../geometry/ln2';
import { curvesIteration } from '../calculate_util/iterative_method';
import { PeriodInterval } from '../../base/period_inverval';



export class CurveSelfX {
    public static isCurve2dSelfX(curve: Curve2, tol: Tol = Tol.DEFAULT): boolean {
        if (curve.isLine2d() || curve.isArc2d()) {
            return false;
        }
        // TODO... 优化性能
        const interRes = CurveSelfX.curve2dSelfX(curve, tol);
        return interRes.length > 0;
    }

    // 二维曲线计算自交点
    public static curve2dSelfX(
        curve: Curve2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        return CurveSelfX._selfIntersectSimple<Vec2>(curve, tol);
    }

    // 三维曲线计算自交点
    public static curve3dSelfX(
        curve: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        return CurveSelfX._selfIntersectSimple<Vec3>(curve, tol);
    }

    private static _dealRedundant<VectorType extends Vec>(
        curve: Curve<VectorType>,
        xPtInfo: ICurvesXInfo<VectorType>,
        xPtInfos: ICurvesXInfo<VectorType>[],
        tol: Tol,
    ) {
        let isRedundant = false;
        const sqrDist = curve.getPtAt(xPtInfo.param1).sqDistanceTo(curve.getPtAt(xPtInfo.param2));
        for (const it of xPtInfos) {
            if (it.point.sqDistanceTo(xPtInfo.point) < tol.lengthEps2) {
                isRedundant = true;
                const tmpDist = curve.getPtAt(it.param1).sqDistanceTo(curve.getPtAt(it.param2));
                if (tmpDist < sqrDist) {
                    xPtInfo.point = it.point;
                    xPtInfo.param1 = it.param1;
                    xPtInfo.param2 = it.param2;
                }
                break;
            }
        }

        if (!isRedundant) {
            xPtInfos.push(xPtInfo);
        }
    }

    private static _selfIntersectSimple<PointType extends Vec>(
        curve: Curve<PointType>,
        tol: Tol,
    ): ICurvesXInfo<PointType>[] {
        if (curve.isLine() || curve.isArc()) {
            return [];
        }

        // 初判一下，如果nurbs的控制顶点没有交，那么nurbs曲线也不会有交点
        if (
            (curve.isNurbsCurve3d() && !this._isNurbs3dCtrlPtsIsIntersect(curve, tol)) ||
            (curve.isNurbsCurve2d() && !this._isNurbs2dCtrlPtsIsIntersect(curve, tol))
        ) {
            return [];
        }

        const selfXPtInfos: ICurvesXInfo<PointType>[] = [];
        const range = curve.getRange();
        const stParam = range.min;
        const deltaT = range.getLength() / 15;
        for (let i = 0; i < 15; i++) {
            const ti = stParam + i * deltaT;
            for (let j = 15; j > i; j--) {
                const tj = stParam + j * deltaT;
                const params = [ti, tj];
                const Iterate = curvesIteration(curve, curve, params, tol);
                if (Iterate) {
                    if (range instanceof PeriodInterval) {
                        params[1] = range.clamp(params[1]);
                        params[1] = range.clamp(params[1]);
                        const period = range.period;
                        if (Math.abs(Math.abs(params[1] - params[0]) - period) < tol.numberEps) {
                            continue;
                        }
                    }

                    if (
                        Math.abs(params[1] - params[0]) < tol.numberEps ||
                        !range.containsPt(params[0], tol.numberEps) ||
                        !range.containsPt(params[1], tol.numberEps)
                    ) {
                        continue;
                    }

                    const pt = curve.getPtAt(params[0]);
                    const xPtInfo: ICurvesXInfo<PointType> = {
                        point: pt,
                        param1: params[0],
                        param2: params[1],
                        isOverlap: false,
                    };

                    this._dealRedundant(curve, xPtInfo, selfXPtInfos, tol);
                }
            }
        }

        return selfXPtInfos;
    }

    private static _isNurbs3dCtrlPtsIsIntersect(nurbs: NurbsCurve3, tol: Tol): boolean {
        const ctrlPts = nurbs.getControlPoints();
        for (let i = 1; i < ctrlPts.length; i++) {
            const line1 = new Ln3(ctrlPts[i], ctrlPts[i - 1]);
            for (let j = i + 1; j < ctrlPts.length; j++) {
                const line2 = new Ln3(ctrlPts[j], ctrlPts[j - 1]);
                const xPtInfos = LinesX.line3ds(line1, line2, tol);
                if (xPtInfos.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    private static _isNurbs2dCtrlPtsIsIntersect(nurbs: NurbsCurve2, tol: Tol): boolean {
        const ctrlPts = nurbs.getControlPoints();
        for (let i = 1; i < ctrlPts.length; i++) {
            const line1 = new Ln2(ctrlPts[i], ctrlPts[i - 1]);
            for (let j = i + 1; j < ctrlPts.length; j++) {
                const line2 = new Ln2(ctrlPts[j], ctrlPts[j - 1]);
                const xPtInfos = LinesX.line2ds(line1, line2, tol);
                if (xPtInfos.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }
}