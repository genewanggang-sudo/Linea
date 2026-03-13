import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { Vec3 } from '../base/vec3';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Box3 } from '../base/box3';
import { registerGeo } from '../loader/register_geo';
import { Tol } from '../base/tol';
import { Ln3 } from './ln3';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { Util } from '../util/util';
import { PtToCurve3Distance } from '../algorithm/distance/pt_to_curve3_distance';
import { MathError } from '../util/math_error';
import { geom } from '../verb/verb';



/**
 * 三维多段直线
 * 主要用在拉伸，扫掠算法中，形成光滑的面
 */
@registerGeo
export class SmoothPoly3 extends Curve3 {
    // 连续点数组
    private _pts: Vec3[] = [];

    // 连续点对应的参数
    private _ts: number[] = [];

    // 背后的光滑曲线
    private _curve?: Curve3;

    constructor();

    constructor(pts: types.IXYZ[], refCurve?: Curve3);

    constructor(pts?: types.IXYZ[], refCurve?: Curve3) {
        super();
        if (pts) {
            this._pts = pts.map(pt => new Vec3(pt));
            this._calParams();
        }
        if (refCurve) {
            this._curve = refCurve;
        }
    }

    /**
     * 获取连续点的数组
     */
    public getPoints(): ReadonlyArray<Vec3> {
        return this._pts;
    }

    public toVerbNurbs(range?: Interval | undefined): geom.NurbsCurve {
        throw new Error('Method not implemented.');
    }

    /**
     * 获取连续点对应参数的数组
     */
    public getTs(): ReadonlyArray<number> {
        return this._ts;
    }

    /**
     * 获取背后的光滑曲线
     */
    public getCurve(): Curve3 | undefined {
        return this._curve;
    }

    /**
     * 获取所有的直线段
     */
    public getSegments(): Ln3[] {
        if (this._pts.length < 2) {
            return [];
        }
        const segs: Ln3[] = [];
        for (let index = 1; index < this._pts.length; index++) {
            segs.push(new Ln3(this._pts[index - 1], this._pts[index]));
        }
        return segs;
    }

    /**
     * 获取某参数对应的点
     */
    public getPtAt(t: number): Vec3 {
        const seg: number = this._getSegment(t);
        const localT: number = t - this._ts[seg - 1];
        const segLen = this._ts[seg] - this._ts[seg - 1];
        if (Util.isNearly0(segLen, Tol.LENGTH)) {
            return this._pts[seg];
        }
        return this._pts[seg - 1].interpolated(this._pts[seg], localT / segLen);
    }

    /**
     *  获取某参数对应的点
     */
    public getParamAt(point: types.IXYZ): number {
        if (this._pts.length < 2) {
            return 0;
        }

        const seg0 = new Ln3(this._pts[0], this._pts[1]);
        let minDist = PtToCurve3Distance.simple(point, seg0);

        for (let i = 1; i < this._pts.length; i++) {
            const iLineSeg = new Ln3(this._pts[i - 1], this._pts[i]);
            const dist = PtToCurve3Distance.simple(point, iLineSeg);

            if (dist.distance < minDist.distance) {
                dist.param += this._ts[i - 1];
                minDist = dist;
            }
        }

        return minDist.param;
    }

