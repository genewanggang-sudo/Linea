import { Ln2 } from '../geometry/ln2';
import { CurvesProject } from './project/curve_curve_project';
import { Curve2 } from '../geometry/curve2';
import { Plane } from '../geometry/plane';
import { Curve3 } from '../geometry/curve3d';
import { Ln3 } from '../geometry/ln3';
import { Interval } from '../base/interval';
import { Coord3 } from '../base/coord3';
import { ILine } from '../type_define/i_geometry';
import { Vec } from '../base/vec';
import { Curve3ProjectToPlane } from './project/curve3d_to_plane_project';



/**
 * 投影算法
 */
export class Project {
    /**
     * curve沿coordinate z轴向coordinate XOY面投影. 调用此接口请保证曲线必须在coord的XOY平面上。
     */
    public static curve3dTo2d(curve: Curve3, coord: Coord3): Curve2 | undefined {
        return new Plane(coord).getCurve2d(curve);
    }

    /**
     * (支持斜投影)将三维曲线投影到平面上，得到在平面上的二维投影。与curve3dTo2d的区别是，curve3d可以不在平面上。
     */
    public static curveToPlane(curve: Curve3, plane: Plane): Curve2 | undefined {
        const proj = new Curve3ProjectToPlane(curve, plane);
        return proj.execute();
    }

    /**
     * line1向line2投影，返回一个区间，该区间代表投影后的线在line2参数域上的区间
     */
    public static line1ToLine2(line1: Ln2, line2: Ln2): Interval;

    public static line1ToLine2(line1: Ln3, line2: Ln3): Interval;

    public static line1ToLine2<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
    ): Interval {
        return CurvesProject.lines(line1, line2);
    }

    /**
     * 将二维曲线根据坐标系转换至三维空间
     */
    public static curve2dTo3d(curve: Curve2, coord: Coord3): Curve3 {
        return new Plane(coord).getCurve3d(curve);
    }
}