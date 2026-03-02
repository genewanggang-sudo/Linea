/*
 * Linea Math - Curves
 * PeriodInterval: 周期参数区间
 */

import { MathConst } from '../constants/math_const'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Interval } from './interval'

/**
 * 周期区间
 * min in [0, period)
 * (max - min) in [0, period]
 */
export class PeriodInterval extends Interval {
    /** 周期长度，必须 > 0 */
    private readonly _period: number

    /**
     * 创建周期区间。
     * @param start 区间起点，可为任意实数。
     * @param end 区间终点，可为任意实数。
     * @param period 周期长度，必须大于 0。
     */
    constructor(start: number, end: number, period = MathConst.PI2) {
        MathError.assert(Number.isFinite(start) && Number.isFinite(end), 'PeriodInterval: start/end must be finite')
        MathError.assert(period > 0, 'PeriodInterval: period must be > 0')
        super()
        this._start = start
        this._end = end
        this._period = period
        this.normalizeRange()
    }

    /** 周期长度（只读） */
    public get period() {
        return this._period
    }

    /** 区间起点（周期语义） */
    public override get start() {
        return this._start
    }

    /** 区间起点（周期语义） */
    public override set start(v: number) {
        this._start = v
        this.normalizeRange()
    }

    /** 区间终点（周期语义） */
    public override get end() {
        return this._end
    }

    /** 区间终点（周期语义） */
    public override set end(v: number) {
        this._end = v
        this.normalizeRange()
    }

    /**
     * 判断参数是否落在周期区间内。
     * @param u 待判断参数。
     * @param eps 边界比较容差。
     * @returns 落在区间内（含容差）返回 `true`。
     */
    public override contains(u: number, eps = Precision.EPS) {
        if (this.isClosed(eps)) return true
        const d = this.offsetFromStart(u, eps)
        return d <= this.length() + eps || this._period - d <= eps
    }

    /**
     * 判断参数是否落在区间起点或终点上（周期语义）。
     * @param u 待判断参数。
     * @param eps 端点比较容差。
     * @returns 在任一端点（容差内）返回 `true`。
     */
    public override containsAtStartOrEnd(u: number, eps = Precision.EPS) {
        const d = this.offsetFromStart(u, eps)
        return d <= eps || this._period - d <= eps || Math.abs(d - this.length()) <= eps
    }

    /**
     * 判断是否完整包含另一区间（周期语义）。
     * @param other 待判断区间。
     * @param eps 区间边界比较容差。
     * @returns 完整包含返回 `true`，否则返回 `false`。
     */
    public override containsInterval(other: Interval, eps = Precision.EPS) {
        if (!(other instanceof PeriodInterval)) return false
        if (!Precision.equal(this._period, other.period, eps)) return false
        if (this.isClosed(eps)) return true
        if (other.isClosed(eps)) return false

        const offset = PeriodInterval.normalizeParam(other.start - this._start, this._period, 0, eps)
        return offset <= this.length() + eps && offset + other.length() <= this.length() + eps
    }

    /**
     * 将参数限制到区间内。
     * @param u 输入参数。
     * @returns 已在区间内返回归一化参数；否则返回最近边界参数。
     */
    public override clamp(u: number) {
        const dp = this.offsetFromStart(u, Precision.EPS)
        const len = this.length()
        if (dp <= len) return this._start + dp

        const dEnd = dp - len
        const dStart = this._period - dp
        const end = this._start + len
        return PeriodInterval.normalizeParam(dEnd < dStart ? end : this._start, this._period)
    }

    /**
     * 按点原地扩展周期区间，使区间覆盖该点。
     * @param pt 目标点。
     * @returns 当前实例（便于链式调用）。
     */
    public override expandByPt(pt: number) {
        MathError.assert(Number.isFinite(pt), 'PeriodInterval.expandByPt: point must be finite')

        const d = this.offsetFromStart(pt, Precision.EPS)
        const len = this.length()
        if (d <= len) return this

        const dEnd = d - len
        const dStart = this._period - d
        if (dEnd < dStart) {
            this._end = this._start + d
        } else {
            this._start -= dStart
        }
        return this.normalizeRange()
    }

    /**
     * 判断两个周期区间是否近似相等。
     * @param other 对比区间。
     * @param eps 数值比较容差。
     * @returns 周期一致且区间位置/长度一致时返回 `true`。
     */
    public override equals(other: PeriodInterval, eps = Precision.EPS) {
        if (!Precision.equal(this._period, other.period, eps)) return false
        if (this.isClosed(eps) && other.isClosed(eps)) return true
        return Precision.equal(this._start, other._start, eps) &&
            Precision.equal(this.length(), other.length(), eps)
    }

