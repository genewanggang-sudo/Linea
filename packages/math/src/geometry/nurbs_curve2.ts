import { Curve2 } from './curve2';
import { Interval } from '../base/interval';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { DiscreteParam } from '../base/discrete_param';
import { NurbsCurve3 } from './nurbs_curve3';
import { INurbsCurve } from '../type_define/i_geometry';
import { Vec2 } from '../base/vec2';
import { Tol } from '../base/tol';
import { Box2 } from '../base/box2';
import { Matrix4 } from '../base/matrix4';
// import { Vec3 } from '../index_math';



/**
 * Nurbs曲线
 */
@registerGeo
export class NurbsCurve2 extends Curve2 implements INurbsCurve<Vec2> {
    /**
     * 构造Bezier曲线，degree 为控制点数-1，最大度数为 8.
     */
    public static makeBezier(controlPoints: types.IXY[], weights?: number[]): NurbsCurve2 {
        const pts = this._fiterCoPoint(controlPoints);
        const degree = pts.length - 1;
        const knots = NurbsCurve3.getBezierKnots(degree);
        return NurbsCurve2.makeByControlPoints(pts, degree, knots, weights, [0, 1]);
    }

    /**
     * 通过控制点和次数构造准均匀nurbs curve
     * 曲线默认为三次
     */
    public static makeByControlPoints(
        controlPoints: types.IXY[],
        degree: number = 3,
        knots?: number[],
        weights?: number[],
        range?: types.IInterval,
    ): NurbsCurve2 {
        const pt3s = controlPoints.map(pt => {
            return { x: pt.x, y: pt.y, z: 0 };
        });
        const crv3 = NurbsCurve3.makeByControlPoints(pt3s, degree, knots, weights, range);
        return new NurbsCurve2(crv3);
    }

    /**
     * 插值构造nurbs curve
     * 曲线将插值经过所有传入的点，曲线默认为三次
     */
    public static makeByInterpolationPts(
        points: types.IXY[],
        degree: number = 3,
        closeSmooth: boolean = false,
    ): NurbsCurve2 {
        const pt3s = points.map(pt => {
            return { x: pt.x, y: pt.y, z: 0 };
        });
        return new NurbsCurve2(NurbsCurve3.makeByInterpolationPts(pt3s, degree, closeSmooth));
    }

    /**
     * 过滤重复点，只过滤连续的重复点
     * @param pts 输入点列
     */
    private static _fiterCoPoint(pts: types.IXY[]): types.IXY[] {
        const newPts: types.IXY[] = [];
        newPts.push(pts[0]);
        for (let i = 1; i < pts.length; ++i) {
            if (Tol.DEFAULT.areNear(pts[i], pts[i - 1])) continue;
            newPts.push(pts[i]);
        }
        return newPts;
    }

    // verbNurbs对象
    private _nurbsCurve3d: NurbsCurve3;

    constructor(nurbsCurve3d?: NurbsCurve3) {
        super();
        if (nurbsCurve3d) {
            this._nurbsCurve3d = nurbsCurve3d;
            this._range = nurbsCurve3d.getRange();
        }
    }

    public getDegree(): number {
        return this._nurbsCurve3d.getDegree();
    }

    public getWeights(): number[] {
        return this._nurbsCurve3d.getWeights();
    }

    public getKnots(): number[] {
        return this._nurbsCurve3d.getKnots();
    }

    public getControlPoints(): Vec2[] {
        return this._nurbsCurve3d.getControlPoints().map(pt3 => new Vec2(pt3));
    }

    public getDomain(): Interval {
        return this._nurbsCurve3d.getDomain();
    }

    public isBezier(): boolean {
        return this._nurbsCurve3d.isBezier();
    }

    /**
     * 获取所有垂足点
     * @param point 求取垂足的点
     * @param _lengthEps 容差
     * @returns
     */
    public getAllFootParams(point: types.IXY, _lengthEps = Tol.LENGTH): number[] {
        return this._nurbsCurve3d.getAllFootParams({ x: point.x, y: point.y, z: 0 }, _lengthEps);
    }

