/*
 * Linea Math - Curves
 * Interval: 一维闭区间 [start, end]
 */

import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { MathConst } from '../constants/math_const'

export class Interval {
    /** 返回数学无界区间 */
    public static infinite() {
        return new Interval(MathConst.MIN, MathConst.MAX)
    }

    /**
     * 归并多段区间
     * - 输入可无序
     * - 相交或端点相接（含 eps）会合并
     * - 返回按 start 升序的新区间数组
     */
    public static merge(intervals: readonly Interval[], eps = Precision.EPS): Interval[] {
        MathError.assert(Number.isFinite(eps) && eps >= 0, 'Interval.merge: eps must be a non-negative finite number')
        for (const it of intervals) {
            MathError.assert(!Number.isNaN(it.start) && !Number.isNaN(it.end), 'Interval.merge: interval endpoint must not be NaN')
        }
        if (intervals.length === 0) return []

        const sorted = [...intervals].sort((a, b) => a.start - b.start)
        const ret: Interval[] = [sorted[0].clone()]
        for (let i = 1; i < sorted.length; i++) {
            const cur = sorted[i]
            const last = ret[ret.length - 1]
            if (cur.start <= last.end + eps) {
                ret[ret.length - 1] = new Interval(last.start, Math.max(last.end, cur.end))
            } else {
                ret.push(cur.clone())
            }
        }
        return ret
    }

    /** 区间起点（闭区间） */
    protected _start: number

    /** 区间终点（闭区间） */
    protected _end: number

    /**
     * 创建闭区间 [start, end]
     * - 若 start > end，会自动交换为有序区间
     */
    constructor(start = 0, end = 0) {
        MathError.assert(!Number.isNaN(start) && !Number.isNaN(end), 'Interval: start/end must not be NaN')
        this._start = start
        this._end = end
        this.sortRange()
    }

    /** 区间起点 */
    public get start() {
        return this._start
    }

    /** 区间终点 */
    public get end() {
        return this._end
    }

    /** 区间长度（点区间长度为 0） */
    public length() {
        return this._end - this._start
    }

    /** 点是否落在区间内（闭区间，含容差） */
    public contains(u: number, eps = Precision.EPS) {
        return u >= this._start - eps && u <= this._end + eps
    }

    /** 把点限制在区间内 */
    public clamp(u: number) {
        if (u < this._start) return this._start
        if (u > this._end) return this._end
        return u
    }

    /** 区间近似相等 */
    public equals(other: Interval, eps = Precision.EPS) {
        return Precision.equal(this._start, other._start, eps) &&
            Precision.equal(this._end, other._end, eps)
    }

    /**
     * 原地扩展区间
     * - delta > 0 扩大
     * - delta < 0 收缩
     */
    public expand(delta: number) {
        MathError.assert(Number.isFinite(delta), 'Interval.expand: delta must be finite')
        const nextStart = this._start - delta
        const nextEnd = this._end + delta
        MathError.assert(nextStart <= nextEnd, 'Interval.expand: shrink exceeds interval length')
        this._start = nextStart
        this._end = nextEnd
        return this
    }

    /** 返回扩展后的新区间 */
    public expanded(delta: number) {
        return this.clone().expand(delta)
    }

    /**
     * 求交集
     * - 无交集返回 []
     * - 有交集返回 [Interval]
     * - 端点相接返回点区间
     */
    public intersect(other: Interval, eps = Precision.EPS): Interval[] {
        const s = Math.max(this._start, other._start)
        const e = Math.min(this._end, other._end)
        if (s > e + eps) return []
        if (Precision.equal(s, e, eps)) {
            const m = (s + e) / 2
            return [new Interval(m, m)]
        }
        return [new Interval(s, e)]
    }

    /**
     * 求并集（普通区间返回最小覆盖区间）
     * - 返回数组是为了和 PeriodInterval 的多段并集保持一致
     */
    public union(other: Interval): Interval[] {
        return [new Interval(
            Math.min(this._start, other._start),
            Math.max(this._end, other._end),
        )]
    }

    /**
     * 以参数 u 切分区间
     * - u 在边界（含容差）时返回 []
     * - u 在中间时返回两段
     * - u 在区间外时返回 []
     */
    public split(u: number, eps = Precision.EPS): Interval[] {
        if (!this.contains(u, eps)) return []
        if (Precision.equal(u, this._start, eps) || Precision.equal(u, this._end, eps)) {
            return []
        }
        return [new Interval(this._start, u), new Interval(u, this._end)]
    }

    /** 克隆 */
    public clone() {
        return new Interval(this._start, this._end)
    }

    /** 规范化区间顺序 */
    protected sortRange() {
        if (this._start <= this._end) return
        const t = this._start
        this._start = this._end
        this._end = t
    }
}
