import { D } from './calc_d';
import { LoopsPJ } from './pj/loops_pj';
import { CurvesPJType, LoopsPJType, PtLoopPJType } from './pj/pj_type';
import { PtLoopPJ } from './pj/pt_loop_pj';
import { PtPolygonPJ } from './pj/pt_polygon_pj';
import { CurvesPJ } from './pj/curves_pj';
import { Vec } from '../base/vec';
import { Curve } from '../geometry/curve';
import { Vec3 } from '../base/vec3';
import { Plane } from '../geometry/plane';
import { Loop } from '../topology/loop';
import { Vec2 } from '../base/vec2';
import { Polygon } from '../topology/polygon';
import { Tol } from '../base/tol';
import { Curve2 } from '../geometry/curve2';
import { CurvesOverlapJudge } from './pj/curves_oj';



export interface IPtLoopResult {
    type: PtLoopPJType;
    curve?: Curve2;
}

class PJ {
    /**
     * 点是否在平面的右侧，
     *
     * 规定：点在平面法线一侧为右侧，否则为左侧
     *
     * @param point 任意一点
     * @param plane 任意平面
     */
    public static isPtAbovePlane(point: Vec3, plane: Plane): boolean {
        return D.ptToSurfSigned(point, plane) > 0;
    }

    /**
     * 曲线与曲线的位置关系判断:相交，重叠，不相交。
     * 支持 直线和圆弧
     * @param curve1
     * @param curve2
     * @param tolerance
     * @returns `CurvesPJType`
     */
    public static curveToCurve<PointType extends Vec>(
        curve1: Curve<PointType>,
        curve2: Curve<PointType>,
        distanceTol = Tol.LENGTH,
        angleTol = Tol.ANGLE,
    ): CurvesPJType {
        return CurvesPJ.execute(curve1, curve2, distanceTol, angleTol);
    }

    /**
     * 曲线和曲线是否重叠关系判断：不重叠，重叠，部分重叠
     * 支持直线、圆弧
     * @param curve1
     * @param curve2
     * @param distanceTol
     * @param angleTol
     */
    public static curvesOverlap<PointType extends Vec>(
        curve1: Curve<PointType>,
        curve2: Curve<PointType>,
        distanceTol = Tol.LENGTH,
        angleTol = Tol.ANGLE,
    ): CurvesPJType {
        return CurvesOverlapJudge.execute(curve1, curve2, distanceTol, angleTol);
    }

    /**
     * 点与Loop的位置关系判断:ONEDGE, ONVERTEX，IN，OUT
     *
     * @param point
     * @param loop
     * @param tolerance
     * @returns `CurvesPJType`
     */
    public static ptToLoop(pt: Vec2, loop: Loop, tolerance: number = Tol.LENGTH): IPtLoopResult {
        return PtLoopPJ.execute(pt, loop, tolerance);
    }

    /**
     * 点与Polygon的位置关系判断
     *
     * @param point
     * @param Polygon
     * @param tol
     * @returns `CurvesPJType`
     */
    public static ptToPolygon(pt: Vec2, polygon: Polygon, tol: number = Tol.LENGTH): PtLoopPJType {
        return PtPolygonPJ.execute(pt, polygon, tol);
    }

    /**
     * Loop1与Loop2的位置关系判断：相离、外切、相交、内切、包含
     * 逆时针的环为外环，顺时针的环为内环
     *
     * @param curve 2d曲线
     * @param loop
     * @param tolerance
     * @param tangentIsIntersect 如果是true将内切和外切的情况判断为intersect；如果是false，则外切的情况认为是out，内切的情况认为是contain或者in。默认为false
     * @returns `CurvesPJType`
     */
    public static loopToLoop(
        loop1: Loop,
        loop2: Loop,
        tol: number = Tol.LENGTH,
        tangentIsIntersect = false,
    ): LoopsPJType {
        return LoopsPJ.execute(loop1, loop2, tol, tangentIsIntersect);
    }
}

export { PJ };