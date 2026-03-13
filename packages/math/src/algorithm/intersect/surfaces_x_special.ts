import { Coord2 } from '../../base/coord2';
import { Coord3 } from '../../base/coord3';
import { Interval } from '../../base/interval';
import { Matrix4 } from '../../base/matrix4';
import { Tol } from '../../base/tol';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Arc2 } from '../../geometry/arc2d';
import { Arc3 } from '../../geometry/arc3d';
import { Cylinder } from '../../geometry/cylinder';
import { Ln2 } from '../../geometry/ln2';
import { Ln3 } from '../../geometry/ln3';
import { Plane } from '../../geometry/plane';
import { Surface } from '../../geometry/surface';
import { CONST } from '../../type_define/const';
import { Util } from '../../util/util';
import { D } from '../calc_d';
import { CurvesX } from './curves_x';
import { CurveSurfaceX } from './curve_surface_x';
import { ISurfacesXInfo } from './x_info';
import { MathAssert } from '../../util/assert';



/**
 * （内部使用）几何法和解析法计算得到交线，限于一些特殊情况求交
 * @param surface 曲面
 * @param surface 曲面
 * @returns 交线可能不止一条，故返回交线的数组
 */
export class SurfacesXSpecial {
    public static execute(
        surface1: Surface,
        surface2: Surface,
        tol: Tol = new Tol(),
    ): ISurfacesXInfo[] | undefined {
        if (surface1.isPlane() && surface2.isPlane()) {
            const plane1 = surface1 as Plane;
            const plane2 = surface2 as Plane;
            return this._planePlane(plane1, plane2, tol);
        }

        if (surface1.isPlane() && surface2.isCylinder()) {
            const plane = surface1 as Plane;
            const cylinder = surface2 as Cylinder;
            return this._planeCylinder(plane, cylinder, tol);
        }
        if (surface2.isPlane() && surface1.isCylinder()) {
            const plane = surface2 as Plane;
            const cylinder = surface1 as Cylinder;
            return this._planeCylinder(plane, cylinder, tol);
        }

        if (surface1.isCylinder() && surface2.isCylinder()) {
            const cylinder1 = surface1 as Cylinder;
            const cylinder2 = surface2 as Cylinder;
            return this._cylinderCylinder(cylinder1, cylinder2, tol);
        }

        return undefined;
    }

    private static _planePlane(plane1: Plane, plane2: Plane, tol: Tol): ISurfacesXInfo[] {
        if (plane1.getNorm().isParallel(plane2.getNorm(), tol.angleEps)) {
            return [];
        }

        // 直线的方向向量
        const p1norm = plane1.getNorm();
        const p2norm = plane2.getNorm();
        const lineDir = p1norm.cross(p2norm).normalize();
        const towardDir = lineDir.cross(p1norm); // no need of nomalize();
        const dp = plane2.getOrigin().subtract(plane1.getOrigin());
        const t = dp.dot(p2norm) / p2norm.dot(towardDir);
        const origin = towardDir.multiplied(t).add(plane1.getOrigin());
        const intLine = new Ln3(origin, lineDir, Interval.infinitArray());

        const intRes: ISurfacesXInfo = { curve: intLine };
        return [intRes];
    }

