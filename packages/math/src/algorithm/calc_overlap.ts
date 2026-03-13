import { Tol } from '../base/tol';
import { Curve2 } from '../geometry/curve2';
import { Curve3 } from '../geometry/curve3d';
import { Surface } from '../geometry/surface';
import { CurvesOverlap } from './overlap/curves_overlap';
import { ICurvesOverlapInfo } from './overlap/i_overlap';
import { SurfacesCoplaner } from './overlap/surfaces_coplaner';
import { CurvesColinear } from './overlap/curves_colinear';
import { CurveSurfaceCoincide } from './overlap/curve_surface_coincide';



class CalcOverlap {
    /**
     * 判断曲线是否共线，不需要有重合
     * @param curve1
     * @param curve2
     * @param tol
     * @returns 返回是否共线
     */
    public static curve2dsColinear(curve1: Curve2, curve2: Curve2, tol = Tol.DEFAULT): boolean {
        return CurvesColinear.curve2ds(curve1, curve2, tol);
    }

    /**
     * 计算曲线与曲线重合部分
     * @param curve1
     * @param curve2
     * @param tol
     * @returns 返回曲线重合部分，若无重合部分，则返回空集
     */
    public static curve2ds(curve1: Curve2, curve2: Curve2, tol = Tol.DEFAULT): ICurvesOverlapInfo[] {
        return CurvesOverlap.curve2ds(curve1, curve2, tol);
    }

    /**
     * 判断曲线是否共线，不需要有重合
     * @param curve1
     * @param curve2
     * @param tol
     * @returns 返回是否共线
     */
    public static curve3dsColinear(curve1: Curve3, curve2: Curve3, tol = Tol.DEFAULT): boolean {
        return CurvesColinear.curve3ds(curve1, curve2, tol);
    }

    /**
     * 计算曲线与曲线重合部分
     * @param curve1
     * @param curve2
     * @param tol
     * @returns 返回曲线重合部分，若无重合部分，则返回空集
     */
    public static curve3ds(curve1: Curve3, curve2: Curve3, tol = Tol.DEFAULT): ICurvesOverlapInfo[] {
        return CurvesOverlap.curve3ds(curve1, curve2, tol);
    }

    // /**
    //  * 计算曲面与曲面重合部分
    //  * @param surface1
    //  * @param surface2
    //  * @param tol
    //  * @returns 返回曲面重合部分。若无重合部分，则返回空集
    //  */
    // public static surfaces(surface1: Surface, surface2: Surface, tol = Tol.DEFAULT): SurfaceSurfaceOverlap[] {}

    /**
     * 计算曲面与曲面重合部分，不支持 SweepSurface，暂不支持 NurbsSurface
     * @param surface1
     * @param surface2
     * @param tol
     * @returns 当两个曲面重合时返回 true
     */
    public static isSurfacesCoplaner(surface1: Surface, surface2: Surface, tol = Tol.DEFAULT): boolean {
        return SurfacesCoplaner.simple(surface1, surface2, tol);
    }

    // /**
    //  * 计算曲线与曲面重合部分
    //  * @param curve1
    //  * @param surface
    //  * @param tol
    //  * @returns 返回曲线与曲面重合部分的参数范围。若无重合部分，则返回空集
    //  */
    // public static curveSurface(curve1: Curve3, surface: Surface, tol = Tol.DEFAULT): Interval[] { }

    /**
     * 计算曲线与曲面重合部分，不支持 SweepSurface，暂不支持 NurbsSurface
     * @param curve1
     * @param surface
     * @param tol
     * @returns 返回曲线与曲面是否重合
     */
    public static isCurveSurfaceOverlap(curve1: Curve3, surface: Surface, tol = Tol.DEFAULT): boolean {
        return CurveSurfaceCoincide.execute(curve1, surface, tol);
    }
}

export { CalcOverlap, CalcOverlap as Overlap };