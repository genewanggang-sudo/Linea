import { Util } from '../util/util';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';
import { Tol } from './tol';
import { MathError } from '../util/math_error';

/**
 * 区间
 */
class Interval {
    /**
     * 返回默认的无限大参数域
     */
    public static infinit(): Interval {
        return new Interval(-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH);
    }

    /**
     * 返回默认的无限大参数域
     */
    public static infinitArray(): types.IInterval {
        return [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH];
    }

    /**
     * 一组区间的合并
     * @param ranges
     */
    public static merge(ranges: Interval[]): Interval[] {
        if (ranges.length < 1) {
            return [];
        }

        if (ranges.length > 1) {
            ranges.sort((a, b) => {
                return a._min - b._min;
            });
        }

        const result = [ranges[0]];
        let cur = result[0];
        for (let i = 1; i < ranges.length; i++) {
            if (ranges[i]._min < cur._max + Tol.DEFAULT.numberEps) {
                cur._max = Math.max(ranges[i]._max, cur._max);
            } else {
                cur = ranges[i];
                result.push(cur);
            }
        }
        return result;
    }

    protected _min!: number;

    protected _max!: number;

    constructor();

    /**
     * 构造方法，最小点和最大点
     * @param min
     * @param max
     * @param autoReset 若min>max 是否自动交换min与max
     */
    constructor(min: number, max: number, autoRest?: boolean);

    constructor(min?: number, max?: number, autoReset: boolean = false) {
        if (min !== undefined && max !== undefined) {
            if (min < max) {
                this._min = min;
                this._max = max;
            } else if (autoReset) {
                this._min = max;
                this._max = min;
            } else {
                MathError.warn(Util.isNearlyEqual(min, max), `invalid interval[ ${min}, ${max}]`);
                // 仅调整 max，而非交换，以尽量减少改动
                this._min = min;
                this._max = min;
            }
        }
    }

    public get min() {
        return this._min;
    }

    public set min(v: number) {
        MathError.assert(v < this._max || Util.isNearlyEqual(v, this._max), `min > this._max ${v} ${this._max}`);
        this._min = v < this.max ? v : this.max;
    }

    public get max() {
        return this._max;
    }

    public set max(v: number) {
        MathError.assert(this._min < v || Util.isNearlyEqual(v, this._min), `max < this._min ${v} ${this._min}`);
        this._max = v > this.min ? v : this.min;
    }

    public set(min: number, max: number): this {
        MathError.assert(min < max || Util.isNearlyEqual(min, max), `min > max ${min} ${max}`);
        this._min = min;
        this._max = max > min ? max : min;
        return this;
    }

    public setInfinit(min?: number): this {
        this.min = min !== undefined ? min : -CONST.MODEL_MAX_LENGTH;
        this.max = CONST.MODEL_MAX_LENGTH;
        return this;
    }

    public toArray(): types.IInterval {
        return [this._min, this._max];
    }

    /**
     * 包含坐标轴上的一个点
     * @param param
     * @param tolerance
     */
    public containsPt(param: number, tolerance: number = Tol.NUMBER): boolean {
        const t = tolerance;
        return param + t >= this._min && param - t <= this._max;
    }

    /**
     * 判断如果param出了参数域，将param拉回到参数域边界
     * @param param
     */
    public clamp(param: number): number {
        if (param < this._min) {
            return this._min; // 出domain边界，拉回来
        }
        if (param > this._max) {
            return this._max;
        }
        return param;
    }

    /**
     * 点在区间端点上
     * @param param
     * @param tolerance
     */
    public containsPtAtStartOrEnd(param: number, tolerance: number = Tol.NUMBER): boolean {
        return Math.abs(this._min - param) < tolerance || Math.abs(this._max - param) < tolerance;
    }

    /**
     * 完全包含另一个区间
     * @param param
     * @param tolerance
     */
    public containsInterval(another: Interval, tolerance: number = Tol.NUMBER): boolean {
        const t = tolerance;
        return this.containsPt(another._min, t) && this.containsPt(another._max, t);
    }

    /**
     * 返回范围内的参数
     * @param params
     * @param eps
     * @returns
     */
    public filterParams(params: number[]): number[] {
        const min = this._min;
        const max = this._max;
        return params.filter(t => min <= t && t <= max);
    }

    /**
     * 与另一个区间相等
     * @param param
     * @param tolerance
     */
    public equals(another: Interval, tolerance: number = Tol.NUMBER): boolean {
        return this.containsInterval(another, tolerance) && another.containsInterval(this, tolerance);
    }

