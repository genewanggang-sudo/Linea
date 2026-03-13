import { LinesX } from './curves_x/lines_x';
import { Vec } from '../../base/vec';
import { Ln2 } from '../../geometry/ln2';
import { LineCircleX } from './curves_x/linear_circular_x';
import { CircularsX } from './curves_x/circulars_x';
import { Ln3 } from '../../geometry/ln3';
import { Arc3 } from '../../geometry/arc3d';
import { Tol } from '../../base/tol';
import { Curve3 } from '../../geometry/curve3d';
import { CurvesXUtil } from './curves_x_util';
import { Curve2 } from '../../geometry/curve2';
import { Arc2 } from '../../geometry/arc2d';
import { ICurvesXInfo, ICurvesXInfo2d, ICurvesXInfo3d } from './x_info';
import { XInfoUtil } from './intersect_info_util';
import { CurvesOverlap } from '../overlap/curves_overlap';
import { Vec3 } from '../../base/vec3';
import { Vec2 } from '../../base/vec2';
import { IExtendCurve } from '../../type_define/i_geometry';
import { Curve } from '../../geometry/curve';
import { CONST } from '../../type_define/const';
import { Util } from '../../util/util'; 



/**
 * 曲线与曲线的交点：直线+直线，直线+圆弧，（直线+通用曲线）；圆弧+圆弧；（圆弧+通用曲线；通用曲线+通用曲线）
 * 若两曲线重合，则交点为重合段内的某个交点
 * > 此接口是求两曲线段的交点，曲线段是有限长的，若求无限长的曲线的交点，可将曲线extend至无限长
 * @param curve1
 * @param curve2
 * @param extraInfo [out]如果需要知道交点的额外信息（交点在各个曲线上的参数），则传入该参数,
 */
