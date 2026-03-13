import { Tol } from '../base/tol';
import { Curve3 } from '../geometry/curve3d';
import { Curve2 } from '../geometry/curve2';
import { Vec3 } from '../base/vec3';
import { Vec2 } from '../base/vec2';
import { types } from '../type_define/i_types';
import { Curve } from '../geometry/curve';
import { Vec } from '../base/vec';



/**
 * 和几何对象相关的一些公用方法，比较零散
 */
export class GeomUtil {
    /**
     * 判断线条依次连接
     * @param curves
     * @param tol
     */
    public static curvesConnected<VectorType extends Vec>(
        curves: Curve<VectorType>[],
        tol: number = Tol.LENGTH,
    ): boolean {
        for (let index = 0; index < curves.length - 1; index++) {
            const curve = curves[index];
            const nxtCurve = curves[index + 1];
            if (!curve.getEndPt().equals(nxtCurve.getStartPt(), tol)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 从一堆不重复的点集计算平面
     * @param points
     */
    public static createPlaneFromPts(points: Vec3[]): Vec3 | undefined {
        if (points.length < 3) {
            return undefined;
        }

        // Newell's Method
        const normalVec: number[] = [0, 0, 0];
        for (let index = 0; index < points.length; index++) {
            const nextIndex = (index + 1) % points.length;
            const point = points[index];
            const nextPoint = points[nextIndex];

            normalVec[0] += (point.y - nextPoint.y) * (point.z + nextPoint.z);
            normalVec[1] += (point.z - nextPoint.z) * (point.x + nextPoint.x);
            normalVec[2] += (point.x - nextPoint.x) * (point.y + nextPoint.y);
        }
        let normal = new Vec3(normalVec[0], normalVec[1], normalVec[2]);
        if (!normal.isZero()) {
            normal = normal.normalized();
        }

        const pt0 = points[0];
        if (normal.equals(new Vec3(0, 0, 0))) {
            // 依次从三个点计算平面
            const v0 = points[1].subtracted(pt0).normalized();

            for (let i = 2; i < points.length; i++) {
                const v1 = points[i].subtracted(pt0).normalized();
                const n = v0.cross(v1).normalized();
                if (!n.equals(new Vec3(0, 0, 0))) {
                    normal = n;
                    break;
                }
            }
        }

        if (!normal.equals(new Vec3(0, 0, 0))) {
            return normal;
        }
        return undefined;
    }

    public static splitCurveByPoints(
        curve: Curve2 | Curve3,
        pts: (Vec2 | Vec3)[],
        tol: number = Tol.NUMBER,
    ): (Curve2 | Curve3)[] {
        const splitParams: number[] = [];
        for (const pt of pts) {
            if (!pt.equals(curve.getStartPt() as types.IXYZ) && !pt.equals(curve.getEndPt() as types.IXYZ)) {
                const param = curve.getParamAt(pt);
                splitParams.push(param);
            }
        }
        return curve.split(splitParams, tol);
    }
}