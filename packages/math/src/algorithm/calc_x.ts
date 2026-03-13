import { Curve2 } from '../geometry/curve2';
import { Curve3 } from '../geometry/curve3d';
import { Surface } from '../geometry/surface';
import {
    ICurvesXInfo2d,
    ICurvesXInfo3d,
    ICvSurfXInfo,
    ISurfacesXInfo,
} from './intersect/x_info';
import { CurvesX } from './intersect/curves_x';
import { CurveSurfaceX } from './intersect/curve_surface_x';
import { SurfacesX } from './intersect/surfaces_x';
import { Tol } from '../base/tol';
import { Interval } from '../base/interval';
import { CurvesXUtil } from './intersect/curves_x_util';
import { Vec3 } from '../base/vec3';
import { Vec2 } from '../base/vec2';
import { CurvesOverlap } from './overlap/curves_overlap';
import { XInfoUtil } from './intersect/intersect_info_util';
import { types } from '../type_define/i_types';
import { CurveSelfX } from './intersect/curve_self_x';
import { IntersectCurve3 } from '../geometry/intersect_curve3';
import { Polygon } from '../topology/polygon';



/**
 * 几何元素求交，线线求交，线面求交
 */
class X {
    /**
     * 曲线与曲线的交点，目前支持Line2d与Line2d的交点, Line2d和Arc2d的交点，Arc2d和Arc2d的交点
     * 若两曲线重合，则交点为重合段内的某个交点
     * @param curve1
     * @param curve2
     * @param tol 容差
     */
    public static curve2ds(
        curve1: Curve2,
        curve2: Curve2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        return CurvesX.curve2ds(curve1, curve2, tol);
    }

    /**
     * 曲线与曲线的交点
     * 若两曲线重合，则交点为重合段内的某个交点
     * @param curve1
     * @param curve2
     * @param tol 容差
     */
    public static curve3ds(
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        return CurvesX.curve3ds(curve1, curve2, tol);
    }

