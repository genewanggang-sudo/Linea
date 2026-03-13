import { CONST } from '../type_define/const';
import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Vec3 } from '../base/vec3';
import { Circle3d } from './circle3d';
import { Coord3 } from '../base/coord3';
import { PeriodInterval } from '../base/period_inverval';
import { MathAssert } from '../util/assert';
import { Util } from '../util/util';
import { Interval } from '../base/interval';
import { Tol } from '../base/tol';
import { DiscreteParam } from '../base/discrete_param';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { Coord2 } from '../base/coord2';
import { Arc2 } from './arc2d';
import { IArc } from '../type_define/i_geometry';
import { TangentCone } from '../base/tangent_cone';
import { Matrix4 } from '../base/matrix4';
import { NurbsCurve3 } from './nurbs_curve3';
import { verb } from '../verb/export_verb';



/**
 *
 * 三维圆弧
 * Arc3 均为逆时针方向，若需逆转方向，需翻转坐标轴
 * range.min in [0, 2PI), range.length in [0 ~ 2PI]；
 */
@registerGeo
export class Arc3 extends Curve3 implements IArc<Vec3> {
    /**
     * 创建圆弧：使用起点，圆弧上一点，终点
     * @param startPoint
     * @param refPoint
     * @param endPoint
     */
    public static makeArcByThreePoints(
        startPoint: types.IXYZ,
        refPoint: types.IXYZ,
        endPoint: types.IXYZ,
    ): Arc3 | undefined {
        const circle = Circle3d.makeCircleByThreePoints(startPoint, refPoint, endPoint);
        if (!circle) {
            return undefined;
        }

        const ret = new Arc3(circle.getCCS(), circle.getRadius(), circle.getRadius(), [0, CONST.PI2]);
        const sv = new Vec3(startPoint);
        const sParam = PeriodInterval.RegularizeParam(ret.getParamAt(startPoint));
        let dp = PeriodInterval.RegularizeParam(ret.getParamAt(endPoint) - sParam);

        if (sv.equals(endPoint)) {
            if (sv.equals(refPoint)) {
                dp = 0;
            } else {
                dp = CONST.PI2;
            }
        }
        return ret.setRange(sParam, sParam + dp);
    }

    /**
     * 创建圆弧：使用圆心，半径， 法向，起点，终点，顺逆时针标记
     * @param center
     * @param radius
     * @param normal
     * @param startPoint
     * @param endPoint
     * @param isCCW
     */
    public static makeArcByStartEndPoints(
        center: types.IXYZ,
        radius: number,
        normal: types.IXYZ,
        startPoint: types.IXYZ,
        endPoint: types.IXYZ,
        isCCW: boolean,
    ): Arc3 {
        const sv = new Vec3(startPoint);
        const dx = sv.subtracted(center).normalize();
        const dy = new Vec3(normal)
            .cross(dx)
            .normalize()
            .multiply(isCCW ? 1 : -1);
        const coord = new Coord3(center, dx, dy);
        const ret = new Arc3(coord, radius, radius, [0, CONST.PI2]);

        const startAngle = ret.getParamAt(startPoint);
        let endAngle = ret.getParamAt(endPoint);
        if (Util.isNearlyEqual(startAngle, endAngle)) {
            endAngle += CONST.PI2;
        }
        ret.setRange(startAngle, endAngle);
        return ret;
    }

    /**
     * 创建圆弧：使用整圆，起点，终点，顺逆时针标记
     * @param circle
     * @param startPoint
     * @param endPoint
     * @param isCCW
     */
    public static makeArcByCircleAndPts(
        circle: Circle3d,
        startPoint: types.IXYZ,
        endPoint: types.IXYZ,
        isCCW: boolean,
    ): Arc3 {
        const newCircle = circle.clone();

        let startAngle = newCircle.getParamAt(startPoint);
        let endAngle = newCircle.getParamAt(endPoint);
        const coord = newCircle.getCCS();

        if (!isCCW) {
            coord.setXYDirs(coord.getDx(), coord.getDy().multiply(-1));
            startAngle = -startAngle;
            endAngle = -endAngle;
        }
        if (Util.isNearlyEqual(startAngle, endAngle)) {
            endAngle = startAngle + CONST.PI2;
        }
        return new Arc3(coord, circle.getRadius(), circle.getRadius(), [startAngle, endAngle]);
    }

