import { Vec2 } from '../base/vec2';
import { Curve2 } from '../geometry/curve2';
import { Vec3 } from '../base/vec3';
import { Surface } from '../geometry/surface';
import { Curve3 } from '../geometry/curve3d';
import { PtToCv2Distance } from './distance/pt_to_curve2_signed_distance';
import { PtToCurve3Distance } from './distance/pt_to_curve3_distance';
import { PtToSurfDistance } from './distance/pt_to_surface_distance';
import { Curve2sDistance } from './distance/curve2s_distance';
import { Curve3sDistance } from './distance/curve3s_distance';
import { Tol } from '../base/tol';
import { IPtCvDistanceInfo2, IPtCvDistanceInfo3 } from './distance/pt_to_curve_distance_info';
import { types } from '../type_define/i_types';



/**
 * - 点到二维曲线的距离
 * - 点到三维曲线的距离
 * - 点到Surface的有向距离
 * - 点到Surface的距离
 * - 二维曲线到二维曲线最近距离
 */
export class D {
    /**
     * 点到曲线距离
     * @param point 点
     * @param curve 二维曲线，可以是无限长Line
     * @param minDistancePoint 最小距离曲线上的点
     */
    public static ptToCurve2d(point: types.IXY, curve: Curve2, minDistancePoint?: Vec2): number {
        const ret = PtToCv2Distance.execute(point, curve, false);
        if (minDistancePoint) minDistancePoint.copy(ret.foot);
        return ret.distance;
    }

    /**
     * 点到曲线的有向距离，点在直线右侧返回正，否则返回负值
     * @param point 点
     * @param curve 二维曲线，可以是无限长Line
     * @param minDistancePoint 最小距离曲线上的点
     */
    public static ptToCurve2dSigned(point: types.IXY, curve: Curve2, minDistancePoint?: Vec2): number {
        const ret = PtToCv2Distance.execute(point, curve, true);
        if (minDistancePoint) minDistancePoint.copy(ret.foot);
        return ret.distance;
    }

    /**
     * 点到曲线的有向距离，点在直线右侧返回正，否则返回负值
     * @param point
     * @param curve
     * @param minDistancePoint
     */
    public static ptToCurve2dSignedInfo(point: types.IXY, curve: Curve2): IPtCvDistanceInfo2 {
        return PtToCv2Distance.execute(point, curve, true);
    }

    /**
     * 点到三维曲线的距离，直线支持传入有限长和无限长
     * @returns 距离值 >= 0
     */
    public static ptToCurve3d(point: types.IXYZ, curve: Curve3, footPoint?: Vec3): number {
        const ret = PtToCurve3Distance.execute(point, curve);
        if (footPoint) footPoint.copy(ret.foot);
        return ret.distance;
    }

    /**
     * 点到三维曲线的距离，直线支持传入有限长和无限长
     */
    public static ptToCurve3dInfo(point: types.IXYZ, curve: Curve3): IPtCvDistanceInfo3 {
        return PtToCurve3Distance.execute(point, curve);
    }

    /**
     * 点到三围曲线组的距离
     * @param point
     * @param curves
     * @param eps
     */
    public static ptToCurve3dsInfos(
        point: types.IXYZ,
        curves: Curve3[],
        eps = Tol.LENGTH,
    ): IPtCvDistanceInfo3[] {
        return PtToCurve3Distance.curves(point, curves, eps);
    }

    /**
     * 点到Surface的距离,返回结果 >= 0
     * @param point 三维点
     * @param surface 曲面
     * @param footPoint  [out] 输出参数，若用户想要获取垂足点，则传入该参数
     * @returns 距离值，≥0
     */
    public static ptToSurf(point: Vec3, surface: Surface, footPoint?: Vec3) {
        return Math.abs(PtToSurfDistance.execute(point, surface, footPoint));
    }

    /**
     *  点到Surface的有向距离
     * @param point 三维点
     * @param surface 曲面
     * @param footPoint  [out] 输出参数，若用户想要获取垂足点，则传入该参数
     * @returns 有向距离,在法线同侧为正，
     */
    public static ptToSurfSigned(point: Vec3, surface: Surface, footPoint?: Vec3): number {
        return PtToSurfDistance.execute(point, surface, footPoint);
    }

    /**
     * 二维曲线到二维曲线最近距离
     * @param curve1 二维曲线
     * @param curve2 二维曲线
     * @param minDistPoint1 最小距离曲线1上的点
     * @param minDistPoint2 最小距离曲线2上的点
     */
    public static curve2s(
        curve1: Curve2,
        curve2: Curve2,
        minDistPoint1?: Vec2,
        minDistPoint2?: Vec2,
    ): number {
        return Curve2sDistance.execute(curve1, curve2, minDistPoint1, minDistPoint2);
    }

    /**
     * 三维曲线到三维曲线最近距离
     * @param curve1 三维曲线
     * @param curve2 三维曲线
     * @param minDistPoint1 最小距离曲线1上的点
     * @param minDistPoint2 最小距离曲线2上的点
     */
    public static curve3s(
        curve1: Curve3,
        curve2: Curve3,
        minDistPoint1?: Vec3,
        minDistPoint2?: Vec3,
    ): number {
        return Curve3sDistance.execute(curve1, curve2, minDistPoint1, minDistPoint2);
    }
}