    private static _planeCylinder(plane: Plane, cylinder: Cylinder, tol: Tol): ISurfacesXInfo[] {
        if (!cylinder.isEqualAB()) {
            return this._planeEllipseCylinder(plane, cylinder, tol);
        }

        const planeNormal = plane.getNorm();
        const planePos = plane.getOrigin();
        const cylinderAxis = cylinder.getCenterAxis();
        const cylPos = cylinder.getCoord().getOrigin();
        const radius = cylinder.getA();

        const cosTheta = cylinderAxis.dot(planeNormal);
        const signDisPosToPlane = D.ptToSurfSigned(cylPos, plane);
        const prjOnPlane = cylPos.subtracted(planeNormal.multiplied(signDisPosToPlane));
        const disPosToPlane = Math.abs(signDisPosToPlane);

        // special case 1
        if (planeNormal.isPerpendicular(cylinderAxis, Tol.ANGLE)) {
            if (disPosToPlane - radius > Tol.LENGTH) {
                return []; // 相离
            }

            if (Math.abs(disPosToPlane - radius) <= Tol.LENGTH) {
                const newLine = new Ln3(prjOnPlane, cylinderAxis, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);
                const intRes: ISurfacesXInfo = { curve: newLine };
                return [intRes]; // 相切
            }

            const refDir = cylinderAxis.cross(planeNormal);
            const halfChord = Math.sqrt(radius * radius - disPosToPlane * disPosToPlane);
            const pos1 = prjOnPlane.subtracted(refDir.multiplied(halfChord));
            const pos2 = prjOnPlane.added(refDir.multiplied(halfChord));
            const newLine1 = new Ln3(pos1, cylinderAxis, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);
            const newLine2 = new Ln3(pos2, cylinderAxis, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);
            const intRes1: ISurfacesXInfo = { curve: newLine1 };
            const intRes2: ISurfacesXInfo = { curve: newLine2 };
            return [intRes1, intRes2]; // 相交两直线
        }

        // special case 2
        if (planeNormal.isParallel(cylinderAxis, Tol.ANGLE)) {
            const coord = new Coord3(prjOnPlane, cylinderAxis);
            const newArc = new Arc3(coord, radius, radius, [0, CONST.PI2]);
            const intRes: ISurfacesXInfo = { curve: newArc };
            return [intRes];
        }

        // normal case
        const mid = planePos.subtracted(cylPos).dot(planeNormal);
        const newCenter = cylPos.added(cylinderAxis.multiplied(mid / cosTheta));
        const uDir = cylinderAxis.subtracted(planeNormal.multiplied(cosTheta));
        const vDir = planeNormal.cross(uDir);
        const coord = new Coord3(newCenter, uDir, vDir);
        const newEllipse = new Arc3(coord, radius / Math.abs(cosTheta), radius, [0, CONST.PI2]);

        const intRes: ISurfacesXInfo = { curve: newEllipse };
        return [intRes];
    }