    /**
     * 创建椭圆弧：圆心，长轴端点，短轴参考点，起始点，终止点
     */
    public static makeEllipseByFivePoints(
        center: types.IXYZ,
        aPoint: types.IXYZ,
        bPoint: types.IXYZ,
        startPoint: types.IXYZ,
        endPoint: types.IXYZ,
        tol: Tol = new Tol(),
    ): Arc3 | undefined {
        const da = new Vec3(aPoint).subtract(center);
        const db = new Vec3(bPoint).subtract(center);
        const a = da.getLength();
        let b = db.getLength();
        if (tol.isLengthZero(a) || tol.isLengthZero(b) || tol.areParralel(da, db)) {
            return undefined;
        }

        db.subtract(da.multiplied(db.dot(da) / a / a));
        b = db.getLength();
        const coord = new Coord3(center, da, db);
        const stLp = coord.getLocalPtAt(startPoint);
        const edLp = coord.getLocalPtAt(endPoint);
        const stAngle = Math.atan2(stLp.y / b, stLp.x / a);
        const edAngle = tol.areNear(startPoint, endPoint) ? stAngle + CONST.PI2 : Math.atan2(edLp.y / b, edLp.x / a);

        return new Arc3(coord, a, b, [stAngle, edAngle]);
    }

    protected _range: PeriodInterval;

    private _a: number;

    private _b: number;

    private _coord: Coord3 = new Coord3();

    constructor();

    /**
     * 构造椭圆弧，参数周期会自动调整至参数域 [0, 4PI)
     * @param coord 局部坐标系，圆心在坐标系原点，x、y轴为椭圆的a、b轴
     * @param a x方向半轴长
     * @param b y方向半轴长
     * @param range 参数域
     */
    constructor(coord: Coord3, a: number, b: number, range?: types.IInterval);

    constructor(coord?: Coord3, a?: number, b?: number, range?: types.IInterval) {
        super();
        if (a !== undefined && b !== undefined && coord) {
            this._a = a;
            this._b = b;
            this._coord = coord.clone();
            this._range = range ? new PeriodInterval(range[0], range[1]) : new PeriodInterval(0, CONST.PI2);
        }
    }

