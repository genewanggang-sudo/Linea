import { types } from '../../type_define/i_types';
import { Tol } from '../../base/tol';
import { Util } from '../../util/util';
import { Vec2 } from '../../base/vec2';
import { Curve2 } from '../../geometry/curve2';
import { Arc2 } from '../../geometry/arc2d';
import { Ln2 } from '../../geometry/ln2';
import { Vec3 } from '../../base/vec3';
import { DiscreteParam } from '../../base/discrete_param';
import { Curve3 } from '../../geometry/curve3d';
import { Coord3 } from '../../base/coord3';



interface ICentroidPoint extends types.IXY {
    area: number;
}

/**
 *
 * 计算二维区域形心
 */
export class LoopCentroid {
    /**
     * 计算有序点所围成的二维区域的形心
     * https://en.wikipedia.org/wiki/Centroid#CITEREFBourke1997
     * @param pts
     * @param tol
     */
    public static centroidOfPoints(pts: types.IXY[], tol: number = Tol.NUMBER): Vec2 {
        let area = 0.0;
        let centroidX = 0.0;
        let centroidY = 0.0;
        const len = pts.length;
        for (let p = len - 1, q = 0; q < len; p = q++) {
            const a = pts[p].x * pts[q].y - pts[q].x * pts[p].y;
            area += a;
            centroidX += (pts[p].x + pts[q].x) * a;
            centroidY += (pts[p].y + pts[q].y) * a;
        }
        if (Util.isNearlyEqual(area, 0.0, tol)) {
            return new Vec2(centroidX, centroidY);
        }

        const temp = 3 * area;
        centroidX /= temp;
        centroidY /= temp;
        return new Vec2(centroidX, centroidY);
    }

    /**
     * 计算二维曲线所围成的区域形心
     * @param loop
     */
    public static centroidOfLoop(loop: Curve2[], areaEps: number = Tol.LENGTH): Vec2 {
        if (!loop.length) {
            return new Vec2();
        }

        // 包含其他曲线
        let area = 0;
        let centroidX = 0.0;
        let centroidY = 0.0;
        const stPt = loop[0].getStartPt();
        const refPt = { x: stPt.x, y: stPt.y };
        for (const crv of loop) {
            const pt = this._integralForCurve2d(crv, refPt);
            centroidX += pt.x;
            centroidY += pt.y;
            area += pt.area;
        }
        if (Math.abs(area) < areaEps) {
            return loop[0].getStartPt();
        }
        centroidX /= area;
        centroidY /= area;
        return new Vec2(centroidX, centroidY).add(refPt);
    }

    public static centroidOfPoint3ds(pts: types.IXYZ[], areaEps: number = Tol.LENGTH): Vec3 {
        return LoopCentroid.centroidInfoOfPoint3ds(pts, areaEps).centroid;
    }

    public static centroidInfoOfPoint3ds(
        pts: types.IXYZ[],
        areaEps: number = Tol.LENGTH,
    ): { centroid: Vec3; area: number; areaNormal: Vec3 } {
        const areaSum = Vec3.O();
        const centroidX = Vec3.O();
        const centroidY = Vec3.O();
        const centroidZ = Vec3.O();

        const add = (i: number, j: number) => {
            const pi = pts[i];
            const pj = pts[j];
            const av = new Vec3(pi).cross(pj);
            areaSum.add(av);
            centroidX.add(av.multiplied(pi.x + pj.x));
            centroidY.add(av.multiplied(pi.y + pj.y));
            centroidZ.add(av.multiplied(pi.z + pj.z));
        };
        add(pts.length - 1, 0);
        for (let i = 1; i < pts.length; i++) {
            add(i - 1, i);
        }

        const area = areaSum.getLength();
        if (area < areaEps) {
            const areaNormal = new Vec3(pts[0], pts[1]).cross(new Vec3(pts[1], pts[2]));
            return { centroid: new Vec3(pts[0]), area: 0, areaNormal };
        }

        const areaNormal = areaSum.multiplied(1 / area);
        const areaCrd = new Coord3(Vec3.O(), areaNormal);

        const sumRatio = areaNormal.multiplied(1 / (area * 3));
        const pSum = new Vec3(centroidX.dot(sumRatio), centroidY.dot(sumRatio), centroidZ.dot(sumRatio));
        const lpSum = areaCrd.getLocalVectorAt(pSum);
        lpSum.z *= 1.5;

        const centroid = areaCrd.getWorldVectorAt(lpSum);
        return { centroid, area: area * 0.5, areaNormal };
    }

