import { Vec3 } from '../../base/vec3';
import { CONST } from '../../type_define/const';
import { Tol } from '../../base/tol';
import { Curve3 } from '../../geometry/curve3d';
// import { EN_GEO_TYPE } from '../../../type_define/i_element_type';
import { PtToCurve3Distance } from './pt_to_curve3_distance';



/**
 * 点集到曲线集的最近距离
 */
export class PtsToCurvesDistance {
    /**
     * 点集到曲线集的最近距离
     * oldMinDis 用于包围盒加速计算，传入一个已知的距离，如果没有已知距离，就不用传入该参数，用默认值就行。譬如说，前面已
     *           经计算了曲线顶点之间的最近距离为2.015，就可以筛选跳过很多包围盒最小距离都大于此距离的曲线，提高效率。
     */
    public static execute(
        ptSet: Array<Vec3>,
        curve3dSet: Array<Curve3>,
        minDisPoint1: Vec3,
        minDisPoint2: Vec3,
        oldMinDis: number = CONST.MAX_INTEGER,
    ): number {
        let minDist: number = oldMinDis;
        for (const pt of ptSet) {
            for (const curve of curve3dSet) {
                // if (curve.getType() === EN_NURBS_CURVE_3D || curve.getType() === EN_NURBS_CURVE_3D )
                // if(pttocurveboxdis(pt,curve) > minDist) { //后续出现了计算椭圆和nurbs曲线最近距离用curve3d的包围盒加速
                // continue;
                // }
                const tmp = PtToCurve3Distance.execute(pt, curve);
                if (tmp.distance < minDist) {
                    minDist = tmp.distance;
                    minDisPoint1.copy(pt);
                    minDisPoint2.copy(tmp.foot);
                }

                if (minDist < Tol.LENGTH) {
                    return minDist;
                }
            }
        }

        return minDist;
    }
}