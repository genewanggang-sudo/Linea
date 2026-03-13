import { CONST } from '../type_define/const';
import { Curve2 } from './curve2';
import { types } from '../type_define/i_types';
import { Vec2 } from '../base/vec2';
import { Box2 } from '../base/box2';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Interval } from '../base/interval';
import { registerGeo } from '../loader/register_geo';
import { Util } from '../util/util';
import { Coord3 } from '../base/coord3';
import { Ln3 } from './ln3';
import { Plane } from './plane';
import { Tol } from '../base/tol';
import { DiscreteParam } from '../base/discrete_param';
import { ILine } from '../type_define/i_geometry';
import { Vec } from '../base/vec';
import { CurvesColinear } from '../algorithm/overlap/curves_colinear';
import { MathError } from '../util/math_error';
import { NurbsCurve2 } from './nurbs_curve2';



/**
 * 二维直线
 */
@registerGeo
export class Ln2 extends Curve2 implements ILine<Vec2> {
    protected _origin = Vec2.O();

    // 方向,单位向量
    private _dir = Vec2.X();

    constructor();

    /**
     * 两点构造直线（因需要用开方计算直线方向，较慢）
     * @param startPt 起始点
     * @param endPt 终止点
     */
    constructor(startPt: types.IXY, endPt: types.IXY);

    /**
     * 点和方向构造直线
     * @param origin 起始点
     * @param dir 方向
     * @param range 参数域
     */
    constructor(origin: types.IXY, dir: types.IXY, range: types.IInterval);

    constructor(p1?: types.IXY, p2?: types.IXY, range?: types.IInterval) {
        super();
        if (!range && p1 && p2) {
            this.reset(p1, p2);
            return;
        }
        if (p1 && p2 && range) {
            this._origin = new Vec2(p1);
            this._dir = new Vec2(p2);
            this._dir.normalize();
            this._range = new Interval(range[0], range[1]);
        }
    }

    /**
     * 获取从起点到终点的向量
     */
    public toVector2() {
        return new Vec2(this.getStartPt(), this.getEndPt());
    }

    public reset(start: types.IXY, end: types.IXY) {
        const ab = new Vec2(start, end);
        const len = ab.getLength();

        if (len < Tol.CALCULATE_EPS) {
            MathError.mutedWarn(false, 'two points are too near to determine line direction');
            this._dir = Vec2.X();
        } else {
            this._dir = ab.multiply(1 / len);
        }

        this._origin = new Vec2(start);
        this._range = new Interval(0, len);
    }

    /**
     * 获取直线的原点（参数为零的点）
     */
    public getOrigin() {
        return this._origin;
    }

    /**
     * 设置直线的原点（参数为零的点）
     */
    public setOrigin(origin: types.IXY) {
        return this._origin.copy(origin);
    }

    /**
     *  获取方向向量
     */
    public getDirection(): Vec2 {
        return this._dir.clone();
    }

    public setDirection(dir: types.IXY) {
        this._dir = new Vec2(dir).normalize();
    }

    /**
     * 获取左侧的法向（为直线方向逆时针转90度）
     */
    public getLeftNormal(): Vec2 {
        const perp = new Vec2(-this._dir.y, this._dir.x).normalize();
        return perp;
    }

    /**
     * 获取右侧的法向（为直线方向顺时针转90度）
     */
    public getRightNormal(): Vec2 {
        return this.getLeftNormal().reverse();
    }

    /**
     * 判断该曲线是否为直线
     * @returns
     */
    public isLineLike(): boolean {
        return true;
    }

    /**
     * 是否和另一条直线平行
     * @param another
     * @param tol
     */
    public isParallelTo(another: Ln2, tol = Tol.ANGLE) {
        return this._dir.isParallel(another._dir, tol);
    }

    /**
     * 是否和另一条直线共线，使用距离容差判断，
     * @deprecated
     * @param another
     * @param torlerance
     */
    public isColinearWith(another: Ln2, eps = Tol.LENGTH) {
        return CurvesColinear.lines(this, another, new Tol(eps));
    }

    /**
     * 是否和另一条直线垂直
     * @param another
     * @param torlerance
     */
    public isPerpendicularTo(another: Ln2, torlerance = Tol.ANGLE) {
        return this._dir.isPerpendicular(another._dir, torlerance);
    }

