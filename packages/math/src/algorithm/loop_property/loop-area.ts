import { types } from '../../type_define/i_types';
import { Curve2 } from '../../geometry/curve2';
import { Vec2 } from '../../base/vec2';
import { Arc2 } from '../../geometry/arc2d';
import { Vec3 } from '../../base/vec3';
import { SmoothPoly2 } from '../../geometry/smooth_poly2';
import { DiscreteUtil } from '../discrete/discrete_util';
import { DiscreteParam } from '../../base/discrete_param';
import { Curve3 } from '../../geometry/curve3d';



/**
 *
 * 计算二维区域面积
 */
export class LoopArea {
    /**
     * 计算有序点所围成的二维区域面积
     * http://en.wikipedia.org/wiki/Shoelace_formula
     * @param pts
     */
    public static areaOfPoints(pts: types.IXY[]): number {
        let area = 0.0;
        const len = pts.length;
        for (let p = len - 1, q = 0; q < len; p = q++) {
            area += pts[p].x * pts[q].y - pts[q].x * pts[p].y;
        }
        return area * 0.5;
    }

    /**
     * 计算二维曲线所围成的区域面积
     * https://en.wikipedia.org/wiki/Green%27s_theorem
     * @param loop
     */
    public static areaOfLoop(loop: Curve2[]): number {
        let area = 0.0;
        if (!loop.length) {
            return area;
        }

        // 使用合适的参考点
        let refPt = loop[0].getStartPt().clone();
        let useArcCenter = false;
        for (const curve of loop) {
            if (curve instanceof Arc2) {
                if (!useArcCenter) {
                    refPt = curve.getCenter();
                    useArcCenter = true;
                } else {
                    refPt = refPt.midTo(curve.getCenter());
                }
            }
        }
        for (const curve of loop) {
            area += this._areaOfCurve2d(curve, refPt);
        }
        return area;
    }

    /**
     * 计算有序点列在投影方向围成的区域面积
     * @param pts 三维点序列
     * @param refDir 参考方向向量
     */
    public static areaOfPoint3ds(points: types.IXYZ[], refDir: Vec3): number {
        const areaVec = LoopArea.areaVectorOfPoint3ds(points);
        const norm = refDir.normalized();
        return areaVec.dot(norm);
    }

    /**
     * 计算有序点列的区域面积向量。向量方向为多边形最大投影面积方向，长度为该投影面积
     * @param points
     */
    public static areaVectorOfPoint3ds(points: types.IXYZ[]): Vec3 {
        const sum = new Vec3(points[points.length - 1]).cross(points[0]);

        for (let i = 1; i < points.length; i++) {
            sum.add(new Vec3(points[i - 1]).cross(points[i]));
        }

        return sum.multiply(0.5);
    }

    /**
     * 用离散的方法计算有序曲线组的区域面积向量。向量方向为多边形最大投影面积方向，长度为该投影面积
     * @param curves
     * @param discreteParam
     */
    public static areaVectorOfCurve3ds(curves: Curve3[], discreteParam = DiscreteParam.NORMAL): Vec3 {
        const pts: types.IXYZ[] = [];
        for (const crv of curves) {
            pts.push(...crv.discrete(discreteParam));
        }
        return LoopArea.areaVectorOfPoint3ds(pts);
    }

    private static _areaOfCurve2d(cv: Curve2, refPt: Vec2): number {
        let area = 0.0;
        if (cv.isLine2d()) {
            const startPt = cv.getStartPt().subtracted(refPt);
            const endPt = cv.getEndPt().subtracted(refPt);
            area = 0.5 * startPt.cross(endPt);
        } else if (cv.isArc2d()) {
            const arc = cv as Arc2;
            const sector = arc.getA() * arc.getB() * arc.getRange().getLength() * (arc.isCCW() ? 1 : -1) * 0.5;
            const centerTriangle = LoopArea._areaOfTriangle(arc.getStartPt(), arc.getEndPt(), arc.getCenter());
            const refTriangle = LoopArea._areaOfTriangle(arc.getStartPt(), arc.getEndPt(), refPt);
            area = sector - centerTriangle + refTriangle;
        } else if (cv.isSmoothPoly2d()) {
            (cv as SmoothPoly2).getSegments().forEach(l => {
                area += this._areaOfCurve2d(l, refPt);
            });
        } else {
            const polyCvs = DiscreteUtil.discreteCurve2d(cv, DiscreteParam.NORMAL);
            for (let i = 1; i < polyCvs.length; i++) {
                const vect1 = polyCvs[i - 1].subtracted(refPt);
                const vect2 = polyCvs[i].subtracted(refPt);
                area += 0.5 * vect1.cross(vect2);
            }
        }
        return area;
    }

    /**
     * 返回三角形的面积
     * 注意：p1 p2 会被用作临时变量而发生变化
     * @param p1
     * @param p2
     * @param p3
     */
    private static _areaOfTriangle(p1: Vec2, p2: Vec2, p3: Vec2): number {
        return p1.subtract(p3).cross(p2.subtract(p3)) * 0.5;
    }
}