    /**
     * 在给定点附近，计算曲线与曲线的交点
     * @param curve1
     * @param curve2
     * @param point 二维维参考点
     */
    public static curve2dsNearPoint(
        curve1: Curve2,
        curve2: Curve2,
        point: Vec2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d | undefined {
        const xInfos = CurvesX.curve2ds(curve1, curve2, tol);
        xInfos.sort((_a, _b) => _a.point.sqDistanceTo(point) - _b.point.sqDistanceTo(point));
        return xInfos[0];
    }

    /**
     * 在给定参数附近，计算曲线与曲线的交点
     * @param curve1
     * @param curve2
     * @param param1 curve1 上的参考参数
     * @param param2 curve2 上的参考参数
     */
    public static curve2dsNearParams(
        curve1: Curve2,
        curve2: Curve2,
        param1: number,
        param2: number,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d | undefined {
        return CurvesXUtil.curve2dsSingleX(curve1, curve2, [param1, param2], tol);
    }

    /**
     * 在给定点附近，计算曲线与曲线的交点
     * @param curve1
     * @param curve2
     * @param point 三维参考点
     */
    public static curve3dsNearPoint(
        curve1: Curve3,
        curve2: Curve3,
        point: Vec3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d | undefined {
        return CurvesX.curve3dsNearPoint(curve1, curve2, point, tol);
    }

    /**
     * 在给定参数附近，计算曲线与曲线的交点
     * @param curve1
     * @param curve2
     * @param param1 curve1 上的参考参数
     * @param param2 curve2 上的参考参数
     */
    public static curve3dsNearParams(
        curve1: Curve3,
        curve2: Curve3,
        param1: number,
        param2: number,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d | undefined {
        return CurvesXUtil.curve3dsSingleX(curve1, curve2, [param1, param2], tol);
    }

    /**
     * 二维曲线间的重合判断
     * @param curve1
     * @param curve2
     * @param tol
     * @deprecated 请使用 Overlap.Curve2ds 替代
     */
    public static curve2dsOverlap(
        curve1: Curve2,
        curve2: Curve2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        return CurvesOverlap.curve2ds(curve1, curve2, tol).map(info =>
            XInfoUtil.curvesFromOverlap(info, curve1, curve2, tol),
        );
    }

    /**
     * 三维曲线间的重合判断
     * @param curve1
     * @param curve2
     * @param tol
     * @deprecated 请使用 Overlap.Curve3ds 替代
     */
    public static curve3dsOverlap(
        curve1: Curve3,
        curve2: Curve3,
        tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        return CurvesOverlap.curve3ds(curve1, curve2, tol).map(info =>
            XInfoUtil.curvesFromOverlap(info, curve1, curve2, tol),
        );
    }

    /**
     * 二维曲线的自交点计算，主要针对nurbs曲线和extend曲线。(目前还未完善，计算自交点不全，不建议外部使用)
     * @param curve
     * @param tol
     */
    public static curve2dSelfX(curve: Curve2, tol = Tol.DEFAULT): ICurvesXInfo2d[] {
        return CurveSelfX.curve2dSelfX(curve, tol);
    }

    /**
     * 判断二维曲线是否自相交
     * @param curve
     * @param tol
     * @returns
     */
    public static isCurve2dSelfX(curve: Curve2, tol = Tol.DEFAULT): boolean {
        return CurveSelfX.isCurve2dSelfX(curve, tol);
    }

    /**
     * 三维曲线的自交点计算，主要针对nurbs曲线和extend曲线。(目前还未完善，计算自交点不全，不建议外部使用)
     * @param curve
     * @param tol
     */
    public static curve3dSelfX(curve: Curve3, tol = Tol.DEFAULT): ICurvesXInfo3d[] {
        return CurveSelfX.curve3dSelfX(curve, tol);
    }

    /**
     * 计算三维曲线与曲面的交点集
     * @param curve 曲线
     * @param surface 曲面
     * @param tol 容差
     * @param surfRangeUV 给定曲面的参数域UV
     * @returns 交可能不止一个，故返回交点的数组
     */
    public static curveSurface(
        curve: Curve3,
        surface: Surface,
        tol = Tol.DEFAULT,
        surfRangeUV?: Interval[],
    ): Vec3[] {
        return CurveSurfaceX.allPoints(curve, surface, tol, surfRangeUV);
    }

    /**
     * 三维曲线与曲面的交：可能包含交线，交点
     * @param curve 曲线
     * @param surface 曲面
     * @param tol 容差
     * @param surfRangeUV 给定曲面的参数域UV
     * @returns 交可能不止一个，故返回交点的数组
     */
    public static curveSurfaceAll(
        curve: Curve3,
        surface: Surface,
        tol = Tol.DEFAULT,
        surfRangeUV?: Interval[],
    ): ICvSurfXInfo[] {
        return CurveSurfaceX.execute(curve, surface, tol, surfRangeUV);
    }

    /**
     * 给定一个参考点，返回距离参考点最近的一个交点
     * @param curve  曲线
     * @param surface 曲面
     * @returns 交点
     */
    public static curveSurfaceNearPoint(
        curve: Curve3,
        surface: Surface,
        refPoint: Vec3,
        tol = Tol.DEFAULT,
    ): Vec3 | undefined {
        return CurveSurfaceX.nearPoint(curve, surface, refPoint, tol)?.point;
    }

    /**
     * 给定一个参考参数uv和t，返回附近的一个交点
     * @param curve  曲线
     * @param surface 曲面
     * @returns 交点
     */
    public static curveSurfaceNearParams(
        curve: Curve3,
        surface: Surface,
        refT: number,
        refUV: types.IXY,
        tol = Tol.DEFAULT,
    ): Vec3 | undefined {
        return CurveSurfaceX.nearParam(curve, surface, refT, refUV, tol)?.point;
    }

    // // 曲面上的等参线和另一个曲面求交
    // public static curveSurfaceNearPoint2(
    //     surfaceCurve: { surface: Surface; param: number; isU: boolean },
    //     surface: Surface,
    //     refPoint: Vec3,
    //     tol = Tol.DEFAULT,
    // ): Vec3 {
    //     return CurveSurfaceX.nearPoint(curve, surface, refPoint, tol);
    // }

    /**
     * 判断曲线曲面是否有交
     * @param curve 曲线
     * @param surface 曲面
     * @param surfBoundary 曲面的参数区间
     * @returns 返回是否有交
     */
    public static isIntersectCurveSurface(
        curve: Curve3,
        surface: Surface,
        surfBoundary?: Polygon,
        tol = Tol.DEFAULT,
    ): boolean {
        return CurveSurfaceX.hasIntersect(curve, surface, surfBoundary, tol);
    }

    /**
     * ！！！注意：暂不完善，请不要调用此接口
     * 曲面与曲面相交：可能为交线，交点，或者重合的surface
     * 使用建议：求交最好能传入求交曲面的大概参数域，特别是对于平面、柱面、锥面这样参数域无穷大的，传入UV有利于提高计算效率
     * @param surf1 曲面1
     * @param surf2 曲面2
     * @param rangeU1 曲面1的参数域U
     * @param rangeV1 曲面1的参数域V
     * @param rangeU2 曲面2的参数域U
     * @param rangeV2 曲面2的参数域V
     * @param tol:
     * @returns 交线可能不止一条，故返回交线的数组
     */
    public static surfaces(
        surf1: Surface,
        surf2: Surface,
        rangeU1?: Interval,
        rangeV1?: Interval,
        rangeU2?: Interval,
        rangeV2?: Interval,
        tol: Tol = Tol.DEFAULT,
    ): ISurfacesXInfo[] {
        return SurfacesX.allIntersections(surf1, surf2, rangeU1, rangeV1, rangeU2, rangeV2, tol);
    }

    /**
     * ！！！注意：暂不完善，请不要调用此接口
     * 曲面与曲面相交: 只返回交线（忽略交点、重合面），重合的情况返回重合区域边界curve3d
     * 使用建议：求交最好能传入求交曲面的大概参数域，特别是对于平面、柱面、锥面这样参数域无穷大的，传入UV有利于提高计算效率
     * @param surf1 曲面1
     * @param surf2 曲面2
     * @param rangeU1 曲面1的参数域U
     * @param rangeV1 曲面1的参数域V
     * @param rangeU2 曲面2的参数域U
     * @param rangeV2 曲面2的参数域V
     * @param tol
     * @returns 交线可能不止一条，故返回交线的数组
     */
    public static surfacesSimplified(
        surf1: Surface,
        surf2: Surface,
        rangeU1?: Interval,
        rangeV1?: Interval,
        rangeU2?: Interval,
        rangeV2?: Interval,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
        convertToNurbs = false,
    ): Curve3[] {
        const res = SurfacesX.allIntersections(
            surf1,
            surf2,
            rangeU1,
            rangeV1,
            rangeU2,
            rangeV2,
            tol,
            useHighPrecision,
        );
        const resCurves: Curve3[] = [];
        for (const it of res) {
            if (it.curve) {
                const curve = it.curve;
                if (curve instanceof IntersectCurve3 && convertToNurbs) {
                    const nurbs = curve.toSimpleCurve3d(3);
                    resCurves.push(nurbs);
                } else {
                    resCurves.push(it.curve);
                }
            }
        }

        return resCurves;
    }

    /**
     * 曲面与曲面相交: 给定一个参考点，返回交线距离参考点最近的一条交线（使用简单方法计算交线，不使用混合求交方法，没有surfacesNearPoint方法稳定）
     * @param surf1 曲面
     * @param surf2 曲面
     * @param refPoint 参考点，最好是交线上的点，或者是距离交线很近的点
     * @param refDir 参考点位置的参考切向
     * @returns 返回距离参考点最近的一条交线 // 如果没有交线或者计算失败返回undefined
     */
    public static surfacesNearPointSimple(
        surf1: Surface,
        surf2: Surface,
        refPoint: Vec3,
        refDir?: Vec3,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        let result: Curve3 | undefined;
        try {
            result = SurfacesX.singleCurveNearPointSimple(
                surf1,
                surf2,
                refPoint,
                refDir,
                tol,
                useHighPrecision,
            );
        } catch (e) {
            return undefined;
        }
        return result;
    }

    /**
     * 曲面与曲面相交: 给定两个点之间的交线段。用于已经计算到了交线curve的两个端点，需要求出两点之间的那一段交线。
     * @param surf1 曲面
     * @param surf2 曲面
     * @param point1 交线上的起点
     * @param point2 交线上的终点
     * @param refDir 起点位置的参考切向.如果交线是周期性的，建议给出refDir，否则不知道取哪一段交线（类似圆被分割为两段，取优弧还是劣弧）
     * @returns 返回距离参考点最近的一条交线 // 如果没有交线或者计算失败返回undefined
     */
    public static surfacesBetweenTwoPoints(
        surf1: Surface,
        surf2: Surface,
        point1: Vec3,
        point2: Vec3,
        refDir?: Vec3,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        let result: Curve3 | undefined;
        try {
            result = SurfacesX.singleCurveBetweenTwoPoints(
                surf1,
                surf2,
                point1,
                point2,
                refDir,
                tol,
                useHighPrecision,
            );
        } catch (e) {
            return undefined;
        }
        return result;
    }

    /**
     * 曲面与曲面相交: 给定一个参考点，返回交线距离参考点最近的一条交线
     * @param surf1 曲面
     * @param surf2 曲面
     * @param refPoint 参考点，最好是交线上的点，或者是距离交线很近的点
     * @param refDir 参考点位置的参考切向
     * @param tol 求交容差参数
     * @param useHighPrecision 是否使用高精度求交
     * @param convertToNurbs 是否将求交结果为IntersectCurve3d的转为nurbs曲线
     * @returns 返回距离参考点最近的一条交线 // 如果没有交线或者计算失败返回undefined
     */
    public static surfacesNearPoint(
        surf1: Surface,
        surf2: Surface,
        refPoint: Vec3,
        refDir?: Vec3,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
        convertToNurbs = true,
    ): Curve3 | undefined {
        let result: Curve3 | undefined;
        try {
            result = SurfacesX.singleCurveNearPoint(
                surf1,
                surf2,
                refPoint,
                refDir,
                tol,
                useHighPrecision,
                convertToNurbs,
            );
        } catch (e) {
            return undefined;
        }
        return result;
    }

    /**
     * 给定一个参考点，返回交线距离参考点最近的交线（可用于曲面自交求交线）
     * @param surf1 曲面
     * @param surf2 曲面
     * @param refUV1 参考uv
     * @param refUV2 参考uv
     * @param refDir 参考点位置的参考切向
     * @returns 返回距离参考点最近的一条自交交线 // 如果没有交线或者计算失败返回undefined
     */
    public static surfacesNearParams(
        surf1: Surface,
        surf2: Surface,
        refUV1: types.IXY,
        refUV2: types.IXY,
        refDir?: Vec3,
        tol: Tol = new Tol(),
        useHighPrecision = false,
    ): Curve3 | undefined {
        let result: Curve3 | undefined;
        try {
            result = SurfacesX.singleCurveNearParam(
                surf1,
                surf2,
                refUV1,
                refUV2,
                refDir,
                tol,
                useHighPrecision,
            );
        } catch (e) {
            return undefined;
        }
        return result;
    }

    /**
     * 曲面自交求交线: 给定一个参考点，返回交线距离参考点最近的交线
     * @param surf 曲面
     * @param refUV1 参考uv
     * @param refUV2 参考uv
     * @param refDir 参考点位置的参考切向
     * @returns 返回距离参考点最近的一条自交交线 // 如果没有交线或者计算失败返回undefined
     */
    public static surfacesSelfIntersect(
        surf: Surface,
        refUV1: types.IXY,
        refUV2: types.IXY,
        refDir?: Vec3,
        tol: Tol = new Tol(),
        useHighPrecision = false,
    ): Curve3 | undefined {
        let result: Curve3 | undefined;
        try {
            result = SurfacesX.selfIntersectCurve(surf, refUV1, refUV2, refDir, tol, useHighPrecision);
        } catch (e) {
            return undefined;
        }
        return result;
    }
}

export { X };