import { MathAssert } from '../util/assert';
import { Util } from '../util/util';
import { CONST } from '../type_define/const';
import { Tol } from './tol';
import { Interval } from './interval';
import { types } from '../type_define/i_types';



/**
 * 周期区间
 * min in [0, period)
 * (max - min) in [0, period]
 * min 和 max 设置后需调用 Regularize 使其满足上述条件
 */
class PeriodInterval extends Interval {
    /**
     * 判断输入区间是否为周期区间
     * @param range
     */
    public static isPeriod(range: PeriodInterval | Interval): range is PeriodInterval {
        return (range as PeriodInterval)._period !== undefined;
    }

    public static areEqual(
        a: number,
        b: number,
        period: number = CONST.PI2,
        eps: number = Tol.NUMBER,
    ): boolean {
        const len = PeriodInterval.RegularizeParam(b - a, period);
        return len < eps || len > period - eps;
    }

    /**
     * 将参数正规化至 [0, period)，会根据容差自动将结果吸附至端点
     * @param param 待调整参数
     * @param period 周期
     * @param toler 容差
     */
    public static RegularizeParam(
        param: number,
        period: number = CONST.PI2,
        refParam: number = 0,
        eps = Tol.CALCULATE_EPS,
    ): number {
        let ret = (param - refParam) % period;
        if (ret < -eps) {
            ret += period;
        } else if (period - ret < eps) {
            ret -= period; // 当ret比period小0.000001时
        }
        return ret + refParam;
    }

    /**
     * 一组区间的合并，仅支持同周期的区间
     * 要求输入为正规化的周期区间
     * @param ranges
     */
    public static merge(ranges: PeriodInterval[]): PeriodInterval[] {
        if (ranges.length < 1) {
            return [];
        }

        const period = ranges[0]._period;
        for (let i = 1; i < ranges.length; i++) {
            MathAssert.assert(ranges[i]._period === period, 'PeriodInterval.Merge()：待合并区间周期不同！');
        }

        // 转化到 0～period 区间进行合并
        const _secs: Interval[] = [];
        ranges.forEach(r => {
            if (r.max > period) {
                _secs.push(new Interval(0, r.max - period));
                _secs.push(new Interval(r.min, period));
            } else {
                _secs.push(new Interval(r.min, r.max));
            }
        });
        const intervals = Interval.merge(_secs);

        // 处理夸周期区间
        if (
            intervals.length > 1 &&
            intervals[0].min < Tol.NUMBER &&
            intervals[intervals.length - 1].max > period - Tol.NUMBER
        ) {
            intervals[intervals.length - 1].max = intervals[0].max + period;
            intervals.shift();
        }
        return intervals.map(r => new PeriodInterval(r.min, r.max, period));
    }

    public static make(min: number, max: number, period: number): Interval {
        return period > 0 ? new PeriodInterval(min, max, period) : new Interval(min, max);
    }

    private _period: number;

    /**
     * 构造方法，最小点和最大点
     * @param min 最小值
     * @param max 最大值
     * @param period 周期
     */
    constructor(pMin: number, pMax: number, period: number = CONST.PI2) {
        super();
        this._min = pMin;
        this._max = pMax;
        this._period = period;
        this.regularize();
    }

    public get min() {
        return this._min;
    }

    public set min(v: number) {
        this._min = v;
        this.regularize();
    }

    public get max() {
        return this._max;
    }

    public set max(v: number) {
        this._max = v;
        this.regularize();
    }

    public get period() {
        return this._period;
    }

    public set period(v: number) {
        this._period = v;
        this.regularize();
    }

    public set(min: number, max: number): this {
        this._min = min;
        this._max = max;
        this.regularize();
        return this;
    }

    public setInfinit(min?: number): this {
        if (min === undefined) {
            const mid = (this._min + this._max) / 2;
            const hp = this._period / 2;
            if (mid < hp) {
                this._min = mid + hp;
                this._max = mid + hp * 3;
            } else {
                this._min = mid - hp;
                this._max = mid + hp;
            }
        } else {
            this._min = min;
            this._max = min + CONST.PI2;
        }
        return this;
    }

    public toArray(): types.IInterval {
        return [this._min, this._max];
    }