    /**
     * 获取某参数处的切线
     */
    public getTangentAt(t: number): Vec3 {
        const span = this._getSegment(t);
        return this._pts[span].subtracted(this._pts[span - 1]).normalize();
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, n: number): Vec3[] {
        throw new Error('暂时还没有实现!');
    }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        if (range) return range.getLength();
        return this._range.getLength();
    }

    /**
     * 反向
     */
    public reverse(): this {
        let start: number = 0;
        let end: number = this._pts.length - 1;
        for (; start < end; start++, end--) {
            const temp: Vec3 = this._pts[end];
            this._pts[end] = this._pts[start];
            this._pts[start] = temp;
            const tempT: number = -this._ts[end] + this._ts[this._ts.length - 1];
            this._ts[end] = -this._ts[start] + this._ts[this._ts.length - 1];
            this._ts[start] = tempT;
        }
        if (start === end) {
            this._ts[start] = -this._ts[start] + this._ts[this._ts.length - 1];
        }
        this._range = new Interval(this._ts[0], this._ts[this._ts.length - 1]);
        return this;
    }

    public offset(dDist: number): boolean {
        throw new Error('暂时还没有实现');
    }

    /**
     * 分割SmoothPoly为两段，如果分割点不在直线上，则返回空数组
     * @param param
     * @param tolerance
     */
    public split(params: number[], tolerance?: number): Curve3[] {
        throw new Error('暂时还没有实现');
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        for (let i: number = 0; i < this._pts.length; i++) {
            this._pts[i] = this._pts[i].transform(m);
        }
        this._calParams();

        return this;
    }

    /**
     * 计算曲线在给定参数区间的包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box3 {
        if (this._pts.length === 1) {
            return new Box3(this._pts);
        }

        const bounding = new Box3();

        const getPtInSegment = (t: number, seg: number) => {
            const localT: number = t - this._ts[seg - 1];
            const segLen = this._ts[seg] - this._ts[seg - 1];
            if (Util.isNearly0(segLen, Tol.LENGTH)) {
                return this._pts[seg];
            }
            return this._pts[seg - 1].interpolated(this._pts[seg], localT / segLen);
        };

        const useRange = range || this._range;
        const seg1: number = this._getSegment(useRange.min);
        const stPt = getPtInSegment(useRange.min, seg1);
        const seg2: number = this._getSegment(useRange.max);
        const endPt = getPtInSegment(useRange.max, seg2);
        bounding.expandByPoint(endPt);
        bounding.expandByPoint(stPt);

        for (let i = seg1; i < seg2; i++) {
            bounding.expandByPoint(this._pts[i]);
        }

        return bounding;
    }

    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        const stSeg = this._getSegment(this._range.min);
        const edSeg = this._getSegment(this._range.max);
        const ret = [this.getStartPt()];
        for (let i = stSeg; i < edSeg; i++) ret.push(this._pts[i].clone());
        ret.push(this.getEndPt());
        return ret;
    }

    public getType(): EN_GEO_TYPE.SMOOTHPOLY_3D {
        return EN_GEO_TYPE.SMOOTHPOLY_3D;
    }

    public clone(): SmoothPoly3 {
        return super.clone() as any;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump(): types.IDBSmoothPoly3d {
        return {
            ...super.dump(),
            data: [this._pts.map(pt => pt.toArray3())],
        };
    }

    public load(json: types.IDBSmoothPoly3d) {
        const { data: [pts] } = json;
        this._pts = pts.map(pt => new Vec3(pt));
        this._calParams();
        return super.load(json);
    }

    private _getSegment(t: number): number {
        MathError.assert(this._pts.length >= 2, '不合法的SmoothPoly');

        if (this._pts.length === 2) {
            return 1;
        }

        let i: number;
        let left: number;
        let right: number;
        left = 0;
        right = this._ts.length - 1;
        while (this._ts[left] === this._ts[left + 1]) {
            left++;
        }
        while (this._ts[right] === this._ts[right - 1]) {
            right--;
        }
        while (left + 1 < right) {
            i = Math.floor((left + right) / 2);
            if (t < this._ts[i]) {
                right = i;
                while (this._ts[right] === this._ts[right - 1]) {
                    right--;
                }
            } else {
                left = i;
                while (this._ts[left] === this._ts[left + 1]) {
                    left++;
                }
            }
        }
        return right;
    }

    private _calParams() {
        this._ts = [0.0];
        for (let i = 1; i < this._pts.length;) {
            const dt = this._pts[i].distanceTo(this._pts[i - 1]);
            if (dt < Tol.LENGTH) {
                this._pts.splice(i, 1);
            } else {
                this._ts.push(this._ts[i - 1] + dt);
                i++;
            }
        }
        this._range = new Interval(this._ts[0], this._ts[this._ts.length - 1]);
    }
}