    // 椭圆柱面与plane求交: 强行解析计算结果, 椭圆方程Ax^2 + Bxy + Cy^2 + Dx + Ey + F = 0
    private static _planeEllipseCylinder(
        plane: Plane,
        ellipCylinder: Cylinder,
        tol: Tol,
    ): ISurfacesXInfo[] {
        const clyCoord = ellipCylinder.getCoord();
        const a = ellipCylinder.getA();
        const b = ellipCylinder.getB();

        // special case 1 :平面与柱面垂直
        if (plane.getNorm().isParallel(ellipCylinder.getCenterAxis())) {
            const axis = new Ln3(clyCoord.getOrigin(), clyCoord.getDz(), [
                -CONST.MODEL_MAX_LENGTH,
                CONST.MODEL_MAX_LENGTH,
            ]);
            const newOrigin = CurveSurfaceX.allPoints(axis, plane);
            const newCoord = clyCoord.clone();
            newCoord.setOrigin(newOrigin[0]);
            const newEllip = new Arc3(newCoord, a, b, [0, CONST.PI2]);

            const intEllip: ISurfacesXInfo = { curve: newEllip };
            return [intEllip];
        }

        const transform: Matrix4 = clyCoord.getLocalToWorldMatrix(); // 为了方便计算，将柱面变换到坐标原点
        const invTransform = transform.inversed();
        if (!invTransform) {
            MathAssert.warn('transform matrix error!');
            return [];
        }

        const transPlane = plane.clone().transform(invTransform);

        // special case 2：平面与柱面平行，变换到二维椭圆与直线计算交点
        const tplaneNormal = transPlane.getNorm();
        if (tplaneNormal.isPerpendicular(new Vec3(0, 0, 1))) {
            const coord2 = new Coord2(new Vec2(0, 0), new Vec2(1, 0));
            const newEllip2d = new Arc2(coord2, a, b, true, [0, CONST.PI2]);
            const tplanePos = transPlane.getOrigin();

            const newLine2d = new Ln2(
                new Vec2(tplanePos.x, tplanePos.y),
                new Vec2(-tplaneNormal.y, tplaneNormal.x),
                [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH],
            ); // plane在xoy平面内的投影，是一条直线，方向是tplaneNormal旋转90度

            const intersectRes = CurvesX.curve2ds(newLine2d, newEllip2d);
            if (intersectRes.length === 0) {
                return [];
            }

            const intRes: ISurfacesXInfo[] = [];
            for (const tmpInt of intersectRes) {
                const pt = tmpInt.point;
                const newLine = new Ln3(new Vec3(pt.x, pt.y, 0), new Vec3(0, 0, 1), [
                    -CONST.MODEL_MAX_LENGTH,
                    CONST.MODEL_MAX_LENGTH,
                ]);
                newLine.transform(transform);

                const intLine: ISurfacesXInfo = { curve: newLine };
                intRes.push(intLine);
            }

            return intRes;
        }

        // normal case：平面与柱面不平行
        const axisLine = new Ln3(new Vec3(0, 0, 0), new Vec3(0, 0, 1), [-10000000, 10000000]); // 由于近似平行的时候，计算交点newOrig的参数可能达到1e7，因此参数域要设大一点
        const newOrig = CurveSurfaceX.allPoints(axisLine, transPlane);

        transPlane.getCoord().setOrigin(newOrig[0]); // 由于平面原点与计算结果无关，为了方便计算，保证平面不变，移动原点位置
        const tPlaneDirU = transPlane.getUDir();
        const tPlaneDirV = transPlane.getVDir();

        // Ax^2 + Bxy + Cy^2 - F = 0
        const squra = a * a;
        const squrb = b * b;
        const A = squrb * tPlaneDirU.x * tPlaneDirU.x + squra * tPlaneDirU.y * tPlaneDirU.y;
        const B = 2 * (squrb * tPlaneDirU.x * tPlaneDirV.x + squra * tPlaneDirU.y * tPlaneDirV.y);
        const C = squrb * tPlaneDirV.x * tPlaneDirV.x + squra * tPlaneDirV.y * tPlaneDirV.y;
        const F = squra * squrb;

        const theta = 0.5 * Math.atan(B / (A - C));
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const ellipUDir = tPlaneDirU.multiplied(cosTheta).added(tPlaneDirV.multiplied(sinTheta));
        const normal = transPlane.getNorm();
        const ellipVDir = normal.cross(ellipUDir);
        const newCoord = new Coord3(newOrig[0], ellipUDir, ellipVDir);

        // A*x^2 + C*y^2 - F = 0
        const newA = A * cosTheta * cosTheta + C * sinTheta * sinTheta + B * cosTheta * sinTheta; // 平面与柱面平行的时候A = 0
        const newB = C * cosTheta * cosTheta + A * sinTheta * sinTheta - B * cosTheta * sinTheta;
        const aLen = Math.sqrt(F / newA);
        const bLen = Math.sqrt(F / newB);

        const newEllipse = new Arc3(newCoord, aLen, bLen, [0, CONST.PI2]);
        newEllipse.transform(transform);

        const intRes: ISurfacesXInfo = { curve: newEllipse };
        return [intRes];
    }