    public toArrayWithPeriod(): types.IPeriodInterval {
        return [this._min, this._max, this._period];
    }

    /**
     * 调整参数，将其拉回参数域
     * @param param
     */
    public clamp(param: number): number {
        const dp = PeriodInterval.RegularizeParam(param - this._min, this._period);
        const len = this._max - this._min;

        if (dp <= len) return dp + this._min;

        const dmax = dp - len;
        const dmin = this._period - dp;
        return dmax < dmin ? param - dmax : param + dmin;
    }

    /**
     * 调整 param 所在周期，使得返回结果 ret in [min, min + period)
     * @param param
     */
    public getRegularParam(param: number, eps = Tol.CALCULATE_EPS): number {
        const dt = PeriodInterval.RegularizeParam(param - this._min, this._period, 0, eps);
        return this._period - dt < eps ? this._min : dt + this._min;
    }

    /**
     * 包含坐标轴上的一个点
     * @param param
     * @param tolerance
     */
    public containsPt(param: number, tolerance: number = Tol.NUMBER): boolean {
        const dp = PeriodInterval.RegularizeParam(param - this._min, this._period, 0, tolerance);
        // const p = this._period - dp < tolerance ? this._min : dp + this._min;
        // return p < this._max + tolerance && p > this._min - tolerance;
        return dp < this._max - this._min + tolerance || dp > this._period - tolerance;
    }

    /**
     * 点在区间端点上
     * @param param
     * @param tolerance
     */
    public containsPtAtStartOrEnd(param: number, tolerance: number = Tol.NUMBER): boolean {
        const dp = PeriodInterval.RegularizeParam(param - this._min, this._period, tolerance);
        return (
            Math.abs(dp) < tolerance ||
            Math.abs(dp - this._period) < tolerance ||
            Math.abs(this._max - this._min - dp) < tolerance
        );
    }

    /**
     * 完全包含另一个区间
     * @param param
     * @param tolerance
     */
    public containsInterval(another: PeriodInterval, tolerance: number = Tol.NUMBER): boolean {
        if (this.isClosed(tolerance)) return true;

        if (another._period !== this._period) {
            return false;
        }

        return (
            (this._min < another.min + tolerance && this._max > another.max - tolerance) ||
            (this._min - this._period < another.min + tolerance && this._max - this._period > another.max - tolerance)
        );
    }

    /**
     * 返回范围内的参数，返回的参数在区间 [min, min + period) 内
     * @param params
     * @param eps
     * @returns
     */
    public filterParams(params: number[]): number[] {
        const ret: number[] = [];

        for (const t0 of params) {
            const t = this.getRegularParam(t0);
            if (t <= this._max) ret.push(t);
        }
        return ret.sort();
    }

    /**
     * 与另一个区间相等
     * @param param
     * @param tolerance
     */
    public equals(that: PeriodInterval, tolerance: number = Tol.NUMBER): boolean {
        if (this._period !== that._period) {
            return false;
        }

        const thisClose = this.isClosed();
        const thatClose = that.isClosed();

        if (!thisClose && !thatClose) {
            return Util.isNearlyEqual(this._min, that.min) && Util.isNearlyEqual(this._max, that.max);
        }
        return thisClose && thatClose;
    }

    public isClosed(tolerance: number = Tol.NUMBER): boolean {
        return Util.isNearlyEqual(this._max - this._min, this._period, tolerance);
    }

    /**
     * 与区间/点的距离，可使用该距离判断位置关系
     * @param another
     */
    public distanceTo(another: PeriodInterval | number): number {
        if (typeof another === 'number') {
            const p = another as number;
            const p2 = this.getRegularParam(p);
            if (p2 < this._max) {
                return Math.max(p2 - this._max, this._min - p2);
            }
            const p1 = p2 - CONST.PI2;
            return Math.min(p2 - this._max, this._min - p1);
        }

        // 有交，返回相交的部分
        const r = this.intersected(another);
        if (r.length > 0) {
            return -r[0].getLength();
        }
        return Math.min(
            PeriodInterval.RegularizeParam(another.min - this._max, this._period),
            PeriodInterval.RegularizeParam(this._min - another.max, this._period),
        );
    }

