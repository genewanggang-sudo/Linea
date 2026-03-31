import { LoopArea } from '../algorithm/loop_property/loop-area';
import { DiscreteParam } from '../base/discrete_param';
import { Tol } from '../base/tol';
import { Vec } from '../base/vec';
import { Vec3 } from '../base/vec3';
import { Arc3 } from '../geometry/arc3d';
import { Curve } from '../geometry/curve';
import { Curve2 } from '../geometry/curve2';
import { Curve3 } from '../geometry/curve3d';
import { Ln2 } from '../geometry/ln2';
import { Ln3 } from '../geometry/ln3';
import { NurbsCurve2 } from '../geometry/nurbs_curve2';
import { NurbsCurve3 } from '../geometry/nurbs_curve3';
import { OffsetCurve2 } from '../geometry/offset_curve2';
import { OffsetCurve3 } from '../geometry/offset_curve3';
import { SmoothPoly2 } from '../geometry/smooth_poly2';
import { SmoothPoly3 } from '../geometry/smooth_poly3';
import { EvolutionMap } from '../topology/evolution_map';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';
import { Util } from './util';
import { PeriodInterval } from '../base/period_inverval';

export interface ICurveSimplifyOption {
    clone?: boolean;
    splitOffsetCurve?: boolean;
    smoothPolyToNurbs?: boolean;
    smoothPolyToLines?: boolean;
}

export class CurveUtil {
    /**
     * 获取平面曲线所在平面的法向。当曲线为直线时，若给定 hint 方向，则返回 hint；否则，将任意返回一垂直于直线的方向
     * @param curve
     * @param hint
     */
    public static getDzByCurve(curve: Curve3, hint?: Vec3): Vec3 {
        if (curve instanceof OffsetCurve3) {
            return curve.getDz();
        }
        if (curve instanceof Arc3) {
            return curve.getNormal();
        }
        if (curve instanceof NurbsCurve3) {
            const dz = CurveUtil.getDzByPoints(curve.getControlPoints());
            if (dz) return dz;
        }
        if (curve instanceof SmoothPoly3) {
            const dz = CurveUtil.getDzByPoints(curve.getPoints() as Vec3[]);
            if (dz) return dz;
        }

        if (hint) return hint;

        const tan = curve instanceof Ln3 ? curve.getDirection() : curve.getMidPt().subtract(curve.getStartPt());
        return tan.getPerpendicular();
    }

    /**
     * 计算曲线所在平面的法向。当曲线为直线时，返回向量长度为 0；当曲线非平面曲线时，返回 undefined
     * @param curve
     * @param angleEps
     */
    public static getDzByPlaneCurve(curve: Curve3, angleEps = Tol.ANGLE): Vec3 | undefined {
        if (curve.isLineLike()) return new Vec3();

        if (curve instanceof Arc3) {
            return curve.getNormal();
        }

        if (curve instanceof OffsetCurve3) {
            return curve.getDz();
        }

        const segN = DiscreteParam.LOW.hintSegmentCount;
        const pts: Vec3[] = [];
        const { min, max } = curve.getRange();
        const dt = (max - min) / segN;

        for (let i = 0; i <= segN; i++) {
            const t = dt * i + min;
            pts.push(curve.getPtAt(t));
        }

        const areaV = new Vec3();

        for (let i = 1; i < pts.length; i++) {
            pts[i].subtract(pts[0]);
        }
        for (let i = 2; i < pts.length; i++) {
            const v = pts[i - 1].cross(pts[i]);

            if (!v.isParallel(areaV, angleEps)) return undefined;

            areaV.add(v);
        }

        return areaV.normalize();
    }