    private static _cylinderCylinder(
        cyl1: Cylinder,
        cyl2: Cylinder,
        tol: Tol,
    ): ISurfacesXInfo[] | undefined {
        const axis1 = cyl1.getCenterAxis();
        const axis2 = cyl2.getCenterAxis();

        if (axis1.isParallel(axis2)) {
            if (cyl1.isEqualAB() && cyl2.isEqualAB()) {
                const radius1 = cyl1.getA();
                const radius2 = cyl2.getA();
                const orgPt1 = cyl1.getCoord().getOrigin();
                const orgPt2 = cyl2.getCoord().getOrigin();
                const vect = orgPt2.subtracted(orgPt1);
                const cosAlpha = axis1.dot(vect.normalized());
                const axisSqrDis = vect.getSqLength() * (1 - cosAlpha * cosAlpha);
                const radiusSqr = (radius1 + radius2) * (radius1 + radius2);
                // case 1: no intersect
                if (Util.isNearlyBigger(axisSqrDis, radiusSqr, Tol.LENGTH * Tol.LENGTH)) {
                    return [];
                }

                if (Util.isNearlyEqual(axisSqrDis, radiusSqr, Tol.LENGTH * Tol.LENGTH)) {
                    // case 2: intersect one line
                    const originPt = orgPt1.added(orgPt2).multiplied(0.5);
                    const newLine = new Ln3(originPt, axis1, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);

                    const intRes: ISurfacesXInfo = { curve: newLine };
                    return [intRes];
                }
            }

            // case 3: intersect two lines // case 4: ellipse cylinder
            const cly1Coord = cyl1.getCoord();
            const coord2d1 = Coord2.XOY();
            const arc2d1 = new Arc2(coord2d1, cyl1.getA(), cyl1.getB(), true, [0, CONST.PI2]);

            const orgPt2 = cyl2.getCoord().getOrigin();
            const ptLocal = cly1Coord.getLocalPtAt(orgPt2);
            const coord2d2 = coord2d1.clone();
            coord2d2.setOrigin(ptLocal.toXY());
            const arc2d2 = new Arc2(coord2d2, cyl2.getA(), cyl2.getB(), true, [0, CONST.PI2]);

            const intArc = CurvesX.curve2ds(arc2d1, arc2d2);
            if (intArc.length === 0) {
                return [];
            }

            const intRes: ISurfacesXInfo[] = [];
            for (const it of intArc) {
                const intPt: Vec3 = cly1Coord.getWorldPtAt(it.point);
                const newLine = new Ln3(intPt, axis1, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);

                const res: ISurfacesXInfo = { curve: newLine };
                intRes.push(res);
            }

            return intRes;
        }

        const madLen = CONST.MODEL_MAX_LENGTH;
        const axisLine1 = new Ln3(cyl1.getCoord().getOrigin(), axis1, [-madLen, madLen]);
        const axisLine2 = new Ln3(cyl2.getCoord().getOrigin(), axis2, [-madLen, madLen]);
        const intersectAxis = CurvesX.curve3ds(axisLine1, axisLine2);
        if (intersectAxis.length > 0) {
            if (cyl1.isEqualAB() && cyl2.isEqualAB()) {
                const radius1 = cyl1.getA();
                const radius2 = cyl2.getA();
                if (Util.isNearlyEqual(radius1, radius2)) {
                    // two ellipese
                    const centerPt = intersectAxis[0].point;
                    const newDirU1 = axis1.added(axis2).normalize();
                    const newDirU2 = axis1.subtracted(axis2).normalize();
                    const newDirV = newDirU1.cross(newDirU2);

                    const cosAlpha = newDirU1.dot(axis1);
                    const sinAlpha = Math.sqrt(1 - cosAlpha * cosAlpha);
                    const newA1 = radius1 / sinAlpha;
                    const newA2 = radius1 / cosAlpha;
                    const newCoord1 = new Coord3(centerPt, newDirU1, newDirV);
                    const newEllip1 = new Arc3(newCoord1, newA1, radius1, [0, CONST.PI2]);
                    const newCoord2 = new Coord3(centerPt, newDirU2, newDirV);
                    const newEllip2 = new Arc3(newCoord2, newA2, radius2, [0, CONST.PI2]);

                    const res1: ISurfacesXInfo = { curve: newEllip1 };
                    const res2: ISurfacesXInfo = { curve: newEllip2 };
                    return [res1, res2];
                }
            }
        }

        return undefined;
    }
}

