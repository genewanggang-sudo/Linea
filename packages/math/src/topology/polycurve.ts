/* eslint-disable no-console */
import { Curve2 } from '../geometry/curve2';
import { types } from '../type_define/i_types';
import { Vec2 } from '../base/vec2';
import { Ln2 } from '../geometry/ln2';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import * as MatrixUtil from '../base/matrix_util';
import { Box2 } from '../base/box2';
import { registerGeo } from '../loader/register_geo';
import { Loader } from '../loader/loader';
import { CurvesPJ } from '../algorithm/pj/curves_pj';
import { CurvesPJType } from '../algorithm/pj/pj_type';
import { Tol } from '../base/tol';
import { LoopArea } from '../algorithm/loop_property/loop-area';
import { LoopCentroid } from '../algorithm/loop_property/loop-centroid';
import { GeomUtil } from '../util/geom_util';
import { DiscreteParam } from '../base/discrete_param';
import { Geometry2d } from '../geometry/geometry2d';



/**
 * @author tiansk
 *   首尾相接且无自交，可以不封闭的曲线序列
 */
@registerGeo
export class PolyCurve extends Geometry2d {
    // 当前序列
    protected _curves: Curve2[] = [];

    /**
     *  由一系列点构造Polyline
     * @param points
     */
    constructor(points?: types.IXY[]);

    /**
     *  由一系列点构造Polyline
     * @param points
     */
    constructor(curves?: Curve2[]);

    /**
     *  由一系列点构造Polyline
     * @param params
     */
    constructor(params?: (types.IXY | Curve2)[]) {
        super();

        if (params && params.length > 0) {
            if (!(params[0] instanceof Curve2)) {
                for (let i = 0; i < params.length - 1; i++) {
                    if (!new Vec2(params[i] as types.IXY).equals(params[(i + 1) % params.length] as types.IXY)) {
                        this.addCurve(new Ln2(params[i] as types.IXY, params[i + 1] as types.IXY));
                    }
                }
            } else {
                params.forEach(p => this.addCurve(p as Curve2));
            }
        }
    }

    /**
     *  向序列中加一条曲线，直接加入，不作合法性检查
     * @param curve 曲线
     * @returns 返回Coedge
     */
    public addCurve(curve: Curve2): Curve2 {
        this._curves.push(curve);
        return curve;
    }

    /**
     *  偏移，偏移后不作合法性检查
     *  @param offsetValue 负值往左偏，正值往右偏
     *  @returns 成功返回true，失败返回false
     */
    public offset(offsetValue: number): boolean {
        this.getAllCurves().forEach(cv => {
            cv.offset(offsetValue);
        });
        this.makeStartEndConnected();

        return true;
    }

    /**
     * 使相邻的coedge起点末点交于一点
     */
    public makeStartEndConnected(connectedHeadTail: boolean = false): this {
        for (let i = 0; i < this._curves.length - 1; ++i) {
            const curCurve = this._curves[i];
            const nextCurve = this._curves[i + 1];
            if (curCurve.getEndPt().equals(nextCurve.getEndPt())) {
                nextCurve.reverse();
            }
        }
        return this;
    }

    /**
     *  向序列中加一条曲线，直接加入，不作合法性检查
     * @param curve 曲线
     * @returns 返回Coedge
     */
    public insertCurve(fromIdx: number, ...curves: Curve2[]) {
        this._curves.splice(fromIdx, 0, ...curves);
    }

    public deleteByArrayIdx(idx: number) {
        return !!this._curves.splice(idx, 1).length;
    }

    /**
     * 返回曲线的拷贝
     */
    public copyAllCurves(): Curve2[] {
        return this._curves.map(cv => {
            return cv.clone();
        });
    }

    /**
     * 获取所有的曲线
     */
    public getAllCurves(): Curve2[] {
        return [...this._curves];
    }

    /**
     *  清空所有的coedge
     */
    public clear() {
        this._curves.splice(0);
    }