    /**
     * 获取平面曲线所在平面的法向
     * @param curve
     * @param hint
     */
    public static getDzByCurves(curves: Curve3[], hint?: Vec3): Vec3 {
        const pts: Vec3[] = [];
        if (curves.length > 1) {
            for (const crv of curves) {
                const ps = crv.discrete(DiscreteParam.LOW);
                ps.pop();
                pts.push(...ps);
            }
            const ed = curves[curves.length - 1].getEndPt();
            if (pts[0].sqDistanceTo(ed) > Tol.LENGTH_2) {
                pts.push(ed);
            }
        } else {
            const n = 10;
            const crv = curves[0];
            const pMin = crv.getRange().min;
            const dp = crv.getRange().getLength() / (n - 1);
            for (let i = 0; i < n; i++) {
                pts.push(crv.getPtAt(pMin + dp * i));
            }
        }
        const ret = CurveUtil.getDzByPoints(pts)!;
        if (ret) return ret;
        if (hint) return hint;
        return curves[0].getStartTangent().getPerpendicular();
    }

    // 建议使用createPlaneFromPoints
    public static getDzByPoints(pts: Vec3[]): Vec3 | undefined {
        const areaVec = LoopArea.areaVectorOfPoint3ds(pts);
        const len = areaVec.getLength();
        return len < Tol.LENGTH_2 ? undefined : areaVec.multiply(1 / len);
    }

