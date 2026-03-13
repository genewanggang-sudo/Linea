import { Tol } from '../../base/tol';
import { Surface } from '../../geometry/surface';



// 两个简单曲面是否共面，extendCurve的sweepSurface是复合曲面，不是简单曲面，不能用此方法
export class SurfacesCoplaner {
    public static simple(surface1: Surface, surface2: Surface, tol: Tol): boolean {
        return surface1.isCoplanar(surface2, tol);
    }
}