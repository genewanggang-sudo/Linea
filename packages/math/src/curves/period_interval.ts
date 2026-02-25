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
     * 创建周期区间。
     * @param start 区间起点，可为任意实数。
     * @param end 区间终点，可为任意实数。
     * @param period 周期长度，必须大于 0。
     */
    constructor(start = 0, end = 0, period = Math.PI * 2) {
        MathError.assert(Number.isFinite(start) && Number.isFinite(end), 'PeriodInterval: start/end must be finite')
        MathError.assert(period > 0, 'PeriodInterval: period must be > 0')
        const canonical = PeriodInterval.canonicalize(start, end, period)
        super(canonical.start, canonical.end)
        this.period = period
    }

    /**
     * 将参数归一化到 `[0, period)`。
     * @param u 待归一化参数。
     * @returns 归一化后的参数值。
     */
    public normalize(u: number) {
        return PeriodInterval.mod(u, this.period)
    }

    /**
     * 将参数归一化到指定周期窗口 `[start, start + period)`。
     * @param u 待归一化参数。
     * @param start 周期窗口起点，默认当前区间起点。
     * @returns 与 `u` 周期等价，且落在窗口内的参数。
     */
    public normalizeInPeriod(u: number, start = this.start) {
        return start + PeriodInterval.mod(u - start, this.period)
    }

    /**
     * 区间整体平移（按周期等价）。
     * @param offset 平移量。
     * @returns 平移后的新区间实例。
     */
    public shift(offset: number) {
        return new PeriodInterval(this._start + offset, this._start + this.span() + offset, this.period)
    }

    /**
     * 计算周期区间长度（沿正方向）。
     * @returns 区间跨度，范围在 `[0, period]`。
     */
    public override length() {
        return this.span()
    }

    /**
     * 判断参数是否落在周期区间内。
     * @param u 待判断参数。
     * @param eps 边界比较容差。
     * @returns 落在区间内（含容差）返回 `true`。
     */
    public override contains(u: number, eps = Precision.EPS) {
        if (this.isFull(eps)) return true
        const d = this.forwardDelta(this._start, this.normalize(u))
        return d <= this.span() + eps || this.period - d <= eps
    }

    /**
     * 将参数限制到区间内。
     * @param u 输入参数。
     * @returns 已在区间内返回归一化参数；否则返回最近边界参数。
     */
    public override clamp(u: number) {
        const t = this.normalize(u)
        if (this.contains(t)) return t

        const end = this.normalize(this._start + this.span())
        const dStart = this.circularDistance(t, this._start)
        const dEnd = this.circularDistance(t, end)
        return dStart <= dEnd ? this._start : end
    }

    /**
     * 判断两个周期区间是否近似相等。
     * @param other 对比区间。
     * @param eps 数值比较容差。
     * @returns 周期一致且区间位置/长度一致时返回 `true`。
     */
    public override equals(other: PeriodInterval, eps = Precision.EPS) {
        if (!Precision.equal(this.period, other.period, eps)) return false
        if (this.isFull(eps) && other.isFull(eps)) return true
        return Precision.equal(this._start, other._start, eps) &&
            Precision.equal(this.span(), other.span(), eps)
    }

    /**
     * 计算周期交集。
     * @param other 参与求交的周期区间。
     * @param eps 交并判定容差。
     * @returns 交集结果，按线性分段返回 `PeriodInterval[]`（最多 2 段）。
     */
    public override intersect(other: PeriodInterval, eps = Precision.EPS): PeriodInterval[] {
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
     * 计算周期并集。
     * @param other 参与求并的周期区间。
     * @param eps 交并判定容差。
     * @returns 并集结果，按线性分段返回 `PeriodInterval[]`（1 到 2 段）。
     */
    public override union(other: PeriodInterval, eps = Precision.EPS): PeriodInterval[] {
        if (!Precision.equal(this.period, other.period, eps)) {
            MathError.throw('PeriodInterval.union: period mismatch')
        }

        const merged = Interval.merge([
            ...this.toLinearSegments(eps),
            ...other.toLinearSegments(eps),
        ], eps)

        if (merged.length >= 2) {
            const first = merged[0]
            const last = merged[merged.length - 1]
            if (Precision.equal(first.start, 0, eps) && Precision.equal(last.end, this.period, eps)) {
                const stitched = new Interval(last.start, this.period + first.end)
                return [stitched, ...merged.slice(1, -1)].map((seg) => new PeriodInterval(seg.start, seg.end, this.period))
            }
        }
        return merged.map((seg) => new PeriodInterval(seg.start, seg.end, this.period))
    }

    /**
     * 以参数 `u` 对周期区间切分。
     * @param u 切分参数。
     * @param eps 边界判定容差。
     * @returns 边界或区间外返回 `[]`；内部切分返回两段区间。
     */
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

    /**
     * 克隆当前周期区间。
     * @returns 与当前数值等价的新实例。
     */
    public override clone() {
        return new PeriodInterval(this._start, this._start + this.span(), this.period)
    }

    /**
     * 当前区间沿正方向长度。
     * @returns `_end - _start`。
     */
    private span() {
        return this._end - this._start
    }

    /**
     * 判断是否为整周期闭合区间。
     * @param eps 比较容差。
     * @returns 近似等于整周期长度时返回 `true`。
     */
    private isFull(eps = Precision.EPS) {
        return Precision.equal(this.span(), this.period, eps)
    }

    /**
     * 计算两参数在圆周上的最短距离。
     * @param a 参数 a。
     * @param b 参数 b。
     * @returns 最短圆周距离。
     */
    private circularDistance(a: number, b: number) {
        const d = Math.abs(a - b)
        return Math.min(d, this.period - d)
    }

    /**
     * 计算从 `a` 到 `b` 的正方向差值。
     * @param a 起点参数。
     * @param b 终点参数。
     * @returns 归一化到 `[0, period)` 的正向差值。
     */
    private forwardDelta(a: number, b: number) {
        return PeriodInterval.mod(b - a, this.period)
    }

    /**
     * 转为 `[0, period]` 上的普通线性区间段。
     * @param eps 判定整周期与边界贴合的容差。
     * @returns 线性区间段数组。
     */
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

    /**
     * 规范化输入到内部表示。
     * @param start 输入起点。
     * @param end 输入终点。
     * @param period 周期长度。
     * @returns 规范化后的 `{ start, end }`，满足 `start in [0, period)` 且 `end = start + len`。
     */
    private static canonicalize(start: number, end: number, period: number) {
        const s = PeriodInterval.mod(start, period)
        let len = PeriodInterval.mod(end - start, period)
        if (Precision.equal(len, 0, Precision.EPS) && !Precision.equal(start, end, Precision.EPS)) {
            len = period
        }
        return { start: s, end: s + len }
    }

    /**
     * 正模运算。
     * @param x 被取模值。
     * @param m 模（周期）。
     * @returns 结果范围在 `[0, m)`。
     */
    private static mod(x: number, m: number) {
        const r = x % m
        return r < 0 ? r + m : r
    }
}