    public static makeRectangleByXY(x1: number, x2: number, y1: number, y2: number): Ln2[] {
        const ps = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
        ];
        return [new Ln2(ps[0], ps[1]), new Ln2(ps[1], ps[2]), new Ln2(ps[2], ps[3]), new Ln2(ps[3], ps[0])];
    }

    /**
     * 根据曲线中的奇异点，将曲线进行分割
     * @param curves
     * @param options 简化选项，默认全为 true
     * @returns splittedCurves: 分段结果；evolution：新曲线到旧曲线的映射关系
     */
    public static simplifyCurves2d(
        curves: Curve2[],
        options: ICurveSimplifyOption = {},
    ): { curves: Curve2[]; evolution: EvolutionMap<Curve2> } {
        const ret: Curve2[] = [];
        const evolution = new EvolutionMap<Curve2>();

        const addCurve = (newCrv: Curve2, crv: Curve2) => {
            ret.push(newCrv);
            evolution.set(newCrv, [crv]);
        };

        for (const crv of curves) {
            if (crv instanceof OffsetCurve2) {
                if (options.splitOffsetCurve) {
                    const ranges = crv.getContinuousRanges();
                    if (ranges.length > 1) {
                        for (const rg of ranges) {
                            addCurve(crv.clone().setRange(rg), crv);
                        }
                        continue;
                    }
                }
            } else if (crv instanceof SmoothPoly2) {
                if (options.smoothPolyToNurbs) {
                    const pts = crv.discrete();
                    addCurve(NurbsCurve2.makeByInterpolationPts(pts), crv);
                    continue;
                } else if (options.smoothPolyToLines) {
                    const pts = crv.discrete();
                    for (let i = 1; i < pts.length; i++) {
                        addCurve(new Ln2(pts[i - 1], pts[i]), crv);
                    }
                    continue;
                }
            }

            addCurve(options.clone ? crv.clone() : crv, crv);
        }

        return { curves: ret, evolution };
    }

    /**
     * 根据曲线中的奇异点，将曲线进行分割；将 SmoothPolyline 转为 NurbsCurve
     * @param curves
     * @param options 简化选项，默认全为 true
     * @returns splittedCurves: 分段结果；evolution：新曲线到旧曲线的映射关系
     */
    public static simplifyCurves3d(
        curves: Curve3[],
        options: ICurveSimplifyOption = {},
    ): { curves: Curve3[]; evolution: EvolutionMap<Curve3> } {
        const ret: Curve3[] = [];
        const evolution = new EvolutionMap<Curve3>();

        const addCurve = (newCrv: Curve3, crv: Curve3) => {
            ret.push(newCrv);
            evolution.set(newCrv, [crv]);
        };

        for (const crv of curves) {
            if (crv instanceof OffsetCurve3) {
                if (options.splitOffsetCurve) {
                    const ranges = crv.getContinuousRanges();
                    if (ranges.length > 1) {
                        for (const rg of ranges) {
                            addCurve(crv.clone().setRange(rg), crv);
                        }
                        continue;
                    }
                }
            } else if (crv instanceof SmoothPoly3) {
                const refCrv = crv.getCurve();
                if (refCrv) {
                    addCurve(refCrv, crv);
                } else if (options.smoothPolyToNurbs) {
                    const pts = crv.discrete();
                    addCurve(NurbsCurve3.makeByInterpolationPts(pts), crv);
                    continue;
                } else if (options.smoothPolyToLines) {
                    const pts = crv.discrete();
                    for (let i = 1; i < pts.length; i++) {
                        addCurve(new Ln3(pts[i - 1], pts[i]), crv);
                    }
                    continue;
                }
            }
            addCurve(options.clone ? crv.clone() : crv, crv);
        }
        return { curves: ret, evolution };
    }

    public static filterParamsByDistance(
        params: number[],
        point: types.IXY,
        curve: Curve2,
        lengthEps?: number,
    ): number[];

    public static filterParamsByDistance(
        params: number[],
        point: types.IXYZ,
        curve: Curve3,
        lengthEps?: number,
    ): number[];

    public static filterParamsByDistance<VectorType extends Vec>(
        params: number[],
        point: VectorType | types.IXY,
        curve: Curve<VectorType>,
        lengthEps: number = Tol.EDGE_LENGTH_EPS,
    ): number[] {
        if (params.length < 1) return [];
        let minDist = CONST.MODEL_MAX_LENGTH;
        const rets: number[] = [];
        const newParams: number[] = [];
        params.sort((a, b) => a - b);
        newParams.push(params[0]);
        for (let i = 1; i < params.length; ++i) {
            if (!Util.isNearlyEqual(newParams[newParams.length - 1], params[i])) {
                newParams.push(params[i]);
            }
        }

        for (const t of newParams) {
            const pt = curve.getPtAt(t);
            const d = pt.distanceTo(point);

            if (d < minDist - lengthEps) {
                rets.splice(0, rets.length, t);
                minDist = d;
            } else if (d < minDist + lengthEps) {
                rets.push(t);
                minDist = (minDist * (rets.length - 1) + t) / rets.length;
            }
        }
        return rets;
    }

    // 获取圆弧的极点： 比如上下左右4个点
    public static getArc3dPoles(arc: Arc3): Vec3[] {
        const params = [0, CONST.PI_2, CONST.PI, (CONST.PI * 3) / 2];
        const pts = params.map(p => arc.getPtAt(p));
        return pts.filter(pt => arc.containsPt(pt));
    }

    /**
     * 毛刺去除算法，扫掠的路径存在毛刺时会产生一些奇怪的结果
     * 目前采用角度容差，距离容差的情况去除毛刺
     */
    public static filterCurvesBurr(curves: Curve3[], angleEps: number, disEps: number) {
        if (curves.length < 3) return curves;

        const newCurves: Curve3[] = [];
        newCurves.push(curves[0]);
        for (let i = 1; i < curves.length; ++i) {
            if (newCurves.length < 1) {
                newCurves.push(curves[i]);
                continue;
            }
            const pre = newCurves[newCurves.length - 1];
            const cur = curves[i];
            if (pre.isLine3d() && cur.isLine3d() && (pre).isParallelTo(cur, angleEps)) {
                const dis = pre.getStartPt().distanceTo(cur.getEndPt());
                if (dis < disEps && Util.isNearlyEqual(pre.getLength(), cur.getLength(), disEps)) {
                    newCurves.pop();
                    continue;
                }
            } else if (pre.isArc() && cur.isArc() && pre.getCenter().distanceTo(cur.getCenter()) < disEps) {
                const dis = pre.getStartPt().distanceTo(cur.getEndPt());
                if (dis < disEps && Util.isNearlyEqual(pre.getLength(), cur.getLength(), disEps)) {
                    newCurves.pop();
                    continue;
                }
            }
            newCurves.push(curves[i]);
        }

        // 首尾段处理
        if (newCurves.length > 2 && newCurves[0].getStartPt().equals(newCurves[newCurves.length - 1].getEndPt())) {
            const pre = newCurves[newCurves.length - 1];
            const cur = newCurves[0];
            if (pre.isLine3d() && cur.isLine3d() && (pre).isParallelTo(cur, angleEps)) {
                const dis = pre.getStartPt().distanceTo(cur.getEndPt());
                if (dis < disEps && Util.isNearlyEqual(pre.getLength(), cur.getLength(), disEps)) {
                    newCurves.pop();
                    newCurves.shift();
                }
            } else if (pre.isArc() && cur.isArc() && pre.getCenter().distanceTo(cur.getCenter()) < disEps) {
                const dis = pre.getStartPt().distanceTo(cur.getEndPt());
                if (dis < disEps && Util.isNearlyEqual(pre.getLength(), cur.getLength(), disEps)) {
                    newCurves.pop();
                    newCurves.shift();
                }
            }
        }

        return newCurves;
    }

    /**
     * 根据所给的两个点pt1和pt2设置曲线的参数域
     * @param curve 曲线
     * @param pt1 在曲线上的点
     * @param pt2 在曲线上的点
     * @param refPt 参考点，对于周期性曲线，会存在两段，refPt用于判断取哪一段。所以对于周期性曲线，要传入refPt
     * @returns 返回是否交换起点和终点。譬如说直线，pt1的参数大于pt2的参数值，说明是从pt2到pt1方向的，就需要交换两个点的顺序
     */
    public static setCurveRange(theCurve: Curve3, pt1: Vec3, pt2: Vec3, refPt?: Vec3): boolean {
        let stParam = theCurve.getParamAt(pt1);
        let endParam = theCurve.getParamAt(pt2);
        if (!theCurve.isPeriodic()) {
            if (stParam > endParam) {
                theCurve.setRange(endParam, stParam);
                return true;
            }

            theCurve.setRange(stParam, endParam);
            return false;
        }

        const period = (theCurve.getRange() as PeriodInterval).period;
        if (pt1.equals(pt2, Tol.EDGE_LENGTH_EPS)) {
            theCurve.setRange(stParam, stParam + period);
            return false;
        }

        if (refPt === undefined) {
            if (stParam > endParam + Tol.NUMBER) {
                theCurve.setRange(stParam, endParam + period);
            } else {
                theCurve.setRange(stParam, endParam);
            }
            return false;
        }

        let swapVt = false;
        const midParam = (stParam + endParam) / 2;
        const midPt = theCurve.getPtAt(midParam);
        const midPt2 = theCurve.getPtAt(midParam + period / 2);
        if (stParam < endParam) {
            if (midPt.sqDistanceTo(refPt) > midPt2.sqDistanceTo(refPt)) {
                stParam += period;
                swapVt = true;
            }
        } else {

            if (midPt.sqDistanceTo(refPt) < midPt2.sqDistanceTo(refPt)) {
                swapVt = true;
            } else {
                endParam += period;
            }
        }

        // // 如果是nurbs，出参数域，整体平移period
        // if (xCurve.isNurbsCurve3d()) {
        //     const domain = xCurve.getDomain();
        //     if (stParam > domain.max || endParam > domain.max) {
        //         stParam -= period;
        //         endParam -= period;
        //     } else if (stParam < domain.min || endParam < domain.min) {
        //         stParam += period;
        //         endParam += period;
        //     }
        // }

        if (swapVt) {
            theCurve.setRange(endParam, stParam);
            return true;
        }

        theCurve.setRange(stParam, endParam);
        return false;
    }
}
