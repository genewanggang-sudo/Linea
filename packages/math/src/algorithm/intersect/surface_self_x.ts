import { Surface } from '../../geometry/surface';
import { types } from '../../type_define/i_types';
import { Vec3 } from '../../base/vec3';
import { Tol } from '../../base/tol';
import { Curve3 } from '../../geometry/curve3d'; 



export class SurfaceSelfX {
    public static singleIntersectCurve(
        surf: Surface,
        refUV1: types.IXY,
        refUV2: types.IXY,
        refDir?: Vec3,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        return undefined;
    }
}