import { CONST } from '../type_define/const';
import { Curve2 } from './curve2';
import { types } from '../type_define/i_types';
import { Vec2 } from '../base/vec2';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { PeriodInterval } from '../base/period_inverval';
import { registerGeo } from '../loader/register_geo';
import { Util } from '../util/util';
import { Tol } from '../base/tol';
import { Coord2 } from '../base/coord2';
import { MathAssert } from '../util/assert';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { IArc } from '../type_define/i_geometry';
import { Matrix3 } from '../base/matrix3';
import { Box2 } from '../base/box2';
import { LinearSystem } from '../solve_equations/linear_system';
import { NurbsCurve2 } from './nurbs_curve2';



export enum ArcType {
    HalfArc = 0,
    SmallArc = -1,
    BigArc = 1,
}

// 创建整圆：使用起点，中点，终点
function makeCircleByThreePoints(
    point1: types.IXY,
    point2: types.IXY,
    point3: types.IXY,
) {
    const a1 = point1.x - point2.x;
    const b1 = point1.y - point2.y;
    const c1 = (point1.x * point1.x - point2.x * point2.x + point1.y * point1.y - point2.y * point2.y) / 2;
    const a2 = point3.x - point2.x;
    const b2 = point3.y - point2.y;
    const c2 = (point3.x * point3.x - point2.x * point2.x + point3.y * point3.y - point2.y * point2.y) / 2;
    const divisor = a1 * b2 - a2 * b1;
    if (Util.isNearlyEqual(divisor, 0)) {
        return undefined;
    }
    const center = new Vec2((c1 * b2 - c2 * b1) / divisor, (a1 * c2 - a2 * c1) / divisor);
    const radius = center.distanceTo(point1);
    return { center, radius };
}

/**
 * 二维圆弧
 * range.min [0, 2PI), range.length [0 ~ 2PI]；
 * Arc2 有顺逆时针之分，参数变化可参看 reverse() 函数
 * @example 对于某 Arc2，其局部坐标系 { origin = (0, 0), dx = (1, 0) } 、半径 a = b = 1 ，参数域上 0、PI / 2、PI、3/2 PI 的点：
 * 当其为逆时针时（isCCW = true)，对应为 (1, 0), (0, 1), (-1, 0), (0, -1)
 * 当其为顺时针时（isCCW = false)，对应为 (1, 0), (0, -1), (-1, 0), (0, 1)
 */
@registerGeo
export class Arc2 extends Curve2 implements IArc<Vec2> {
    /**
     * 创建一条圆弧：使用圆心，半径，起始角，顺逆时针标记
     * @param center
     * @param radius
     * @param startAngle
     * @param endAngle
     * @param isCCW
     */
    public static makeArcByStartEndAngles(
        center: types.IXY,
        radius: number,
        startAngle: number,
        endAngle: number,
        isCCW: boolean,
    ): Arc2 {
        let st: number;
        let ed: number;
        if (isCCW) {
            st = startAngle;
            ed = endAngle;
        } else {
            st = -startAngle;
            ed = -endAngle;
        }

        st = PeriodInterval.RegularizeParam(st);
        ed = PeriodInterval.RegularizeParam(ed - st) + st;

        if (Util.isNearlyEqual(st, ed) && !Util.isNearlyEqual(startAngle, endAngle)) {
            ed = st + CONST.PI2;
        }
        return new Arc2(new Coord2(center, Vec2.X()), radius, radius, isCCW, [st, ed]);
    }

    /**
     * 创建圆弧：使用起点，圆弧上一点，终点
     * @param startPoint
     * @param refPoint
     * @param endPoint
     */
    public static makeArcByThreePoints(
        startPoint: types.IXY,
        refPoint: types.IXY,
        endPoint: types.IXY,
    ): Arc2 | undefined {
        const circle = makeCircleByThreePoints(startPoint, refPoint, endPoint);
        if (!circle) {
            return undefined;
        }

        const { center, radius } = circle;

        const midToStart = new Vec2(startPoint).subtract(refPoint);
        const midToEnd = new Vec2(endPoint).subtract(refPoint);
        const ccw = midToEnd.cross(midToStart) > 0;

        const startVec = new Vec2(startPoint).subtract(center);
        const startAngle = Math.atan2(startVec.y, startVec.x);
        const endVec = new Vec2(endPoint).subtract(center);
        const endAngle = Math.atan2(endVec.y, endVec.x);

        return Arc2.makeArcByStartEndAngles(center, radius, startAngle, endAngle, ccw);
    }