    /**
     * 返回区间长度
     */
    public getLength(): number {
        return this._max - this._min;
    }

    /**
     * 返回区间中点
     */
    public getMid(): number {
        return (this._max + this._min) / 2;
    }

    /**
     * 与区间/点的距离，可使用该距离判断位置关系
     * @param another
     */
    public distanceTo(another: Interval | number): number {
        if (typeof another === 'number') {
            if (another >= this._min && another <= this._max) {
                return -Math.min(another - this._min, this._max - another);
            }
            if (another >= this._max) {
                return another - this._max;
            }
            if (another <= this._min) {
                return this._min - another;
            }
            return CONST.MODEL_MAX_LENGTH;
        }
        // 有交，返回相交的部分
        const r = this.intersected(another);
        if (r.length > 0) {
            return -r[0].getLength();
        }
        return Math.min(this.distanceTo(another._min), this.distanceTo(another._max));
    }

    /**
     * 两个区间求交集，若区间没有交，则返回 []
     * @param another
     */
    public intersected(another: Interval, eps = Tol.NUMBER): Interval[] {
        const min = Math.max(this._min, another._min);
        const max = Math.min(this._max, another._max);
        if (min > max + eps) {
            return [];
        }
        if (min > max) {
            const mid = (min + max) / 2;
            return [new Interval(mid, mid)];
        }
        return [new Interval(min, max)];
    }

    /**
     * 减掉一组区间,若区间长度小于1e-6则自动舍掉
     * @param ranges
     */
    public subtracted(...ranges: Interval[]): Interval[] {
        const sortRanges = ranges
            .filter(_ => _.min < this.max - Tol.DEFAULT.numberEps)
            .sort((a, b) => a.min - b.min);
        let st = this.min;
        const ret: Interval[] = [];
        const tryEd = (ed: number) => {
            if (st < ed - Tol.DEFAULT.numberEps) {
                ret.push(new Interval(st, ed));
            }
        };
        for (const range of sortRanges) {
            tryEd(range.min);
            if (range.max > st) st = range.max;
        }
        tryEd(this.max);
        return ret;
    }

    /**
     * 扩展
     * @param pt
     */
    public expandByPt(pt: number): this {
        if (pt < this._min) {
            this._min = pt;
        }
        if (pt > this._max) {
            this._max = pt;
        }

        return this;
    }

    /**
     * 区间的缩放，改变自己
     * @param scale
     */
    public multiply(scale: number): this {
        this._min *= scale;
        this._max *= scale;
        return this;
    }

    /**
     * 区间的打断算法
     * @param ranges
     */
    public splited(...ranges: (Interval | number)[]): Interval[] {
        const points = [this._min, this._max];
        for (const r of ranges) {
            if (typeof r === 'number') {
                points.push(r);
            } else {
                points.push(r._min, r._max);
            }
        }

        points.sort((a, b) => {
            return a - b;
        });

        const min = points.findIndex(a => {
            return Util.isNearlyEqual(a, this._min);
        });

        const max = points.findIndex(a => {
            return Util.isNearlyEqual(a, this._max);
        });

        MathError.assert(min > -1 && max > -1, 'logic error');

        const pts = points.slice(min, max + 1);

        const result: Interval[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
            if (pts[i + 1] - pts[i] > Tol.NUMBER) {
                result.push(new Interval(pts[i], pts[i + 1], true));
            }
        }

        return result;
    }

    public clone() {
        return new Interval(this._min, this._max);
    }

    /**
     * 减掉另一个区间
     * @param another
     */
    protected _sub(another: Interval): Interval[] {
        const intRange = this.intersected(another);
        if (intRange.length === 0) {
            return [this];
        }
        const result: Interval[] = [];
        const min1 = this._min;
        const max1 = intRange[0]._min;
        if (max1 > min1) {
            result.push(new Interval(min1, max1));
        }

        const min2 = intRange[0]._max;
        const max2 = this._max;
        if (max2 > min2) {
            result.push(new Interval(min2, max2));
        }
        return result;
    }

    /**
     * 加上另一个区间
     * @param another
     */
    protected _add(another: Interval): this {
        // 没有交
        if (this.intersected(another).length === 0) {
            throw new Error('no intersection cant add');
        }

        this._min = Math.min(this._min, another._min);
        this._max = Math.max(this._max, another._max);
        return this;
    }
}

export { Interval };