    /**
     * 判断点在直线的哪一侧。-1:右侧, 1:左侧, 0:直线上.
     * @param point
     * @param tol
     */
    public side(point: types.IXY, tol: number): 1 | 0 | -1 {
        const end = this._origin.added(this._dir);
        const cross = (this._origin.x - point.x) * (end.y - point.y) - (this._origin.y - point.y) * (end.x - point.x);
        if (Util.isNearly0(cross, tol)) {
            return 0;
        }
        return cross > 0 ? 1 : -1;
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec2 {
        return this._dir.multiplied(t).add(this._origin);
    }

    /**
     *  获取某点（点也可以不在直线上）对应的参数t。如果点可以在直线外，则返回点在直线上最近点的参数t
     */
    public getParamAt(point: types.IXY): number {
        const refVec: Vec2 = new Vec2(point).subtract(this._origin);
        return refVec.dot(this._dir);
    }

    /**
     * 获取离直线段最近的点
     * @param point
     * @param tol
     */
    public getClosestPoint(point: types.IXY): Vec2 {
        const t = this.getParamAt(point);
        if (t < this._range.min) {
            return this.getStartPt();
        }
        if (t > this._range.max) {
            return this.getEndPt();
        }
        return this.getPtAt(t);
    }

    /**
     * 获取某点在曲线上的所有垂足点的参数t（直线只有一个垂足点）
     */
    public getAllFootParams(point: Vec2, _lengthEps = Tol.LENGTH): number[] {
        return [this.getParamAt(point)];
    }

    /**
     * 计算距离迭代方法函数：从给定参数出发，迭代求取最近的垂足的点。// 直线没有迭代，此函数只为了覆盖curve的同名函数
     * @param point 目标点
     * @param t0 迭代的初始参数
     * @param paramEps 参数的迭代终止误差
     */
    public getFootByIterate(point: Vec, t0?: number): number | undefined {
        const refVec: Vec2 = new Vec2(point).subtract(this._origin);
        return refVec.dot(this._dir);
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线上的点)、1阶导、2阶导
     */
    public getDerivatives(t: number, n: number): Vec2[] {
        const dvts: Vec2[] = [];
        dvts.push(this.getPtAt(t));

        if (n >= 1) {
            dvts.push(this.getDirection());
        }

        for (let i = 2; i <= n; i++) {
            dvts.push(new Vec2());
        }

        return dvts;
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec2 {
        return this.getDirection();
    }

    /**
     * 获取range参数域的切线锥
     */
    // public getTangentCone(range?: Interval, bApprox: boolean = true): TangentCone {
    //     const rCone = new TangentCone(this.getDirection(), 0);
    //     return rCone;
    // }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        if (range !== undefined) {
            return range.getLength();
        }

        return this._range.getLength();
    }

    /**
     * 反向
     */
    public reverse(): this {
        this._dir.reverse();
        this._range.set(-this._range.max, -this._range.min);
        return this;
    }

    public split(params: number[], tolerance?: number): Curve2[] {
        const validParams = params.filter(
            p => this._range.containsPt(p, tolerance) && !this._range.containsPtAtStartOrEnd(p, tolerance),
        );
        if (!validParams.length) {
            return [];
        }
        const ranges = this._range.splited(...validParams);
        return ranges.map(r => new Ln2(this.getOrigin(), this.getDirection(), r.toArray()));
    }

    /**
     * 拟合成nurbscurve2d
     */
    public toNurbs(degree = 1, lengthEps = Tol.LENGTH): NurbsCurve2 {
        const pts = [this.getStartPt()];
        const dt = this._range.getLength() / degree;
        for (let i = 1; i <= degree; i++) {
            const pt = this.getPtAt(i * dt);
            pts.push(pt);
        }

        const nurbs = NurbsCurve2.makeByInterpolationPts(pts, degree);
        return nurbs;
    }

    /**
     * 转换成三维直线
     */
    public toCurve3d(ccs: Coord3): Ln3 {
        return new Plane(ccs).getCurve3d(this) as Ln3;
    }

    /**
     * 转换成无限长直线，返回新对象
     */
    public toInfiniteLine(): Ln2 {
        const infiniteLine = this.clone();
        infiniteLine.setRange(new Interval(-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH));
        return infiniteLine;
    }

    /**
     *  Curve2
     *  曲线按给定距离进行偏移
     * @param dDist 等距量：>0 = 右侧；<0 = 左侧
     * @returns 是否等距成功：true = 是；false = 否
     * @deprecated 使用 OffsetCurve2.makeByCurve() 来代替
     */
    public offset(dDist: number): boolean {
        const dir = this.getDirection();
        dir.vecRotate(-CONST.PI_2);
        const offset = dir.multiplied(dDist);
        this._origin.add(offset);
        return true;
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3): this {
        this._origin.transform(m);
        this._dir.vecTransform(m);

        const scale = this._dir.getLength();
        if (scale) {
            this._dir.multiply(1 / scale); // scale 可能为 0
        }
        this._range.multiply(scale);

        return this;
    }

    /**
     * 计算包围盒
     */
    public getBBox(range?: Interval): Box2 {
        const useRange = range || this._range;
        return new Box2([this.getPtAt(useRange.min), this.getPtAt(useRange.max)]);
    }

    public getType(): EN_GEO_TYPE.LN_2 {
        return EN_GEO_TYPE.LN_2;
    }

    public clone(): Ln2 {
        return super.clone() as any;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBLine2d {
        return {
            ...super.dump(),
            data: [this._origin.toArray2(), this._dir.toArray2(), this._range.toArray()],
        };
    }

    public load(json: types.IDBLine2d) {
        const { data: [origin, dir, range] } = json;
        this._origin.resetFromArray(origin);
        this._dir.resetFromArray(dir).normalize();
        this._range = new Interval(range[0], range[1]);
        return super.load(json);
    }

    public translate(offset: types.IXY) {
        this._origin.add(offset);
        return this;
    }
}