import { Surface } from '../../geometry/surface';
import { Plane } from '../../geometry/plane';
import { Cylinder } from '../../geometry/cylinder';
import { Vec3 } from '../../base/vec3';
import { Vec2 } from '../../base/vec2';
import { PeriodInterval } from '../../base/period_inverval';



/**
 * 点到三维曲线的距离
 */
export class PtToSurfDistance {
    /**
     * 点到三维曲面的距离，目前支持无限大平面、无限大圆柱面
     * 结果为有向距离，点在法线同侧为正，在反向为负
     * @param point 任一点
     * @param curve  面
     * @param footPoint [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(point: Vec3, surface: Surface, footPoint?: Vec3): number {
        if (surface instanceof Plane) {
            return PtToSurfDistance._PtToPlaneDistance(point, surface, footPoint);
        }
        if (surface instanceof Cylinder) {
            return PtToSurfDistance._PtToCylinderDistance(point, surface, footPoint);
        }

        const uv = surface.getUVAt(point);
        const footPt = surface.getPtAt(uv);
        const norm = surface.getNormAt(uv);
        const dist = footPt.distanceTo(point);
        if (footPoint) {
            footPoint.copy(footPt);
        }
        if (norm.dot(point.subtracted(footPt).normalize()) < 0) {
            return -dist;
        }
        return dist;
    }

    private static _PtToPlaneDistance(point: Vec3, plane: Plane, footPoint?: Vec3): number {
        const originToPoint = new Vec3(plane.getOrigin(), point);
        const norm = plane.getNorm();
        const d = originToPoint.dot(norm);
        if (footPoint) {
            const foot = point.subtracted(plane.getNorm().multiply(d));
            footPoint.copy(foot);
        }
        return d;
    }

    private static _PtToCylinderDistance(point: Vec3, cylinder: Cylinder, footPoint?: Vec3): number {
        const lp = cylinder.getCoord().getLocalPtAt(point);
        const tmpx = lp.x / cylinder.getA();
        const tmpy = lp.y / cylinder.getB();
        const u = Math.atan2(tmpy, tmpx);
        const uv = new Vec2(PeriodInterval.RegularizeParam(u), lp.z);
        const footPt = cylinder.getPtAt(uv);
        const dist = footPt.distanceTo(point);

        if (footPoint) {
            footPoint.copy(footPt);
        }
        if (tmpx * tmpx + tmpy * tmpy < 1) {
            return -dist;
        }
        return dist;
    }
}