    /**
     * 判断与另一区间在周期语义下是否连通（相交或相接）。
     * @param other 对比区间。
     * @param eps 判定容差。
     * @returns 周期下有交集返回 `true`，否则返回 `false`。
     */
    public override isConnected(other: PeriodInterval, eps = Precision.EPS) {
        this.assertSamePeriod(other, 'isConnected', eps)
        return this.intersect(other, eps).length > 0
    }

    /**
     * 计算周期交集。
     * @param other 参与求交的周期区间。
     * @param eps 交并判定容差。
     * @returns 交集结果，按线性分段返回 `PeriodInterval[]`（最多 2 段）。
     */
    public override intersect(other: PeriodInterval, eps = Precision.EPS): PeriodInterval[] {
        this.assertSamePeriod(other, 'intersect', eps)
        const ret: Interval[] = []
        for (const a of this.toIntervals(eps)) {
            for (const b of other.toIntervals(eps)) {
                ret.push(...a.intersect(b, eps))
            }
        }
        return Interval.merge(ret, eps).map((seg) => new PeriodInterval(seg.start, seg.end, this._period))
    }

    /**
     * 计算周期并集。
     * @param other 参与求并的周期区间。
     * @param eps 交并判定容差。
     * @returns 并集结果，按线性分段返回 `PeriodInterval[]`（1 到 2 段）。
     */
    public override union(other: PeriodInterval, eps = Precision.EPS): PeriodInterval[] {
        this.assertSamePeriod(other, 'union', eps)

        const merged = Interval.merge([
            ...this.toIntervals(eps),
            ...other.toIntervals(eps),
        ], eps)

        if (merged.length >= 2) {
            const first = merged[0]
            const last = merged[merged.length - 1]
            if (Precision.equal(first.start, 0, eps) && Precision.equal(last.end, this._period, eps)) {
                const stitched = new Interval(last.start, this._period + first.end)
                return [stitched, ...merged.slice(1, -1)].map((seg) => new PeriodInterval(seg.start, seg.end, this._period))
            }
        }
        return merged.map((seg) => new PeriodInterval(seg.start, seg.end, this._period))
    }

    /**
     * 计算与另一区间在周期语义下的最短距离。
     * @param other 对比区间。
     * @param eps 判定“连通/相离”时的容差。
     * @returns 连通返回 `0`；相离返回圆周上的最小间隙（非负）。
     */
    public override distanceTo(other: PeriodInterval, eps = Precision.EPS) {
        this.assertSamePeriod(other, 'distanceTo', eps)
        const overlap = this.intersect(other, eps)
        if (overlap.length > 0) {
            return -overlap[0].length()
        }

        return Math.min(
            PeriodInterval.normalizeParam(other._start - this._end, this._period, 0, eps),
            PeriodInterval.normalizeParam(this._start - other._end, this._period, 0, eps),
        )
    }

    /**
     * 从当前周期区间减去一组周期区间。
     * @param ranges 待减去区间集合。
     * @param eps 判定“相离/相接”时的容差。
     * @returns 差集结果区间数组（周期语义）。
     */
    public override subtracted(ranges: readonly Interval[], eps = Precision.EPS): PeriodInterval[] {
        if (ranges.length === 0) return [this.clone()]

        const periodicRanges: PeriodInterval[] = []
        for (const range of ranges) {
            MathError.assert(range instanceof PeriodInterval, 'PeriodInterval.subtracted: range must be PeriodInterval')
            this.assertSamePeriod(range, 'subtracted', eps)
            periodicRanges.push(range)
        }

        const cutters = Interval.merge(periodicRanges.flatMap((r) => r.toIntervals(eps)), eps)
        let pieces: Interval[] = []
        for (const seg of this.toIntervals(eps)) {
            pieces.push(...seg.subtracted(cutters, eps))
        }
        if (pieces.length === 0) return []

        pieces = Interval.merge(pieces, eps)
        if (pieces.length >= 2) {
            const first = pieces[0]
            const last = pieces[pieces.length - 1]
            if (Precision.equal(first.start, 0, eps) && Precision.equal(last.end, this._period, eps)) {
                const stitched = new Interval(last.start, this._period + first.end)
                pieces = [stitched, ...pieces.slice(1, -1)]
            }
        }

        return pieces.map((seg) => new PeriodInterval(seg.start, seg.end, this._period))
    }