class CurvesX {
    // 二维曲线与二维曲线求交，支持：直线+直线，直线+圆弧，圆弧+圆弧；其他不支持：（直线+通用曲线，圆弧+通用曲线，通用曲线+通用曲线）
    public static curve2ds(
        curve1: Curve2,
        curve2: Curve2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        if (curve1 instanceof Ln2) {
            if (curve2 instanceof Ln2) {
                return LinesX.line2ds(curve1, curve2, tol);
            }
            if (curve2 instanceof Arc2) {
                const rets = LineCircleX.line2dAndArc2d(curve1, curve2, tol);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec2>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc2) {
            if (curve2 instanceof Ln2) {
                const res = LineCircleX.line2dAndArc2d(curve2, curve1, tol);
                const rets = CurvesX._swapParams(res);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec2>(curve1, curve2, tol);
            }
            if (curve2 instanceof Arc2) {
                const rets = CircularsX.arc2dAndArc2d(curve1, curve2, tol);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec2>(curve1, curve2, tol);
            }
        }

        // 重合判断
        const overlaps = CurvesOverlap.curve2ds(curve1, curve2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, curve1, curve2, tol));
            return rets;
        }
        return CurvesXUtil.curve2dCurve2d(curve1, curve2, tol);
    }

    // 三维曲线与三维曲线求交，支持支持所有三维曲线种类
    public static curve3ds(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        return CurvesX._curve3dsSimple(curve1, curve2, tol);
    }

    public static curve3dsNearPoint(
        curve1: Curve3,
        curve2: Curve3,
        point: Vec3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d | undefined {
        // 能解析计算结果的
        let simpleRets: ICurvesXInfo3d[] | undefined;
        if (curve1.isLine3d()) {
            if (curve2.isLine3d() || curve2.isArc3d()) {
                simpleRets = this._byGeometricOrAnalyticMethod(curve1, curve2, tol);
            } else {
                simpleRets = undefined;
            }
        } else if (curve2.isLine3d()) {
            if (curve1.isLine3d() || curve1.isArc3d()) {
                simpleRets = this._byGeometricOrAnalyticMethod(curve1, curve2, tol);
            } else {
                simpleRets = undefined;
            }
        }

        if (simpleRets !== undefined) {
            simpleRets.sort((_a, _b) => _a.point.sqDistanceTo(point) - _b.point.sqDistanceTo(point));
            return simpleRets[0];
        }

        // 不能解析计算结果的
        return CurvesXUtil.curve3dsSingleX(curve1, curve2, point, tol);
    }

    private static _curve3dsSimple(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        const res = this._byGeometricOrAnalyticMethod(curve1, curve2, tol);
        if (res) {
            if (
                res.length === 1 &&
                res[0].isOverlap === false &&
                curve1.getTangentAt(res[0].param1).isParallel(curve2.getTangentAt(res[0].param2), tol.angleEps)
            ) {
                // 如果端点是交点并且和上面计算的点重合，用端点代替上面计算的结果
                const smallEps = tol.lengthEps / 100;
                if (curve1.getStartPt().equals(curve2.getStartPt(), smallEps)) {
                    const midPt = curve1.getStartPt().midTo(curve2.getStartPt());
                    if (midPt.equals(res[0].point, tol.edgeLengthEps)) {
                        return [
                            {
                                point: midPt,
                                param1: curve1.getStartParam(),
                                param2: curve2.getStartParam(),
                                isOverlap: false,
                            },
                        ];
                    }
                } else if (curve1.getStartPt().equals(curve2.getEndPt(), smallEps)) {
                    const midPt = curve1.getStartPt().midTo(curve2.getEndPt());
                    if (midPt.equals(res[0].point, tol.edgeLengthEps)) {
                        return [
                            {
                                point: midPt,
                                param1: curve1.getStartParam(),
                                param2: curve2.getEndParam(),
                                isOverlap: false,
                            },
                        ];
                    }
                } else if (curve1.getEndPt().equals(curve2.getEndPt(), smallEps)) {
                    const midPt = curve1.getEndPt().midTo(curve2.getEndPt());
                    if (midPt.equals(res[0].point, tol.edgeLengthEps)) {
                        return [
                            {
                                point: midPt,
                                param1: curve1.getEndParam(),
                                param2: curve2.getEndParam(),
                                isOverlap: false,
                            },
                        ];
                    }
                } else if (curve1.getEndPt().equals(curve2.getStartPt(), smallEps)) {
                    const midPt = curve1.getEndPt().midTo(curve2.getStartPt());
                    if (midPt.equals(res[0].point, tol.edgeLengthEps)) {
                        return [
                            {
                                point: midPt,
                                param1: curve1.getEndParam(),
                                param2: curve2.getStartParam(),
                                isOverlap: false,
                            },
                        ];
                    }
                }
            }

            return res;
        }

        // 重合判断
        const overlaps = CurvesOverlap.curve3ds(curve1, curve2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, curve1, curve2, tol));
            return rets;
        }
        return CurvesXUtil.curve3dCurve3d(curve1, curve2, tol);
    }

    private static _byGeometricOrAnalyticMethod(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] | undefined {
        if (curve1 instanceof Ln3) {
            if (curve2 instanceof Ln3) {
                return LinesX.line3ds(curve1, curve2, tol);
            }
            if (curve2 instanceof Arc3) {
                const rets = LineCircleX.line3dAndArc3d(curve1, curve2, tol);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec3>(curve1, curve2, tol);
            }
        } else if (curve1 instanceof Arc3) {
            if (curve2 instanceof Ln3) {
                const res = LineCircleX.line3dAndArc3d(curve2, curve1, tol);
                const rets = CurvesX._swapParams(res);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec3>(curve1, curve2, tol);
            }
            if (curve2 instanceof Arc3) {
                const rets = CircularsX.arc3dAndArc3d(curve1, curve2, tol);
                if (rets.length > 0) {
                    return rets;
                }
                return CurvesXUtil.getEndPtIntersect<Vec3>(curve1, curve2, tol);
            }
        }

        return this._isTwoPlaneCurve3dsCoplane(curve1, curve2, tol);
    }

    private static _isLineXPlaneCurve3d(lineCurve3d: Curve3, planeCurve3d: Curve3, tol: Tol) {
        let lineDir: Vec3;
        if (lineCurve3d.isLine3d()) {
            lineDir = lineCurve3d.getDirection();
        } else {
            lineDir = lineCurve3d.getEndPt().subtracted(lineCurve3d.getStartPt());
            if (lineDir.equals(Vec3.O())) {
                lineDir = lineCurve3d.getEndPt().subtracted(lineCurve3d.getMidPt());
            }
            lineDir.normalize();
        }

        const norm1 = planeCurve3d.isPlaneCurve3d();
        if (norm1 instanceof Vec3) {
            if (!norm1.isPerpendicular(lineDir, tol.angleEps)) {
                return undefined; // 如果直线不平行于平面
            }

            // 如果直线平行于平面，判断直线是否在平面内，如果不共面，就没有交点
            const vect = planeCurve3d.getStartPt().subtracted(lineCurve3d.getStartPt());
            if (vect.getSqLength() > tol.lengthEps2) {
                vect.normalize();
                if (Math.abs(vect.dot(norm1)) < tol.angleEps) {
                    return undefined;
                }

                return []; // 排除两个平面曲线求交，但是不共面情况
            }
        }

        return undefined;
    }

    private static _isTwoPlaneCurve3dsCoplane(planeCurve3d1: Curve3, planeCurve3d2: Curve3, tol: Tol) {
        const norm1 = planeCurve3d1.isPlaneCurve3d();
        const norm2 = planeCurve3d2.isPlaneCurve3d();
        if (norm1 instanceof Vec3 && norm2 instanceof Vec3) {
            if (!norm1.isParallel(norm2, tol.angleEps)) {
                return undefined;
            }

            // 如果norm都存在且相互平行，判断是否共面，如果不共面，就没有交点
            const vect = planeCurve3d2.getStartPt().subtracted(planeCurve3d1.getStartPt());
            if (vect.getSqLength() > tol.lengthEps2) {
                vect.normalize();
                if (Math.abs(vect.dot(norm1)) < tol.angleEps) {
                    return undefined;
                }

                return []; // 排除两个平面曲线求交，但是不共面情况
            }
        } else if (norm1 && norm2 instanceof Vec3) {
            return this._isLineXPlaneCurve3d(planeCurve3d1, planeCurve3d2, tol);
        } else if (norm1 instanceof Vec3 && norm2) {
            return this._isLineXPlaneCurve3d(planeCurve3d2, planeCurve3d1, tol);
        }

        return undefined;
    }

    private static _curve3dAndExtendCurve3d(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        const curves1: Curve3[] = [];
        curves1.push(curve1);

        const curves2: Curve3[] = [];
        curves2.push(curve2);

        const hasInXInfos = (theXPt: ICurvesXInfo3d, xInfos: ICurvesXInfo3d[]) => {
            for (const it of xInfos) {
                if (it.point.equals(theXPt.point)) {
                    return true;
                }
            }
            return false;
        };

        const intersctInfos: ICurvesXInfo3d[] = [];
        for (const curv1 of curves1) {
            for (const curv2 of curves2) {
                const intInfos = CurvesX._curve3dsSimple(curv1, curv2, tol);
                for (const it of intInfos) {
                    if (!hasInXInfos(it, intersctInfos)) {
                        intersctInfos.push(it);
                    }
                }
            }
        }
        return intersctInfos;
    }

    private static _getOriginParamForExtendCurve<VectorType extends Vec>(
        point: Vec,
        param: number,
        curve: Curve<VectorType>,
        origExtCurve: IExtendCurve<VectorType>,
    ): number {
        if (curve.isLine()) {
            const baseRange = origExtCurve.getBaseCurve().getRange();

            let isAtHead: boolean;
            if (param < -Tol.EDGE_LENGTH_EPS) {
                isAtHead = true;
            } else if (param > Tol.EDGE_LENGTH_EPS) {
                isAtHead = false;
            } else {
                const dist1 = point.sqDistanceTo(origExtCurve.getPtAt(baseRange.min));
                const dist2 = point.sqDistanceTo(origExtCurve.getPtAt(baseRange.max));
                if (dist1 < dist2) {
                    isAtHead = true;
                } else {
                    isAtHead = false;
                }
            }

            if (isAtHead) {
                const scale = origExtCurve.getHeadScale();
                return baseRange.min + param / scale;
            }

            if (!isAtHead) {
                const scale = origExtCurve.getTailScale();
                return baseRange.max + param / scale;
            }
        } else if (curve.isArc()) {
            const { min, max } = curve.getRange();
            if (Util.isNearlyEqual(param, min)) {
                return min;
            }
            if (param < min) {
                return param + CONST.PI2 * Math.ceil((min - param) / CONST.PI2);
            }
            if (Util.isNearlyEqual(param, max)) {
                return max;
            }
            if (param > max) {
                return param - CONST.PI2 * Math.ceil((param - max) / CONST.PI2);
            }
        }

        return param;
    }

    private static _swapParams<VectorType extends Vec>(
        items: ICurvesXInfo<VectorType>[],
    ): ICurvesXInfo<VectorType>[] {
        items.forEach(item => {
            [item.param1, item.param2] = [item.param2, item.param1];

            if (item.isOverlap) {
                [item.overlap1, item.overlap2] = [item.overlap2, item.overlap1];
            }
        });
        return items;
    }
}

export { CurvesX };