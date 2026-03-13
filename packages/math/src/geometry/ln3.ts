import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { Vec3 } from '../base/vec3';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Interval } from '../base/interval';
import { Box3 } from '../base/box3';
import { registerGeo } from '../loader/register_geo';
import { Tol } from '../base/tol';
import { CONST } from '../type_define/const';
import { DiscreteParam } from '../base/discrete_param';
import { ILine } from '../type_define/i_geometry';
import { TangentCone } from '../base/tangent_cone';
import { CurvesColinear } from '../algorithm/overlap/curves_colinear';
import { NurbsCurve3 } from './nurbs_curve3';
import { verb } from '../verb/export_verb';



/**
 * 三维直线
 */
@registerGeo
export class Ln3 extends Curve3 implements ILine<Vec3> {
    protected _origin = Vec3.O();

    // 方向,单位向量
    private _dir: Vec3 = Vec3.X();

    constructor();

    /**
     * 两点构造直线（因需要用开方计算直线方向，较慢）
     * @param startPt 起始点
     * @param endPt 终止点
     */
    constructor(startPt: types.IXYZ, endPt: types.IXYZ);

    /**
     * 点和方向构造直线
     * @param origin 起始点
     * @param dir 方向
     * @param range 参数域
     */
    constructor(origin: types.IXYZ, dir: types.IXYZ, range: types.IInterval);

