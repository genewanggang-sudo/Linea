/*
 * Linea Math - Curves
 * Interval: 一维闭区间 [start, end]
 */

import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { MathConst } from '../constants/math_const'

export class Interval {
    /**
     * 返回数学无界区间。
     * @returns 取值范围为 `[-Infinity, +Infinity]` 的区间实例。
     */
    public static infinite() {
        return new Interval(MathConst.MIN, MathConst.MAX)
    }

    /**
     * 归并多段区间。
     * @param intervals 待归并区间数组，可无序。
     * @param eps 判断端点相接时使用的容差。
     * @returns 按 `start` 升序、且相交或相接段已合并的新区间数组。
     */
    public static merge(intervals: readonly Interval[], eps = Precision.EPS): Interval[] {
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
     * 创建闭区间 `[start, end]`。
     * @param start 区间起点。
     * @param end 区间终点；若小于 `start` 会在内部自动交换顺序。
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

    /**
     * 计算区间长度。
     * @returns `end - start`，点区间返回 `0`。
     */
    public length() {
        return this._end - this._start
    }

    /**
     * 判断参数是否落在区间内。
     * @param u 待判断参数。
     * @param eps 闭区间边界比较容差。
     * @returns 在 `[start - eps, end + eps]` 内返回 `true`，否则返回 `false`。
     */
    public contains(u: number, eps = Precision.EPS) {
        return u >= this._start - eps && u <= this._end + eps
    }

    /**
     * 将参数钳制到区间范围内。
     * @param u 输入参数。
     * @returns 小于起点返回 `start`，大于终点返回 `end`，否则返回自身。
     */
    public clamp(u: number) {
        if (u < this._start) return this._start
        if (u > this._end) return this._end
        return u
    }

    /**
     * 判断两个区间是否近似相等。
     * @param other 另一个区间。
     * @param eps 端点比较容差。
     * @returns 起点和终点都在容差内时返回 `true`。
     */
    public equals(other: Interval, eps = Precision.EPS) {
        return Precision.equal(this._start, other._start, eps) &&
            Precision.equal(this._end, other._end, eps)
    }

    /**
     * 原地扩展区间。
     * @param delta 扩展量；`delta > 0` 表示扩大，`delta < 0` 表示收缩。
     * @returns 当前实例（便于链式调用）。
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

    /**
     * 返回扩展后的新区间，不修改当前实例。
     * @param delta 扩展量；语义同 `expand`。
     * @returns 新的区间实例。
     */
    public expanded(delta: number) {
        return this.clone().expand(delta)
    }

    /**
     * 计算与另一区间的交集。
     * @param other 参与求交的区间。
     * @param eps 判定“相离/相接”时的容差。
     * @returns 无交集返回 `[]`；有交集返回单段 `[Interval]`；端点相接返回点区间。
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
     * 计算与另一区间的并集（普通区间语义）。
     * @param other 参与求并的区间。
     * @returns 单段最小覆盖区间数组（保持与 `PeriodInterval` 的返回形态一致）。
     */
    public union(other: Interval): Interval[] {
        return [new Interval(
            Math.min(this._start, other._start),
            Math.max(this._end, other._end),
        )]
    }

    /**
     * 以参数 `u` 切分区间。
     * @param u 切分参数。
     * @param eps 边界判定容差。
     * @returns `u` 在边界或区间外返回 `[]`；在区间内部返回两段子区间。
     */
    public split(u: number, eps = Precision.EPS): Interval[] {
        if (!this.contains(u, eps)) return []
        if (Precision.equal(u, this._start, eps) || Precision.equal(u, this._end, eps)) {
            return []
        }
        return [new Interval(this._start, u), new Interval(u, this._end)]
    }

    /**
     * 克隆当前区间。
     * @returns 与当前区间数值相同的新实例。
     */
    public clone() {
        return new Interval(this._start, this._end)
    }

    /**
     * 规范化区间顺序，使 `_start <= _end`。
     * 仅在内部使用。
     */
    protected sortRange() {
        if (this._start <= this._end) return
        const t = this._start
        this._start = this._end
        this._end = t
    }
}