    /**
     * 以参数 `u` 对周期区间切分。
     * @param u 切分参数。
     * @param eps 边界判定容差。
     * @returns 边界或区间外返回 `[]`；内部切分返回两段区间。
     */
    public override split(u: number, eps = Precision.EPS): PeriodInterval[] {
        if (!this.contains(u, eps)) return []
        if (this.containsAtStartOrEnd(u, eps)) return []
        const d = this.offsetFromStart(u, eps)
        const len = this.length()
        if (d >= len - eps) return []

        const mid = this._start + d
        return [
            new PeriodInterval(this._start, mid, this._period),
            new PeriodInterval(mid, this._start + len, this._period),
        ]
    }

    /**
     * 克隆当前周期区间。
     * @returns 与当前数值等价的新实例。
     */
    public override clone() {
        return new PeriodInterval(this._start, this._start + this.length(), this._period)
    }

    /**
     * 设置区间端点（周期语义）。
     * @param start 区间起点。
     * @param end 区间终点。
     * @returns 当前实例。
     */
    public override set(start: number, end: number) {
        this._start = start
        this._end = end
        return this.normalizeRange()
    }

    /**
     * 周期区间不支持原点缩放，仅允许恒等缩放。
     * @param scale 缩放比例。
     * @returns 当前实例。
     */
    public override multiply(scale: number) {
        MathError.assert(scale === 1, 'PeriodInterval.multiply: Not support multiply')
        return this
    }

    /**
     * 判断是否为整周期闭合区间。
     * @param eps 比较容差。
     * @returns 近似等于整周期长度时返回 `true`。
     */
    private isClosed(eps = Precision.EPS) {
        return Precision.equal(this.length(), this._period, eps)
    }

    /**
     * 校验两个周期区间周期一致。
     * @param other 另一区间。
     * @param fnName 调用方方法名，用于报错定位。
     * @param eps 周期比较容差。
     */
    private assertSamePeriod(other: PeriodInterval, fnName: string, eps = Precision.EPS) {
        if (!Precision.equal(this._period, other.period, eps)) {
            MathError.throw(`PeriodInterval.${fnName}: period mismatch`)
        }
    }

    /**
     * 计算参数相对区间起点的周期偏移，返回值在 `[0, period)`。
     */
    private offsetFromStart(u: number, eps = Precision.EPS) {
        return PeriodInterval.normalizeParam(u - this._start, this._period, 0, eps)
    }

    /**
     * 转为 `[0, period]` 上的普通线性区间段。
     * @param eps 判定整周期与边界贴合的容差。
     * @returns 线性区间段数组。
     */
    private toIntervals(eps = Precision.EPS): Interval[] {
        if (this.isClosed(eps)) {
            return [new Interval(0, this._period)]
        }

        const s = this._start
        const e = this._start + this.length()
        if (e <= this._period + eps) {
            return [new Interval(s, Math.min(e, this._period))]
        }
        return [
            new Interval(s, this._period),
            new Interval(0, e - this._period),
        ]
    }

    /**
     * 将当前实例中的区间参数正规化到内部表示。
     * @returns 当前实例；写回后满足 `_start in [0, period)` 且 `(_end - _start) in [0, period]`。
     */
    public normalizeRange() {
        const s = PeriodInterval.normalizeParam(this._start, this._period)
        let len = PeriodInterval.normalizeParam(this._end - this._start, this._period)
        if (Precision.nearlyZero(len, Precision.EPS) && !Precision.equal(this._start, this._end)) {
            len = this._period
        }
        this._start = s;
        this._end = s + len;
        return this;
    }

    /**
     * 将参数正规化到周期窗口 `[ref, ref + m)`，并在边界附近执行容差吸附。
     * @param param 待正规化参数。
     * @param period 周期长度（模），必须大于 0。
     * @param refParam 目标窗口起点，默认 `0`。
     * @param eps 边界吸附容差，默认 `Precision.EPS`。
     * @returns 正规化后的参数值。
     */
    public static normalizeParam(param: number, period: number, refParam = 0, eps = Precision.EPS) {
        MathError.assert(period > 0, 'PeriodInterval.normalizeParam: period must be > 0')

        let r = (param - refParam) % period
        if (r < 0) r += period

        if (r <= eps || period - r <= eps) {
            r = 0
        }
        return refParam + r
    }
}