    /**
     * 获取 a 轴长度
     */
    public getA() {
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
    public getCoord(): Coord3 {
        return this._coord;
    }

    /**
     * 设置当前坐标系
     */
    public setCoord(v: Coord3) {
        this._coord = v.clone();
    }

    /**
     * 获取参数范围
     */
    public getRange(): PeriodInterval {
        return this._range;
    }

    /**
     * 获取圆心
     */
    public getCenter(): Vec3 {
        return this._coord.getOrigin();
    }

    /**
     * 右手坐标系中，圆弧的轴线方向
     */
    public getNormal(): Vec3 {
        return this._coord.getDz();
    }

    public getCircle(): Circle3d {
        this._assertCircle();
        return new Circle3d(this._coord, this._a);
    }

    /**
     * 获取平均半径长度
     */
    public getRadius(): number {
        this._assertCircle();
        return (this._a + this._b) / 2;
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec3 {
        const vec = new Vec3(Math.cos(t) * this._a, Math.sin(t) * this._b, 0);
        return this._coord.getWorldPtAt(vec);
    }

    /**
     *  获取某点对应的参数，返回值值域为 [range.Min, range.Min + PI2)
     */
    public getParamAt(point: types.IXYZ, lengthEps = Tol.LENGTH): number {
        const vec = this._coord.getLocalPtAt(point);
        const arc2d = new Arc2(Coord2.XOY(), this._a, this._b, true, this._range.toArray());
        return arc2d.getParamAt(vec, lengthEps);
    }

    /**
     * 是否包含某个点, 即某点是否在该曲线段上
     */
    public containsPt(point: types.IXYZ, lengthEps = Tol.LENGTH): boolean {
        const sqrEps = lengthEps * lengthEps;
        // 1.判断端点的距离
        if (this.getStartPt().sqDistanceTo(point) < sqrEps || this.getEndPt().sqDistanceTo(point) < sqrEps) {
            return true;
        }
        // 2.判断垂直距离
        const param = this.getParamAt(point);
        const d = this.getPtAt(param).sqDistanceTo(point);
        if (d > sqrEps) {
            return false;
        }

        // 3.判断参数域
        const numberEps = (2 * lengthEps) / (this._a + this._b);
        return this._range.containsPt(param, numberEps);
    }

    /**
     * 获取某点在曲线上的投影点参数集，返回值值域为 [range.Min, range.Min + PI2)
     */
    public getAllFootParams(point: types.IXYZ, lengthEps = Tol.LENGTH): number[] {
        if (this.isEqualAB()) return [this.getParamAt(point)];

        const vec = this._coord.getLocalPtAt(point);
        const arc2d = new Arc2(Coord2.XOY(), this._a, this._b, true, this._range.toArray());
        return arc2d.getAllFootParams(vec, lengthEps);
    }

    /**
     * 获取圆弧上，两点之间的参数域范围，沿着参数增加的方向
     * @param startPt
     * @param endPt
     */
    public getParamRangeAt(startPt: types.IXYZ, endPt: types.IXYZ): PeriodInterval {
        const param1 = this.getParamAt(startPt);
        const param2 = this.getParamAt(endPt);
        return new PeriodInterval(param1, param2);
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec3 {
        const p = new Vec3(-this._a * Math.sin(t), this._b * Math.cos(t), 0);
        return this._coord.getWorldVectorAt(p).normalize();
    }

    /**
     * 获取range参数域的切线锥
     */
    public getTangentCone(range?: Interval, bApprox: boolean = true): TangentCone {
        const rRange = range || this._range;
        const rCone = new TangentCone(Vec3.O(), 0);
        const dDAngle = rRange.getLength();
        if (Util.isNearlyBiggerOrEqual(dDAngle, CONST.PI, Tol.ANGLE)) {
            rCone.dir = Vec3.X();
            rCone.angle = CONST.PI;
        } else {
            const minVt = this.getTangentAt(rRange.min);
            const maxVt = this.getTangentAt(rRange.max);
            // minVt.normalize(); // getTangentAt已单位化
            // maxVt.normalize();

            const dAngle = minVt.angleTo(maxVt, this._coord.getDz());
            const vt: Vec3 = minVt;
            vt.vecRotate(this._coord.getDz(), dAngle / 2.0);
            rCone.dir = vt;
            rCone.angle = dAngle / 2.0;
        }

        return rCone;
    }

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
    public getDerivatives(t: number, nth: number): Vec3[] {
        const a = this._a;
        const b = this._b;

        const cost = Math.cos(t);
        const sint = Math.sin(t);

        const dxs = [cost, -sint, -cost, sint];
        const dys = [sint, cost, -sint, -cost];

        const dvts: Vec3[] = [];
        dvts.push(this.getPtAt(t));

        for (let i = 1; i <= nth; i++) {
            const v = new Vec3(dxs[i % 4] * a, dys[i % 4] * b, 0);
            dvts.push(this._coord.getWorldVectorAt(v));
        }

        return dvts;
    }

    /**
     * 判断是否为封闭圆形
     */
    public isClosed(): boolean {
        return this._range.isClosed();
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
     * 反向，改变自己
     */
    public reverse(): this {
        this._range = new PeriodInterval(-this._range.max, -this._range.min);
        this._coord.setXYDirs(this._coord.getDx(), this._coord.getDy().multiply(-1));
        return this;
    }

    public split(params: number[], tolerance?: number): Arc3[] {
        // const eps = tolerance || Tol.LENGTH;
        // const paramTol = (2 * eps) / (this._a + this._b);
        // const validParams = params.filter(
        //     p => this._range.containsPt(p, paramTol) && !this._range.containsPtAtStartOrEnd(p, paramTol),
        // ); // 没什么效果，因为this._range.splited(...validParams)时还是不能成功构造range
        const validParams = params.filter(
            p => this._range.containsPt(p, tolerance) && !this._range.containsPtAtStartOrEnd(p, tolerance),
        );
        if (!validParams.length) {
            return [];
        }
        const ranges = this._range.splited(...validParams);
        return ranges.map(r => new Arc3(this._coord, this._a, this._b, [r.min, r.max]));
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        const A = this._coord.getDx().multiply(this._a).vecTransform(m);
        const B = this._coord.getDy().multiply(this._b).vecTransform(m);
        let tdx: Vec3;
        let tdy: Vec3;
        if (A.normalized().isPerpendicular(B.normalized())) {
            tdx = A; // 不旋转
            tdy = B;
        } else {
            const beta = Math.atan2(2 * A.dot(B), A.getSqLength() - B.getSqLength()) * 0.5;
            const sinx = Math.sin(beta);
            const cosx = Math.cos(beta);
            tdx = A.multiplied(cosx).add(B.multiplied(sinx)); // x轴旋转beta角度
            tdy = A.multiplied(-sinx).add(B.multiplied(cosx)); // y轴旋转beta角度
        }

        const getParamAt = (v: Vec3): number => {
            const _x = (v.x * tdx.x + v.y * tdx.y + v.z * tdx.z) / tdx.getSqLength();
            const _y = (v.x * tdy.x + v.y * tdy.y + v.z * tdy.z) / tdy.getSqLength();
            const t = Math.atan2(_y, _x);
            return t;
        };
        const begin = getParamAt(A.multiplied(Math.cos(this._range.min)).add(B.multiplied(Math.sin(this._range.min))));
        this._range = new PeriodInterval(begin, this._range.getLength() + begin);
        this._coord.setOrigin(this._coord.getOrigin().transform(m));
        this._coord.setDx(tdx.normalized());
        this._coord.setDy(tdy.normalized());
        this._a = tdx.getLength();
        this._b = tdy.getLength();
        return this;
    }

    /**
     * 平移，改变自己
     */
    public translate(offset: types.IXYZ): this {
        this._coord.translate(offset);
        return this;
    }

    /**
     * 绕坐标轴/点的旋转，改变自己
     * @param angle 旋转的角度
     * @param pivot 旋转轴上一点
     * @param axis  绕哪个轴旋转
     */
    public rotate(angle: number, pivot: types.IXYZ, axis: types.IXYZ = { x: 0, y: 0, z: 1 }): this {
        // 默认绕着z轴旋转
        const matrix = Matrix4.makeRotate(pivot, axis, angle);
        this._coord.transform(matrix);
        return this;
    }

    /**
     * 缩放，改变自己
     * 直线支持非等比，其他情况都是等比例缩放
     * @param factor 放大因子
     * @param center 缩放中心
     */
    public scale(factor: number, center: types.IXYZ): this {
        this._a *= factor;
        this._b *= factor;
        const origin = this._coord.getOrigin().subtract(center).multiply(factor).add(center);
        this._coord.setOrigin(origin);
        return this;
    }

    /**
     * 判断Curve3d是否是平面曲线
     * 如果是平面曲线：并且能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；如果不是平面曲线(即空间曲线)，返回false
     */
    public isPlaneCurve3d(angleTol?: number): boolean | Vec3 {
        return this._coord.getDz();
    }

    /**
     * 离散，使用默认的离散配置
     */
    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        return DiscreteUtil.discreteCurve3d(this, params);
    }

    /**
     * 离散，使用角度步长均匀离散
     * @param angle 角度步长
     */
    public discreteBySpan(angle = CONST.APPROX_ARC_MAX): Vec3[] {
        const n = Math.ceil((this._range.max - this._range.min) / angle);
        const step = (this._range.max - this._range.min) / n;
        const pts: Vec3[] = [];
        for (let index = 0; index < n; index++) {
            pts.push(this.getPtAt(this._range.min + index * step));
        }
        pts.push(this.getEndPt());
        return pts;
    }

    public getType(): EN_GEO_TYPE.ARC_3 {
        return EN_GEO_TYPE.ARC_3;
    }

    /**
     * 拟合成nurbscurve3d，4段构成圆，比较具体对称性
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
        const nurbs3d = NurbsCurve3.makeByControlPoints(ctrlPts, 2, konts, weights);
        return nurbs3d;
    }

    public toVerbNurbs(): verb.geom.NurbsCurve {
        return new verb.geom.Arc(
            this.getCenter().toArray3(),
            this.getCoord().getDx().toArray3(),
            this.getCoord().getDy().toArray3(),
            this.getRadius(),
            this.getStartParam(),
            this.getEndParam(),
        );
    }

    public clone(): Arc3 {
        const obj = new Arc3(this._coord, this._a, this._b, this._range.toArray());
        obj.userData = this.userData;
        return obj;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBArc3d {
        return {
            ...super.dump(),
            data: [this._coord.dump(), this._a, this._b, this._range.toArray()],
        };
    }

    public load(json: types.IDBArc3d) {
        const { data: [coord, a, b, range] } = json;
        this._a = a;
        this._b = b;
        this._coord.load(coord);
        this._range = new PeriodInterval(range[0], range[1], CONST.PI2);
        return super.load(json);
    }

    private _assertCircle() {
        MathAssert.warn(this.isEqualAB(), '圆弧非正圆，计算结果不精确');
    }
}