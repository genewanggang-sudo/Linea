import { Plane } from '../../geometry/plane';
import { Curve3 } from '../../geometry/curve3d';
import { Curve2 } from '../../geometry/curve2';
import { SmoothPoly3 } from '../../geometry/smooth_poly3';
import { SmoothPoly2 } from '../../geometry/smooth_poly2';
import { Arc2 } from '../../geometry/arc2d';
import { Coord2 } from '../../base/coord2';
import { Arc3 } from '../../geometry/arc3d';
import { Tol } from '../../base/tol';
import { Ln2 } from '../../geometry/ln2';
import { CONST } from '../../type_define/const';
import { LinearSystem } from '../../solve_equations/linear_system';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { DiscreteUtil } from '../discrete/discrete_util';
import { DiscreteParam } from '../../base/discrete_param';
import { NurbsCurve2 } from '../../geometry/nurbs_curve2';



export class Curve3ProjectToPlane {
    private _plane: Plane;

    private _curve: Curve3;

    private _tol: Tol;

    constructor(curve: Curve3, plane: Plane, tol = Tol.DEFAULT) {
        this._plane = plane;
        this._curve = curve;
        this._tol = tol;
    }

    public execute(): Curve2 | undefined {
        if (this._curve.isLine3d()) {
            const p1 = this._plane.getUVAt(this._curve.getStartPt());
            const p2 = this._plane.getUVAt(this._curve.getEndPt());
            if (p1.equals(p2)) {
                return undefined;
            }
            return new Ln2(p1, p2);
        }

        if (this._curve.isArc3d()) {
            const arc = this._curve as Arc3;
            if (arc.getNormal().isParallel(this._plane.getNorm(), this._tol.angleEps)) {
                const arcCrd = arc.getCoord();
                const coord3 = this._plane.getCoord();
                const dx = coord3.getLocalVectorAt(arcCrd.getDx());
                const o = coord3.getLocalPtAt(arcCrd.getOrigin());
                const coord = new Coord2(o, dx);
                const range = arc.getRange().toArray();
                const isAntiClockwise = arc.getNormal().dot(coord3.getDz()) > 0;
                return new Arc2(coord, arc.getA(), arc.getB(), isAntiClockwise, range);
            }

            const mat = this._plane.getCoord().getWorldToLocalMatrix();
            const localArc = arc.transformed(mat) as Arc3;

            // arc平面与平面垂直
            if (arc.getNormal().isPerpendicular(this._plane.getNorm(), this._tol.angleEps)) {
                // 找xy最大值的t
                const costheta = Math.abs(Vec3.Z().dot(localArc.getCoord().getDx()));
                const sintheta = Math.sqrt(1 - costheta * costheta);
                const angle = Math.atan2(costheta / localArc.getA(), sintheta / localArc.getB());
                // 注意：这样计算的结果不一定正确(椭圆投影末端放大可见有微小差别，见用例_curveToPlane)。理论上需要求极值，但是比较麻烦
                const t = localArc.getCoord().getDy().z >= 0 ? angle : -angle;
                const pt1 = localArc.getPtAt(t);
                const pt2 = localArc.getPtAt(t + CONST.PI);
                const line = new Ln2(pt1, pt2);

                // 处理参数域
                if (!localArc.getRange().containsPt(t)) {
                    const t1 = line.getParamAt(localArc.getStartPt());
                    const t2 = line.getParamAt(localArc.getEndPt());
                    line.setRange(t1 < t2 ? t1 : t2, line.getRange().max);
                }
                if (!localArc.getRange().containsPt(t + CONST.PI)) {
                    const t1 = line.getParamAt(localArc.getStartPt());
                    const t2 = line.getParamAt(localArc.getEndPt());
                    line.setRange(line.getRange().min, t1 > t2 ? t1 : t2);
                }

                return line;
            }

            // arc斜投影到平面
            const center = localArc.getCenter();
            const ptLocal1 = localArc.getPtAt(0).subtract(center);
            const ptLocal2 = localArc.getPtAt(CONST.PI_4).subtract(center);
            const ptLocal3 = localArc.getPtAt(CONST.PI_2).subtract(center);
            // 解方程得到椭圆的参数A * x^2 + B * xy + C * y^2 = 1
            const matA = [
                [ptLocal1.x * ptLocal1.x, ptLocal1.x * ptLocal1.y, ptLocal1.y * ptLocal1.y],
                [ptLocal2.x * ptLocal2.x, ptLocal2.x * ptLocal2.y, ptLocal2.y * ptLocal2.y],
                [ptLocal3.x * ptLocal3.x, ptLocal3.x * ptLocal3.y, ptLocal3.y * ptLocal3.y],
            ];
            const b = [1, 1, 1];
            const res = LinearSystem.execute(matA, b);
            if (res === undefined) {
                return undefined;
            }

            const theta = 0.5 * Math.atan(res[1] / (res[0] - res[2]));
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);

            // A * x^2 + C * y^2 = 1
            const newA = res[0] * cosTheta * cosTheta + res[2] * sinTheta * sinTheta + res[1] * cosTheta * sinTheta;
            const newB = res[2] * cosTheta * cosTheta + res[0] * sinTheta * sinTheta - res[1] * cosTheta * sinTheta;
            const ra = Math.sqrt(1 / newA);
            const rb = Math.sqrt(1 / newB);

            const newCoord2 = new Coord2(center, new Vec2(cosTheta, sinTheta)); // x轴逆时针旋转theta
            const isCCW = localArc.getNormal().dot(Vec3.Z()) > 0;
            const arc2 = new Arc2(newCoord2, ra, rb, isCCW);
            const stParam = arc2.getParamAt(localArc.getStartPt());
            let endParam: number;
            if (Math.sqrt(localArc.getRange().getLength() - CONST.PI2) < this._tol.numberEps) {
                endParam = stParam + CONST.PI2;
            } else {
                endParam = arc2.getParamAt(localArc.getEndPt());
            }
            arc2.setRange(stParam, endParam);
            return arc2;
        }

        if (this._curve instanceof SmoothPoly3) {
            const pt2ds = this._curve.getPoints().map(pt3d => this._plane.getUVAt(pt3d));
            return new SmoothPoly2(pt2ds);
        }

        const polyCvs = DiscreteUtil.discreteCurve3d(this._curve, DiscreteParam.NORMAL);
        const pt2ds = polyCvs.map(pt3d => this._plane.getUVAt(pt3d));
        return NurbsCurve2.makeByInterpolationPts(pt2ds);
    }
}