    /**
     * 创建圆弧：使用圆心，起点，终点，顺逆时针标记
     * @param center
     * @param startPoint
     * @param endPoint
     * @param isCCW
     */
    public static makeArcByStartEndPoints(
        center: types.IXY,
        startPoint: types.IXY,
        endPoint: types.IXY,
        isCCW: boolean,
    ): Arc2 {
        const vStart = new Vec2(startPoint).subtract(center);
        const vEnd = new Vec2(endPoint).subtract(center);
        const startAngle = Math.atan2(vStart.y, vStart.x);
        let endAngle = Math.atan2(vEnd.y, vEnd.x);

        if (Util.isNearlyEqual(startAngle, endAngle)) endAngle += CONST.PI2;

        return Arc2.makeArcByStartEndAngles(
            center,
            new Vec2(center).distanceTo(startPoint),
            startAngle,
            endAngle,
            isCCW,
        );
    }

    /**
     * 创建椭圆弧：圆心，长轴端点，短轴参考点，起始点，终止点
     * 短轴参考点会影响结果的顺逆时针方向
     * @param center
     * @param aPoint
     * @param bPoint
     * @param startPoint
     * @param endPoint
     * @param tol
     */
    public static makeEllipseByFivePoints(
        center: types.IXY,
        aPoint: types.IXY,
        bPoint: types.IXY,
        startPoint: types.IXY,
        endPoint: types.IXY,
        tol: Tol = new Tol(),
    ): Arc2 | undefined {
        const da = new Vec2(aPoint).subtract(center);
        const db = new Vec2(bPoint).subtract(center);
        const a = da.getLength();
        let b = db.getLength();
        if (tol.isLengthZero(a) || tol.isLengthZero(b) || tol.areParralel(da, db)) {
            return undefined;
        }

        db.subtract(da.multiplied(db.dot(da) / a / a));
        b = db.getLength();
        const ccwSign = da.cross(db) > 0 ? 1 : -1;
        const coord = new Coord2(center, da);
        const stLp = coord.getLocalPtAt(startPoint);
        const edLp = coord.getLocalPtAt(endPoint);
        const stAngle = Math.atan2(stLp.y / b, stLp.x / a) * ccwSign;
        const edAngle = tol.areNear(startPoint, endPoint)
            ? stAngle + CONST.PI2
            : Math.atan2(edLp.y / b, edLp.x / a) * ccwSign;

        return new Arc2(coord, a, b, ccwSign > 0, [stAngle, edAngle]);
    }

    /**
     * 创建椭圆弧：圆心，以及椭圆上的四个点。首末点的位置决定参数域
     * @param center
     * @param points 四个点的x和y的坐标的绝对值不能完全相等，也就是不能在轴对称位置
     * @param clockSign 默认为逆时针
     */
    public static makeEllipseByCenterAndThreePoints(
        center: types.IXY,
        points: types.IXY[],
        clockSign = 1,
    ): Arc2 | undefined {
        if (points.length !== 3) {
            return undefined;
        }

        const localCoord = new Coord2(center, Vec2.X());
        const localPts = points.map(_p => localCoord.getLocalPtAt(_p));

        // 方程为 Ax^2 + B xy + C y^2 = F = 1，解出ABC
        const matA: number[][] = [];
        for (const pt of localPts) {
            matA.push([pt.x * pt.x, pt.x * pt.y, pt.y * pt.y]);
        }
        const matB = [1, 1, 1];
        const solve = LinearSystem.execute(matA, matB);
        if (!solve) {
            return undefined;
        }

        // 由ABCF构造椭圆
        const F = 1;
        const [A, B, C] = solve;
        const theta = 0.5 * Math.atan(B / (A - C));
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const ellipUDir = Vec2.X().multiplied(cosTheta).added(Vec2.Y().multiplied(sinTheta));
        const newCoord = new Coord2(center, ellipUDir);

        // A*x^2 + C*y^2 - F = 0
        const newA = A * cosTheta * cosTheta + C * sinTheta * sinTheta + B * cosTheta * sinTheta; // 平面与柱面平行的时候A = 0
        const newB = C * cosTheta * cosTheta + A * sinTheta * sinTheta - B * cosTheta * sinTheta;
        const a = Math.sqrt(F / newA);
        const b = Math.sqrt(F / newB);

        const stAngle = Math.atan2(localPts[0].y / b, localPts[0].x / a) * clockSign;
        const edAngle = localPts[0].equals(localPts[2])
            ? stAngle + CONST.PI2
            : Math.atan2(localPts[2].y / b, localPts[2].x / a) * clockSign;

        return new Arc2(newCoord, a, b, clockSign > 0, [stAngle, edAngle]);
    }

