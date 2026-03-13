import { Curve3 } from '../../geometry/curve3d';
import { Surface } from '../../geometry/surface';
import { Tol } from '../../base/tol';
import { Plane } from '../../geometry/plane';



// 曲线是否和曲面重合: 以后需要补充更有效更详细的重合的判断
export class CurveSurfaceCoincide {
    public static execute(curve: Curve3, surface: Surface, tol: Tol): boolean {
        if (surface instanceof Plane) {
            return surface.containsCurve(curve, tol.lengthEps, tol.angleEps);
        }

        return surface.containsCurve(curve, tol.lengthEps);
    }
}