    public isEmpty() {
        return !this._curves.length;
    }

    /**
     *  是否是逆时针的环,计算时会自动封闭
     * @returns 逆时针则返回true，否则返回false
     */
    public isAnticlockwise(): boolean {
        return this.calcArea() > 0;
    }

    /**
     *  逆时针变顺时针，顺时针变逆时针
     */
    public reverse(): this {
        for (const coedge of this._curves) {
            coedge.reverse();
        }
        this._curves.reverse();
        return this;
    }

    /**
     *  该coedgelist的面积，计算时会自动封闭
     * @returns 顺时针为面积负，逆时针为正
     */
    public calcArea(): number {
        const { length } = this._curves;
        if (!length) {
            return 0;
        }

        return LoopArea.areaOfLoop(this._curves);
    }

    /**
     *  合法性检查 1.首尾相接  2.无自交
     * @returns 合法返回true，不合法返回false
     */
    public isValid(tol = new Tol()): boolean {
        const { length } = this._curves;

        // 依次连接
        if (!GeomUtil.curvesConnected(this._curves, tol.edgeLengthEps)) {
            return false;
        }

        // 无自交
        for (let i = 0; i < length; i++) {
            const cur1 = this._curves[i];
            for (let j = i + 1; j < length; j++) {
                const cur2 = this._curves[j];
                const posRes = CurvesPJ.execute(cur1, cur2, tol.edgeLengthEps, tol.angleEps);
                if (posRes !== CurvesPJType.INTERSECT_ON && posRes !== CurvesPJType.NOT_INTERSECT) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * 是否只包含直线
     */
    public isOnlyLines() {
        return !this._curves.find(cv => cv.getType() !== EN_GEO_TYPE.LN_2);
    }

    public translate(offset: types.IXY): this {
        this._curves.forEach(cv => cv.translate(offset));
        return this;
    }

    public rotate(angle: number, pivot: types.IXY): this {
        this._curves.forEach(cv => cv.rotate(angle, pivot));
        return this;
    }

    public scale(factor: number, center: types.IXY = Vec2.O()): this {
        this._curves.forEach(cv => cv.scale(factor, center));
        return this;
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3): this {
        this._curves.forEach(cv => cv.transform(m));

        if (MatrixUtil.isMirror(m)) {
            this.reverse();
        }

        return this;
    }

    /**
     * 反向，得到一个新的曲线对象
     */
    public reversed(): PolyCurve {
        return this.clone().reverse();
    }

    /**
     * 矩阵变换，得到变换后的曲线对象
     * @param m
     */
    public transformed(m: types.IMatrix3 | types.numberArrs3X3): PolyCurve {
        return this.clone().transform(m);
    }

    public getBBox(): Box2 {
        const box = new Box2();
        this._curves.forEach(cv => box.union(cv.getBBox()));
        return box;
    }

    /**
     * 提取角点
     */
    public toPath(): Vec2[] {
        const result = this._curves.map(cv => cv.getStartPt());
        result.push(this._curves[this._curves.length - 1].getEndPt());
        return result;
    }

    /**
     * 计算形心坐标
     */
    public getCentroidPoint(): Vec2 {
        const allcurves = this.getAllCurves();
        return LoopCentroid.centroidOfLoop(allcurves);
    }

    // override from Geometry
    public getType(): EN_GEO_TYPE {
        return EN_GEO_TYPE.POLY_CURVE;
    }

    public clone(): PolyCurve {
        const obj = super.clone() as PolyCurve;
        obj._curves.forEach((cv, i) => cv.userData = this._curves[i].userData);
        return obj;
    }

    public dump(): types.IDBPolyCurve {
        return {
            type: this.getType(),
            data: this._curves.map(cv => cv.dump()),
        };
    }

    public load({ data }: types.IDBPolyCurve): this {
        this._curves = data.map(json => Loader.load(json) as any);

        return this;
    }
}