    public static makeEllipseByFiveArcPoints(points: types.IXY[], clockSign = 1): Arc2 | undefined {
        if (points.length !== 5) {
            return undefined;
        }

        // 方程为 Ax^2 + B xy + C y^2  + Dx + Ey = F = 1，解出ABCDE
        const matA: number[][] = [];
        for (const pt of points) {
            matA.push([pt.x * pt.x, pt.x * pt.y, pt.y * pt.y, pt.x, pt.y]);
        }
        const matB = [1, 1, 1, 1, 1];
        const solve = LinearSystem.execute(matA, matB);
        if (!solve) {
            return undefined;
        }

        // 由ABCF构造椭圆
        const F = 1;
        const [A, B, C, D, E] = solve;
        const theta = 0.5 * Math.atan(B / (A - C));
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const ellipUDir = Vec2.X().multiplied(cosTheta).added(Vec2.Y().multiplied(sinTheta));
        const center = new Vec2(-D / 2, -E / 2);
        const newCoord = new Coord2(center, ellipUDir);

        // A*x^2 + C*y^2 - F = 0
        const newA = A * cosTheta * cosTheta + C * sinTheta * sinTheta + B * cosTheta * sinTheta; // 平面与柱面平行的时候A = 0
        const newB = C * cosTheta * cosTheta + A * sinTheta * sinTheta - B * cosTheta * sinTheta;
        const a = Math.sqrt(F / newA);
        const b = Math.sqrt(F / newB);

        const stVect = new Vec2(points[0].x - center.x, points[0].y - center.y);
        const stAngle = Math.atan2(stVect.y / b, stVect.x / a) * clockSign;
        const endVect = new Vec2(points[4].x - center.x, points[4].y - center.y);
        const edAngle = stVect.equals(endVect)
            ? stAngle + CONST.PI2
            : Math.atan2(endVect.y / b, endVect.x / a) * clockSign;

        return new Arc2(newCoord, a, b, clockSign > 0, [stAngle, edAngle]);
    }

    protected _range: PeriodInterval = new PeriodInterval(0, CONST.PI2);

    private _a = 1;

    private _b = 1;

    private _coord = Coord2.XOY(); // 局部坐标系

    private _clockSign: 1 | -1 = 1; // 是否为逆时针旋转

    constructor();

    /**
     * 构造椭圆弧，参数周期会自动调整至参数域 [0, 4PI)
     * @param coord 局部坐标系，圆心在坐标系原点，x、y轴为椭圆的a、b轴
     * @param a x方向半轴长
     * @param b y方向半轴长
     * @param isCCW 是否为逆时针方向
     * @param range 参数域
     */
    constructor(coord: Coord2, a: number, b: number, isCCW: boolean, range?: types.IInterval);

    constructor(coord?: Coord2, a?: number, b?: number, isCCW?: boolean, range?: types.IInterval) {
        super();
        if (a !== undefined && b !== undefined && coord && isCCW !== undefined) {
            this._a = a;
            this._b = b;
            this._coord = coord.clone();
            this._clockSign = isCCW ? 1 : -1;
            this._range = range ? new PeriodInterval(range[0], range[1]) : new PeriodInterval(0, CONST.PI2);
        }
    }