    /**
     * 获取参数值对应的曲线上的点
     * @param t 参数(弧长)
     */
    public getPtAt(t: number): Vec2 {
        return new Vec2(this._nurbsCurve3d.getPtAt(t));
    }

    /**
     * 获取点在曲线上的参数
     * @param point
     */
    public getParamAt(point: types.IXY): number {
        return this._nurbsCurve3d.getParamAt({ x: point.x, y: point.y, z: 0 });
    }

    /**
     * 获取参数值对应的曲线上的点处的切向量
     * @param t
     * @returns 单位切向量
     */
    public getTangentAt(t: number): Vec2 {
        return new Vec2(this._nurbsCurve3d.getTangentAt(t));
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、1阶导
     */
    public getDerivatives(t: number, nth: number): Vec2[] {
        return this._nurbsCurve3d.getDerivatives(t, nth).map(p => new Vec2(p));
    }

    /**
     * 获取曲线上的弧长等分点，返回的第一个和最后一个分别为曲线的起点和终点
     * @param count 等分点数量，数目限制最小为3
     * @returns 单位切向量
     */
    public getEqualDiversionPts(count: number = 3): Vec2[] {
        return this._nurbsCurve3d.getEqualDiversionPts(count).map(pt3 => new Vec2(pt3));
    }

    /**
     * 在参数 t 处将 Nurbs 曲线切分为两部分
     * @param t 切分点处的参数
     * @param useRange 若真，则根据原参数域进行同步切分；若假，则切分得到的曲线以定义域作为参数域
     * @return 返回切分得到的参数曲线，并会根据原参数域设置新的参数域。若参数有误则返回空数组
     */
    public splitCurve(t: number, useRange = true): NurbsCurve2[] {
        const crvs = this._nurbsCurve3d.splitCurve(t, useRange);
        return crvs.map(crv => new NurbsCurve2(crv));
    }

    public reverse(): this {
        this._nurbsCurve3d.reverse();
        return this;
    }

    public offset(dist: number): boolean {
        return false; // not supported yet
    }

    public clone(): NurbsCurve2 {
        const obj = new NurbsCurve2(this._nurbsCurve3d.clone());
        obj.userData = this.userData;
        return obj;
    }

    public getRange(): Interval {
        return this._nurbsCurve3d.getRange();
    }

    public setRange(a: number | Interval, max?: number): this {
        if (a instanceof Interval) {
            this._nurbsCurve3d.setRange(a);
        } else {
            this._nurbsCurve3d.setRange(a, max!);
        }
        return this;
    }

    /**
     * 获取曲线长度
     */
    public getLength(range?: Interval): number {
        return this._nurbsCurve3d.getLength(range);
    }

    /**
     * 获取曲线包围盒（控制多边形的包围盒）
     */
    public getBBox(range?: Interval): Box2 {
        const box3 = this._nurbsCurve3d.getBBox(range);
        return new Box2([box3.min, box3.max]);
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3): this {
        const m4 = Matrix4.makeByMatrix3(m);
        this._nurbsCurve3d.transform(m4);
        return this;
    }

    /**
     * 离散曲线
     * @param tolerance  相邻三点组成的三角形面积的最大值
     * @returns 离散点
     */
    public discrete(params = DiscreteParam.NORMAL): Vec2[] {
        return this._nurbsCurve3d.discrete(params).map(p => new Vec2(p));
    }

    public getType(): EN_GEO_TYPE {
        return EN_GEO_TYPE.NURBS_CURVE_2D;
    }

    public dump(): types.IDBNurbsCurve2d {
        const ret = this._nurbsCurve3d.dump() as any as types.IDBNurbsCurve2d;
        ret.type = EN_GEO_TYPE.NURBS_CURVE_2D;
        for (const data of ret.data[1]) data.pop();
        return ret;
    }

    public load(json: types.IDBNurbsCurve2d) {
        const ctrlPoints = json.data[1];
        for (const arr of ctrlPoints) {
            arr.push(0);
        }
        if (!this._nurbsCurve3d) this._nurbsCurve3d = new NurbsCurve3();
        this._nurbsCurve3d.load(json as any as types.IDBNurbsCurve3d);
        this._range = this._nurbsCurve3d.getRange();
        return this;
    }
}