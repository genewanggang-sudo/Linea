/*
 * Linea Math - Curves
 * PeriodInterval: 周期参数区间
 */

import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Interval } from './interval'

export class PeriodInterval extends Interval {
    /** 周期长度，必须 > 0 */
    public readonly period: number

    /**
     * 创建周期区间
     * - 输入支持跨周期写法，如 [350, 30] (period = 360)
     */
    constructor(start = 0, end = 0, period = Math.PI * 2) {
        MathError.assert(period > 0, 'PeriodInterval: period must be > 0')
        const canonical = PeriodInterval.canonicalize(start, end, period)
        super(canonical.start, canonical.end)
        this.period = period
    }

    /** 归一化参数到 [0, period) */
    public normalize(u: number) {
        return PeriodInterval.mod(u, this.period)
    }

    /** 区间整体平移（按周期等价） */
    public shift(offset: number) {
        return new PeriodInterval(this._start + offset, this._start + this.span() + offset, this.period)
    }

    /** 周期区间长度（沿正方向） */
    public override length() {
        return this.span()
    }

    /** 点是否落在周期区间内（含容差） */
    public override contains(u: number, eps = Precision.EPS) {
        if (this.isFull(eps)) return true
        const d = this.forwardDelta(this._start, this.normalize(u))
        return d <= this.span() + eps || this.period - d <= eps
    }

    /**
     * 把参数限制在区间内
     * - 若已在区间内，返回归一化值
     * - 否则返回最近边界点
     */
    public override clamp(u: number) {
        const t = this.normalize(u)
        if (this.contains(t)) return t

        const end = this.normalize(this._start + this.span())
        const dStart = this.circularDistance(t, this._start)
        const dEnd = this.circularDistance(t, end)
        return dStart <= dEnd ? this._start : end
    }

    /** 周期区间近似相等 */
    public override equals(other: Interval, eps = Precision.EPS) {
        if (!(other instanceof PeriodInterval)) return false
        if (!Precision.equal(this.period, other.period, eps)) return false
        if (this.isFull(eps) && other.isFull(eps)) return true
        return Precision.equal(this._start, other._start, eps) &&
            Precision.equal(this.span(), other.span(), eps)
    }

    /**
     * 周期交集
     * - 结果按普通区间段返回（0~2 段）
     */
    public override intersect(other: Interval, eps = Precision.EPS): PeriodInterval[] {
        if (!(other instanceof PeriodInterval)) {
            MathError.throw('PeriodInterval.intersect: other must be PeriodInterval')
        }
        if (!Precision.equal(this.period, other.period, eps)) {
            MathError.throw('PeriodInterval.intersect: period mismatch')
        }

        const ret: Interval[] = []
        for (const a of this.toLinearSegments(eps)) {
            for (const b of other.toLinearSegments(eps)) {
                ret.push(...a.intersect(b, eps))
            }
        }
        return Interval.merge(ret, eps).map((seg) => new PeriodInterval(seg.start, seg.end, this.period))
    }

    /**
     * 周期并集
     * - 结果按普通区间段返回（1~2 段）
     */
    public override union(other: Interval): PeriodInterval[] {
        if (!(other instanceof PeriodInterval)) {
            MathError.throw('PeriodInterval.union: other must be PeriodInterval')
        }
        if (!Precision.equal(this.period, other.period, Precision.EPS)) {
            MathError.throw('PeriodInterval.union: period mismatch')
        }

        const merged = Interval.merge([
            ...this.toLinearSegments(),
            ...other.toLinearSegments(),
        ])

        // 首尾相连时合并为跨周期表示的一段
        if (merged.length >= 2) {
            const first = merged[0]
            const last = merged[merged.length - 1]
            if (Precision.equal(first.start, 0, Precision.EPS) && Precision.equal(last.end, this.period, Precision.EPS)) {
                const stitched = new Interval(last.start, this.period + first.end)
                return [stitched, ...merged.slice(1, -1)].map((seg) => new PeriodInterval(seg.start, seg.end, this.period))
            }
        }
        return merged.map((seg) => new PeriodInterval(seg.start, seg.end, this.period))
    }

    /** 周期切分 */
    public override split(u: number, eps = Precision.EPS): PeriodInterval[] {
        if (!this.contains(u, eps)) return []
        const d = this.forwardDelta(this._start, this.normalize(u))
        const len = this.span()
        if (d <= eps || d >= len - eps) return []

        const mid = this._start + d
        return [
            new PeriodInterval(this._start, mid, this.period),
            new PeriodInterval(mid, this._start + len, this.period),
        ]
    }

    /** 克隆 */
    public override clone() {
        return new PeriodInterval(this._start, this._start + this.span(), this.period)
    }

    /** 当前区间沿正方向长度 */
    private span() {
        return this._end - this._start
    }

    /** 是否为整周期闭合区间 */
    private isFull(eps = Precision.EPS) {
        return Precision.equal(this.span(), this.period, eps)
    }

    /** 圆周距离 */
    private circularDistance(a: number, b: number) {
        const d = Math.abs(a - b)
        return Math.min(d, this.period - d)
    }

    /** a 到 b 的正方向差值 */
    private forwardDelta(a: number, b: number) {
        return PeriodInterval.mod(b - a, this.period)
    }

    /** 转为 [0, period] 的普通线性区间段 */
    private toLinearSegments(eps = Precision.EPS): Interval[] {
        if (this.isFull(eps)) {
            return [new Interval(0, this.period)]
        }

        const s = this._start
        const e = this._start + this.span()
        if (e <= this.period + eps) {
            return [new Interval(s, Math.min(e, this.period))]
        }
        return [
            new Interval(s, this.period),
            new Interval(0, e - this.period),
        ]
    }

    /** 规范化输入到内部表示：start in [0, period), end = start + len */
    private static canonicalize(start: number, end: number, period: number) {
        const s = PeriodInterval.mod(start, period)
        let len = PeriodInterval.mod(end - start, period)
        if (Precision.equal(len, 0, Precision.EPS) && !Precision.equal(start, end, Precision.EPS)) {
            len = period
        }
        return { start: s, end: s + len }
    }

    /** 正模运算，结果 in [0, m) */
    private static mod(x: number, m: number) {
        const r = x % m
        return r < 0 ? r + m : r
    }

}