    /**
     * 获取 a 轴长度
     */
    public getA(): number {
        return this._a;
    }

    /**
     * 设置 a 轴长度
     */
    public setA(v: number) {
        this._a = v;
    }

    /**
     * 获取 b 轴长度
     */
    public getB(): number {
        return this._b;
    }

    /**
     * 设置 b 轴长度
     */
    public setB(v: number) {
        this._b = v;
    }

    /**
     * 获取当前坐标系
     */
    public getCoord(): Coord2 {
        return this._coord;
    }

    /**
     * 设置当前坐标系
     */
    public setCoord(v: Coord2) {
        this._coord = v.clone();
    }

    /**
     * 获取参数范围
     */
    public getRange(): PeriodInterval {
        return this._range;
    }

    public getCenter(): Vec2 {
        return this._coord.getOrigin();
    }

    /**
     * 获取平均半径长度
     */
    public getRadius(): number {
        this._assertCircle();
        return (this._a + this._b) / 2;
    }

    /**
     * 逆时针的标记，true --> 逆时针，false --> 顺时针
     */
    public isCCW(): boolean {
        return this._clockSign > 0;
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec2 {
        const x = this._a * Math.cos(t);
        const y = this._b * Math.sin(t) * this._clockSign;
        return this._coord.getWorldPtAt({ x, y });
    }

    /**
     * 获取某参数对应的点，在圆上的角度，参考方向（1, 0）
     * @param t
     */
    public getAngleFromParam(t: number): number {
        return this._clockSign * t;
    }

    /**
     * 获取圆弧的起始角度
     */
    public getStartAngle(): number {
        return this.getAngleFromParam(this.getStartParam());
    }

    /**
     * 获取圆弧的终止角度
     */
    public getEndAngle(): number {
        return this.getAngleFromParam(this.getEndParam());
    }

    /**
     * 获取圆弧的类型，半圆弧->(0)，优弧->(1)，劣弧->(-1)
     */
    public getArcType(): ArcType {
        const angleRange = this.getRange().getLength();
        if (Util.isNearlyEqual(angleRange, CONST.PI)) {
            return ArcType.HalfArc;
        }
        if (Util.isNearlyBigger(angleRange, CONST.PI)) {
            return ArcType.BigArc;
        }
        return ArcType.SmallArc;
    }

    public IsInRangeInner(pt: Vec2, startpt: Vec2, endpt: Vec2) {
        if (startpt.sqDistanceTo(endpt) < Tol.LENGTH_2) {
            return true;
        }

        const centerPt = this.getCenter();
        const sv = startpt.subtracted(centerPt).normalize();
        const ev = endpt.subtracted(centerPt).normalize();

        let dStoEAngle: number;
        let vTo: Vec2;
        if (this._clockSign === 1) {
            dStoEAngle = sv.angleTo(ev);
            vTo = sv;
        } else {
            dStoEAngle = ev.angleTo(sv);
            vTo = ev;
        }

        const v = pt.subtracted(centerPt).normalize();
        const dAngle = vTo.angleTo(v);
        if (dAngle < dStoEAngle) {
            return true; // 如果v在起始向量和终止向量之间
        }

        return false;
    }

    public getBBox(rRange?: Interval): Box2 {
        const dRotCos = this.getCoord().getDx().x;
        const dRotSin = this.getCoord().getDx().y;
        // 世界坐标系下，椭圆与x轴的交点：(a * cost * dRotCos + b *  sint * dRotSin, a * cost * dRotSin + b *  sint * dRotCos)
        // x就是a * cost * dRotCos + b *  sint * dRotSin，化简 a*dRotCos * cost + b*dRotSin * sint
        // 将a*dRotCos和b*dRotSin结合在一起看作是 r * cosx和 r * sinx得到 r * cosx * cost + r * sinx * sint = r * cos(x - t)
        // 得到x最大值为r，当t = x或者t = x - CONST.PI时取最大值。而x与a*dRotCos和b*dRotSin有关
        const tmp11 = this._a * dRotCos;
        const tmp12 = this._b * dRotSin;
        let dAngX1 = Math.atan2(tmp12, -tmp11);
        if (dAngX1 < 0.0) {
            dAngX1 += CONST.PI2;
        }
        let dAngX2 = dAngX1 + CONST.PI;
        if (dAngX2 > CONST.PI2) {
            dAngX2 -= CONST.PI2;
        }

        const tmp21 = this._a * dRotSin;
        const tmp22 = this._b * dRotCos;
        let dAngY1 = Math.atan2(tmp22, tmp21);
        if (dAngY1 < 0.0) {
            dAngY1 += CONST.PI2;
        }
        let dAngY2 = dAngY1 + CONST.PI;
        if (dAngY2 > CONST.PI2) {
            dAngY2 -= CONST.PI2;
        }

        // 计算极值点
        const centerPt = this.getCenter();
        const maxPts: Vec2[] = [];
        const angles = [dAngX1, dAngX2, dAngY1, dAngY2];
        for (const angle of angles) {
            const dSin = Math.sin(angle);
            const dCos = Math.cos(angle);
            const pt1 = new Vec2(tmp11 * dCos - tmp12 * dSin, tmp21 * dCos + tmp22 * dSin);
            maxPts.push(pt1.add(centerPt));
        }

        const range = rRange || this.getRange();
        const spt = this.getPtAt(range.min);
        const ept = this.getPtAt(range.max);

        // 起点和终点先作为生成box的备选点
        const box = new Box2([spt, ept]);
        // 判断极值点是否在椭圆上，如果在椭圆上，则也作为生成box的备选点
        for (const pt of maxPts) {
            if (this.IsInRangeInner(pt, spt, ept)) {
                box.expandByPoint(pt);
            }
        }

        return box;
    }

    /**
     *  获取某点对应的参数，返回值值域为 [range.Min, range.Min + PI2)
     */
    public getParamAt(point2d: types.IXY, lengthEps = Tol.LENGTH): number {
        const point = this._coord.getLocalPtAt(point2d);
        const ra = point.x / this._a;
        const rb = point.y / this._b;
        const t = Math.atan2(rb, ra) * this._clockSign;

        if (Util.isNearlyEqual(this._a, this._b, lengthEps)) {
            return this._range.getRegularParam(t);
        }

        const paramEps = lengthEps / (this._a + this._b);

        // 点在曲线上，不用迭代，可以直接反求参数
        const tmp = ra * ra + rb * rb;
        if (Math.abs(tmp - 1) <= paramEps) {
            const coord = this._coord;
            const angle = coord.getDx().angleTo(new Vec2(point2d).subtract(coord.getOrigin()).normalize());
            const arcT0 = Math.atan2(Math.sin(angle) / this.getB(), Math.cos(angle) / this.getA());
            const arcT = this.isCCW() ? arcT0 : CONST.PI2 - arcT0;
            return this._range.getRegularParam(arcT);
        }

        // 圆外
        if (tmp > 1) {
            return this._range.getRegularParam(this.getFootByIterate(point2d, t, paramEps)!);
        }

        // const t1 = point.x >= 0 ? 0 : CONST.PI;
        // const t2 = point.y >= 0 ? CONST.PI_2 : CONST.PI2;
        // const param1 = this.getProjectedParamNearParam(point2d, t1, paramEps);
        // const param2 = this.getProjectedParamNearParam(point2d, t2, paramEps);
        // const d1 = this.getPtAt(param1);
        // const d2 = this.getPtAt(param2);

        // if (d1 < d2) {
        //     return param1;
        // }

        // 圆内
        let param1: number;
        let param2: number | undefined;

        if (this._a > this._b) {
            if (point.y > -lengthEps) {
                param1 = this.getFootByIterate(point2d, CONST.PI_2 * this._clockSign, paramEps)!;

                if (point.y < lengthEps && Math.abs(Math.sin(param1)) > paramEps) {
                    param2 = -param1;
                }
            } else {
                param1 = this.getFootByIterate(point2d, -CONST.PI_2 * this._clockSign, paramEps)!;
            }
        } else {

            if (point.x > -lengthEps) {
                param1 = this.getFootByIterate(point2d, 0, paramEps)!;

                if (point.x < lengthEps && Math.abs(Math.cos(param1)) > paramEps) {
                    param2 = CONST.PI - param1;
                }
            } else {
                param1 = this.getFootByIterate(point2d, CONST.PI, paramEps)!;
            }
        }

        param1 = this._range.getRegularParam(param1);

        if (param2 === undefined || this._range.containsPt(param1)) return param1;

        param2 = this._range.getRegularParam(param2);

        if (this._range.containsPt(param2)) return param2;

        return param1;
    }

    /**
     * 获取某点在曲线上的投影点参数集，返回值值域为 [range.Min, range.Min + PI2)
     */
    public getAllFootParams(point: types.IXY, lengthEps = Tol.LENGTH): number[] {
        if (this.isEqualAB()) return [this.getParamAt(point)];

        // const point = this._coord.getLocalPtAt(point2d);
        const paramEps = lengthEps / (this._a + this._b);
        // const ra = point.x / this._a;
        // const rb = point.y / this._b;
        const params: number[] = [];

        // if (ra * ra + rb * rb > 1 - paramEps) {
        //     const t = Math.atan2(rb, ra);
        //     params.push(this.getProjectedParamNearParam(point2d, t, paramEps));
        //     params.push(this.getProjectedParamNearParam(point2d, t + CONST.PI, paramEps));
        // } else {
        params.push(this.getFootByIterate(point, 0, paramEps)!);
        params.push(this.getFootByIterate(point, CONST.PI_2, paramEps)!);
        params.push(this.getFootByIterate(point, CONST.PI, paramEps)!);
        params.push(this.getFootByIterate(point, CONST.PI_2 * 3, paramEps)!);
        // }

        for (let i = 0; i < params.length; i++) {
            params[i] = PeriodInterval.RegularizeParam(params[i]);
        }

        const rets = Util.getUniqueOnes(params, (a, b) => {
            const dp = PeriodInterval.RegularizeParam(a - b);
            return dp < paramEps || dp > CONST.PI2 - paramEps;
        });

        // 再验证，可能存在局部最小值，然非垂足点
        for (let i = 0; i < rets.length;) {
            const t = rets[i];
            const dp = this.getPtAt(t).subtract(point);
            const dpLen = dp.getLength();
            if (dpLen < lengthEps) {
                i++;
                continue;
            }
            dp.multiply(1 / dpLen);
            const dir = this.getTangentAt(t);
            if (Math.abs(dp.dot(dir)) < lengthEps) {
                i++;
            } else {
                rets.splice(i, 1);
            }
        }
        return rets.map(_ => this._range.getRegularParam(_));
    }

    /**
     * 获取圆弧上，两点之间的参数域范围，沿着参数增加的方向
     * @param startPt
     * @param endPt
     */
    public getParamRangeAt(startPt: types.IXY, endPt: types.IXY): PeriodInterval {
        const param1 = this.getParamAt(startPt);
        const param2 = this.getParamAt(endPt);
        return new PeriodInterval(param1, param2);
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec2 {
        const dx = -this._a * Math.sin(t);
        const dy = this._b * Math.cos(t) * this._clockSign;
        return this._coord.getWorldVectorAt({ x: dx, y: dy }).normalize();
    }

    /**
     * 获取range参数域的切线锥
     */
    // public getTangentCone(range?: Interval, bApprox: boolean = true): TangentCone {
    //     const rRange = range || this._range;
    //     const rCone = new TangentCone(Vec3.O(), 0);
    //     const dDAngle = rRange.getLength();
    //     if (Util.isNearlyBiggerOrEqual(dDAngle, CONST.PI, Tol.ANGLE)) {
    //         rCone.dir = Vec3.X();
    //         rCone.angle = CONST.PI;
    //     } else {
    //         const minVt = this.getTangentAt(rRange.min);
    //         const maxVt = this.getTangentAt(rRange.max);
    //         // minVt.normalize();
    //         // maxVt.normalize();

    //         let dAngle = 0.0;
    //         let vt: Vec3;
    //         if (this._clockSign === 1) {
    //             dAngle = minVt.angleTo(maxVt);
    //             vt = minVt;
    //         } else {
    //             dAngle = maxVt.angleTo(minVt);
    //             vt = maxVt;
    //         }
    //         vt.rotate(Vec3.O(), dAngle / 2.0);
    //         rCone.dir = vt;
    //         rCone.angle = dAngle / 2.0;
    //     }

    //     return rCone;
    // }

    /**
     * 椭圆长短轴是否相等
     */
    public isEqualAB(): boolean {
        return Math.abs(this._a - this._b) < Tol.LENGTH;
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, nth: number): Vec2[] {
        const a = this._a;
        const b = this._b * this._clockSign;

        const cost = Math.cos(t);
        const sint = Math.sin(t);

        const dxs = [cost, -sint, -cost, sint];
        const dys = [sint, cost, -sint, -cost];

        const dvts: Vec2[] = [];
        dvts.push(this.getPtAt(t));

        for (let i = 1; i <= nth; i++) {
            const v = new Vec2(dxs[i % 4] * a, dys[i % 4] * b);
            dvts.push(this._coord.getWorldVectorAt(v));
        }

        return dvts;
    }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        const r = range || this.getRange();

        if (this.isEqualAB()) {
            return this.getRadius() * r.getLength();
        }
        return super.getLength(range);
    }

    /**
     * 判断是否为封闭圆形
     */
    public isClosed(): boolean {
        return Util.isNearlyEqual(this._range.getLength(), CONST.PI2);
    }

    /**
     * 反向
     */
    public reverse(): this {
        this._clockSign = <1 | -1>-this._clockSign;
        this._range = new PeriodInterval(-this._range.max, -this._range.min, CONST.PI2);
        return this;
    }

    /**
     * 将圆弧进行分割，使用参数值。
     * 如果输入参数，不在圆弧范围内，则返回空数组
     * @param params
     * @param tolerance
     */
    public split(params: number[], tolerance?: number): Curve2[] {
        const validParams = params.filter(
            p => this._range.containsPt(p, tolerance) && !this._range.containsPtAtStartOrEnd(p, tolerance),
        );
        if (!validParams.length) {
            return [];
        }
        const ranges = this._range.splited(...validParams);
        return ranges.map(r => new Arc2(this._coord, this._a, this._b, this._clockSign > 0, r.toArray()));
    }

    /**
     * 按给定距离进行偏移，改变自己
     * @param dDist 等距量：>0 = 右侧；<0 = 左侧
     * @returns 是否等距成功：true = 是；false = 否
     * @deprecated 使用 OffsetCurve2.makeByCurve() 来代替
     */
    public offset(dDist: number): boolean {
        this._assertCircle();

        const dr = dDist * this._clockSign;
        if (dr + Math.min(this._a, this._b) < 0) return false;
        this._a += dr;
        this._b += dr;
        return true;
    }

    /**
     * 进行一次放射变换
     * @param m 3x3矩阵，表示2维放射变换，一个二维线性变换加一次平移。
     */
    public transform(m: types.IMatrix3 | types.numberArrs3X3): this {
        const dx = this._coord.getDx();
        const dy = this._coord.getDy();
        const A = dx.multiply(this._a).vecTransform(m);
        const B = dy.multiply(this._b * this._clockSign).vecTransform(m);

        let tdx: Vec2;
        let tdy: Vec2;
        if (A.normalized().isPerpendicular(B.normalized())) {
            tdx = A;
            tdy = B;
        } else {
            const beta = Math.atan2(2 * A.dot(B), A.getSqLength() - B.getSqLength()) * 0.5;
            const sinx = Math.sin(beta);
            const cosx = Math.cos(beta);
            tdx = A.multiplied(cosx).add(B.multiplied(sinx)); // x轴旋转beta角度
            tdy = A.multiplied(-sinx).add(B.multiplied(cosx)); // y轴旋转beta角度
        }

        const getParamAt = (v: Vec2): number => {
            const _x = (v.x * tdx.x + v.y * tdx.y) / tdx.getSqLength();
            const _y = (v.x * tdy.x + v.y * tdy.y) / tdy.getSqLength();
            return Math.atan2(_y, _x);
        };
        const begin = getParamAt(A.multiplied(Math.cos(this._range.min)).add(B.multiplied(Math.sin(this._range.min))));
        this._range = new PeriodInterval(begin, this._range.getLength() + begin);
        this._clockSign = A.cross(B) < 0 ? -1 : 1;
        this._a = tdx.getLength();
        this._b = tdy.getLength();
        this._coord.setOrigin(this._coord.getOrigin().transform(m));
        this._coord.setDx(tdx.normalized());
        return this;
    }

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXY): this {
        this._coord.translate(offset);
        return this;
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     */
    public rotate(angle: number, pivot: types.IXY = { x: 0, y: 0 }): this {
        const matrix = Matrix3.makeRotate(pivot, angle);
        this._coord.transform(matrix);
        return this;
    }

    /**
     * 缩放，改变自己
     * 不支持非等比，只支持等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXY = { x: 0, y: 0 }): this {
        this._a *= factor;
        this._b *= factor;
        const origin = this._coord.getOrigin().subtract(center).multiply(factor).add(center);
        this._coord.setOrigin(origin);
        return this;
    }

    public getDiscreteHintSegmentCount(params = DiscreteParam.NORMAL): number {
        return Math.ceil((this._range.max - this._range.min) / params.tolerance.angleEps + 2);
    }

    /**
     * 离散成点集，使用角度步长
     */
    public discrete(params = DiscreteParam.NORMAL): Vec2[] {
        // n + 2 可以避免离散正圆时的离散扰动
        const n = this.getDiscreteHintSegmentCount(params);
        return DiscreteUtil.discreteCurve2d(this, params.clone({ hintSegmentCount: n }));
    }

    public getType(): EN_GEO_TYPE.ARC_2 {
        return EN_GEO_TYPE.ARC_2;
    }

    /**
     * 拟合成nurbscurve2d
     */
    public toNurbs(degree = 2, lengthEps = Tol.LENGTH) {
        const center = this.getCenter();
        const vectX = this.getCoord().getDx().multiply(this._a);
        const vectY = this.getCoord().getDy().multiply(this._b);
        const ctrlPts = [
            center.added(vectX),
            center.added(vectX).added(vectY),
            center.added(vectY).subtracted(vectX),
            center.subtracted(vectX),
            center.subtracted(vectX).subtracted(vectY),
            center.subtracted(vectY).added(vectX),
            center.added(vectX),
        ];
        const weights = [1, 0.5, 0.5, 1, 0.5, 0.5, 1];
        const konts = [0, 0, 0, 0.25, 0.5, 0.5, 0.75, 1, 1, 1];
        if (this._clockSign < 0) {
            ctrlPts.reverse();
        }
        const nurbs2d = NurbsCurve2.makeByControlPoints(ctrlPts, 2, konts, weights);
        return nurbs2d;
    }

    public clone(): Arc2 {
        const obj = new Arc2(this._coord, this._a, this._b, this._clockSign > 0, this.getRange().toArray());
        obj.userData = this.userData;
        return obj;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBArc2d {
        return {
            ...super.dump(),
            data: [this._a, this._b, this._coord.dump(), this._clockSign, this.getRange().toArray()],
        };
    }

    public load(json: types.IDBArc2d) {
        const { data: [a, b, coord, clockSign, range] } = json;
        this._a = a;
        this._b = b;
        this._coord.load(coord);
        this._clockSign = clockSign;
        this._range = new PeriodInterval(range[0], range[1]);
        return super.load(json);
    }

    /**
     * 获取首尾端点中与点 p 较近的点，返回较近点的参数 param，以及平方距离 sq_dist
     * @param p
     */
    protected _getMinDistanceToStartEndPoints(p: types.IXY): { param: number; sqDist: number } {
        const dSt = this.getStartPt().sqDistanceTo(p);
        const dEd = this.getEndPt().sqDistanceTo(p);
        return dSt < dEd ? { param: this.getStartParam(), sqDist: dSt } : { param: this.getEndParam(), sqDist: dEd };
    }

    private _assertCircle() {
        MathAssert.warn(this.isEqualAB(), '圆弧非正圆，计算结果不精确');
    }
}