    constructor(p1?: types.IXYZ, p2?: types.IXYZ, range?: types.IInterval) {
        super();
        if (!range && p1 && p2) {
            this.reset(p1, p2);
            return;
        }
        if (p1 && p2 && range) {
            this._origin = new Vec3(p1);
            this._dir = new Vec3(p2);
            this._dir.normalize();
            this._range = new Interval(range[0], range[1]);
        }
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
    public setOrigin(origin: types.IXYZ) {
        return this._origin.copy(origin);
    }

    /**
     * 获取从起点到终点的向量
     */
    public toVector3() {
        return new Vec3(this.getStartPt(), this.getEndPt());
    }

    /**
     * 转换成无限长直线，返回新对象
     */
    public toInfiniteLine(): Ln3 {
        const infiniteLine = this.clone();
        infiniteLine.setRange(new Interval(-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH));
        return infiniteLine;
    }

    public reset(start: types.IXYZ, end: types.IXYZ) {
        const ab = new Vec3(start, end);
        const len = ab.getLength();

        if (len < Tol.CALCULATE_EPS) {
            // mute for degenerate edges
            // MathAssert.warn(false, 'two points are too near to determine line direction');
            this._dir = Vec3.X();
        } else {
            this._dir = ab.multiply(1 / len);
        }

        this._origin = new Vec3(start);
        this._range = new Interval(0, len);
    }

    /**
     *  方向向量
     */
    public getDirection(): Vec3 {
        return this._dir.clone();
    }

    public setDirection(dir: types.IXYZ) {
        this._dir = new Vec3(dir).normalize();
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
    public isParallelTo(another: Ln3, tol = Tol.ANGLE) {
        return this._dir.isParallel(another._dir, tol);
    }

    /**
     * 是否和另一条直线共线，使用距离容差判断，
     * @deprecated
     * @param another
     * @param torlerance
     */
    public isColinearWith(another: Ln3, eps = Tol.LENGTH) {
        return CurvesColinear.lines(this, another, new Tol(eps));
    }

    /**
     * 是否和另一条直线垂直
     * @param another
     * @param torlerance
     */
    public isPerpendicularTo(another: Ln3, torlerance = Tol.ANGLE) {
        return this._dir.isPerpendicular(another._dir, torlerance);
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec3 {
        return this._dir.multiplied(t).add(this._origin);
    }

    /**
     *  获取某点对应的参数
     */
    public getParamAt(point: types.IXYZ): number {
        const ab = new Vec3(point).subtract(this._origin);
        return ab.dot(this._dir);
    }

    /**
     * 获取离直线段最近的点
     * @param point
     * @param tol
     */
    public getClosestPoint(point: types.IXYZ): Vec3 {
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
    public getAllFootParams(point: Vec3, _lengthEps = Tol.LENGTH): number[] {
        return [this.getParamAt(point)];
    }

    /**
     * 计算距离迭代方法函数：从给定参数出发，迭代求取最近的垂足的点。(二维三维曲线通用)//直线没有迭代，此函数只为了覆盖curve的同名函数
     * @param point 目标点
     * @param t0 迭代的初始参数
     * @param paramEps 参数的迭代终止误差
     */
    public getFootByIterate(point: Vec3, t0?: number): number | undefined {
        const refVec: Vec3 = new Vec3(point).subtract(this._origin);
        return refVec.dot(this._dir);
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec3 {
        return this.getDirection();
    }

    /**
     * 获取range参数域的切线锥
     */
    public getTangentCone(range?: Interval, bApprox: boolean = true): TangentCone {
        const rCone = new TangentCone(this.getDirection(), 0);
        return rCone;
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, n: number): Vec3[] {
        const dvts: Vec3[] = [];
        dvts.push(this.getPtAt(t));

        if (n >= 1) {
            dvts.push(this.getDirection());
        }
        for (let i = 2; i <= n; i++) {
            dvts.push(new Vec3());
        }
        return dvts;
    }

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
     * 获取曲线在完整参数域上的拷贝
     */
    public getInfinitClone(): Ln3 {
        return new Ln3(this._origin, this._dir, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);
    }

    /**
     * 判断Curve3d是否是平面曲线
     * 如果是平面曲线：并且能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；如果不是平面曲线(即空间曲线)，返回false
     */
    public isPlaneCurve3d(angleTol?: number): boolean | Vec3 {
        return true;
    }

    /**
     * 反向
     */
    public reverse(): this {
        this._dir.reverse();
        this._range.set(-this._range.max, -this._range.min);
        return this;
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        this._origin.transform(m);
        this._dir.vecTransform(m);

        const scale = this._dir.getLength();
        this._dir.multiply(1 / scale);
        this._range.multiply(scale);

        return this;
    }

    public split(params: number[], tolerance?: number): Curve3[] {
        const validParams = params.filter(
            p => this._range.containsPt(p, tolerance) && !this._range.containsPtAtStartOrEnd(p, tolerance),
        );
        if (!validParams.length) {
            return [];
        }
        const ranges = this._range.splited(...validParams);
        return ranges.map(r => new Ln3(this.getOrigin(), this.getDirection(), r.toArray()));
    }

    public toVerbNurbs(): verb.geom.NurbsCurve {
        return new verb.geom.Line(this.getStartPt().toArray3(), this.getEndPt().toArray3());
    }

    /**
     * 拟合成nurbscurve3d
     */
    public toNurbs(degree = 1, lengthEps = Tol.LENGTH): NurbsCurve3 {
        const pts = [this.getStartPt()];
        const dt = this._range.getLength() / degree;
        for (let i = 1; i <= degree; i++) {
            const pt = this.getPtAt(i * dt);
            pts.push(pt);
        }

        const nurbs = NurbsCurve3.makeByInterpolationPts(pts, degree);
        return nurbs;
    }

    /**
     * 计算曲线在给定参数区间的包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box3 {
        const useRange = range || this._range;
        return new Box3([this.getPtAt(useRange.min), this.getPtAt(useRange.max)]);
    }

    public getType(): EN_GEO_TYPE.LN_3 {
        return EN_GEO_TYPE.LN_3;
    }

    public clone(): Ln3 {
        return super.clone() as any;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBLine3d {
        return {
            ...super.dump(),
            data: [this._origin.toArray3(), this._dir.toArray3(), [this.getRange().min, this.getRange().max]],
        };
    }

    public load(json: types.IDBLine3d) {
        const { data: [origin, dir, range] } = json;
        this._origin.resetFromArray(origin);
        this._dir.resetFromArray(dir);
        this._range = new Interval(range[0], range[1]);
        return super.load(json);
    }

    public translate(offset: types.IXYZ) {
        this._origin.add(offset);
        return this;
    }
}