    /**
     * 两个区间求交集，若区间没有交，则返回 []
     * @param another
     */
    public intersected(another: PeriodInterval, eps = Tol.NUMBER): PeriodInterval[] {
        if (this._period !== another._period) return [];
        if (this.isClosed()) return [another.clone()];

        const ret = super.intersected(another, eps).map(r => new PeriodInterval(r.min, r.max, this._period));
        if (this._max > this._period - eps) {
            const anotherMin = another.min + this._period;
            if (this._max > anotherMin) {
                const min = Math.max(anotherMin, this.min);
                ret.push(new PeriodInterval(min, this._max, this._period));
            } else if (this._max > anotherMin - eps) {
                const mid = (this._max + anotherMin) / 2;
                ret.push(new PeriodInterval(mid, mid));
            }
        }
        if (another.max > this._period - eps) {
            const anotherMax = another.max - this._period;
            if (this._min < anotherMax) {
                const max = Math.min(this.max, anotherMax);
                ret.push(new PeriodInterval(this._min, max, this._period));
            } else if (this._min < anotherMax + eps) {
                const mid = (this._min + anotherMax) / 2;
                ret.push(new PeriodInterval(mid, mid));
            }
        }
        return ret;
    }

    /**
     * 减掉一组区间,若区间长度小于1e-6则自动舍掉
     * @param ranges
     */
    public subtracted(...ranges: PeriodInterval[]): PeriodInterval[] {
        ranges.forEach(r => {
            MathAssert.assert(r._period === this._period, 'PeriodInterval.subtracted: Period not equal');
        });
        const rangesLeft = ranges
            .filter(r => r.max > this._period)
            .map(r => new Interval(r.min - this._period, r.max - this._period));

        const rangesRight =
            this._max > this._period ? ranges.map(r => new Interval(r.min + this._period, r.max + this._period)) : [];

        const subs = (ranges as Interval[]).concat(rangesLeft).concat(rangesRight);

        const rets = super.subtracted(...subs);

        return rets.map(r => new PeriodInterval(r.min, r.max, this._period));
    }

    /**
     * 扩展
     * @param pt
     */
    public expandByPt(pt: number): this {
        const rpt = this.getRegularParam(pt);

        if (rpt <= this._max) return this;

        const lpt = rpt - this._period;
        if (rpt - this._max < this._min - lpt) {
            this._max = rpt;
        } else {
            this._min = lpt;
            if (lpt < 0) {
                this._min += this._period;
                this._max += this._period;
            }
        }
        return this;
    }

    /**
     * 区间的缩放，改变自己
     * @param scale
     */
    public multiply(scale: number): this {
        MathAssert.assert(scale === 1, 'PeriodInterval.multiply: Not support multiply');
        return this;
    }

    /**
     * 调整后，min in [0, period)
     * (max - min) in [0, period)
     */
    public regularize(): this {
        const st = PeriodInterval.RegularizeParam(this._min, this._period);
        let len = PeriodInterval.RegularizeParam(this._max - this._min, this._period);

        if (Util.isNearly0(len) && !Util.isNearlyEqual(this._min, this._max)) {
            len = this._period;
        }
        this._min = st;
        this._max = st + len;
        return this;
    }

    /**
     * 区间的打断算法
     * @param ranges
     */
    public splited(...ranges: (PeriodInterval | number)[]): PeriodInterval[] {
        const points = [this._min, this._max];

        for (const r of ranges) {
            if (typeof r === 'number') {
                const newP = this.getRegularParam(r);
                if (newP < this._max) points.push(newP);
            } else {
                const newP1 = this.getRegularParam(r.min);
                const newP2 = this.getRegularParam(r.max);
                if (newP1 < this._max) points.push(newP1);
                if (newP2 < this._max) points.push(newP2);
            }
        }

        points.sort((a, b) => {
            return a - b;
        });

        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
            if (points[i + 1] - points[i] > Tol.NUMBER) {
                result.push(new PeriodInterval(points[i], points[i + 1], this._period));
            }
        }

        return result;
    }

    public clone() {
        return new PeriodInterval(this._min, this._max, this._period);
    }
}

export { PeriodInterval };