    public static centroidOfCurve3ds(
        curves: Curve3[],
        discreteParam = DiscreteParam.HIGH,
        areaEps: number = Tol.LENGTH,
    ): Vec3 {
        return LoopCentroid.centroidInfoOfCurve3ds(curves, discreteParam, areaEps).centroid;
    }

    public static centroidInfoOfCurve3ds(
        curves: Curve3[],
        discreteParam = DiscreteParam.HIGH,
        areaEps: number = Tol.LENGTH,
    ): { centroid: Vec3; area: number; areaNormal: Vec3 } {
        const pts: Vec3[] = [];
        for (const crv of curves) {
            pts.push(...crv.discrete(discreteParam));
        }
        return LoopCentroid.centroidInfoOfPoint3ds(pts, areaEps);
    }

    private static _integralForCurve2d(curve: Curve2, refPT: types.IXY): ICentroidPoint {
        if (curve instanceof Ln2) {
            return this._integralForLine2d(curve.getStartPt(), curve.getEndPt(), refPT);
        }
        if (curve instanceof Arc2) {
            return this._integralForArc2d(curve, refPT);
        }

        const pts = curve.discrete(DiscreteParam.CALCULATE);
        return LoopCentroid._integralForPoints(pts, refPT);
    }

    private static _integralForLine2d(startPt: types.IXY, endPt: types.IXY, refPt: types.IXY): ICentroidPoint {
        const sx = startPt.x - refPt.x;
        const sy = startPt.y - refPt.y;
        const ex = endPt.x - refPt.x;
        const ey = endPt.y - refPt.y;
        const area = (sx * ey - sy * ex) / 2;
        return {
            area,
            x: ((sx + ex) * area) / 3,
            y: ((sy + ey) * area) / 3,
        };
    }

    private static _integralForPoints(points: types.IXY[], refPt: types.IXY): ICentroidPoint {
        let area = 0;
        let x = 0;
        let y = 0;

        for (let i = 1; i < points.length; i++) {
            const pt = this._integralForLine2d(points[i - 1], points[i], refPt);
            x += pt.x;
            y += pt.y;
            area += pt.area;
        }
        return { x, y, area };
    }

    private static _integralForArc2d(arc: Arc2, refPt: types.IXY): ICentroidPoint {
        // 计算扇形重心
        const range = arc.getRange();
        const theta = range.getLength() / 2;
        const a = arc.getA();
        const b = arc.getB();
        const cx = (Math.sin(theta) * 2) / (theta * 3); // 标准扇形重心公式
        const midAngle = range.getMid();
        const clockSign = arc.isCCW() ? 1 : -1;
        const lpX = Math.cos(midAngle) * cx * a;
        const lpY = Math.sin(midAngle) * cx * b * clockSign;
        const pt = arc.getCoord().getWorldPtAt({ x: lpX, y: lpY }).subtract(refPt);
        const arcArea = a * b * theta * (arc.isCCW() ? 1 : -1);

        // 计算其他三角形重心
        const ret = LoopCentroid._integralForPoints([arc.getStartPt(), arc.getCenter(), arc.getEndPt()], refPt);

        // 整合
        ret.x += pt.x * arcArea;
        ret.y += pt.y * arcArea;
        ret.area += arcArea;
        return ret;
    }
}