/*
 * Linea Math - Curves
 * Interval: 一维闭区间 [start, end]
 */

import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { MathConst } from '../constants/math_const'

export class Interval {
    /** 区间起点（闭区间） */
    protected _start: number

    /** 区间终点（闭区间） */
    protected _end: number

    /**
     * 创建闭区间 `[start, end]`。
     * @param start 区间起点。
     * @param end 区间终点；若小于 `start` 会在内部自动交换顺序。
     */
    constructor()

    constructor(start: number, end: number)

    constructor(start?: number, end?: number) {
        if (start === undefined && end === undefined) {
            this._start = MathConst.MIN
            this._end = MathConst.MAX
        } else if (start !== undefined && end !== undefined) {
            MathError.assert(!Number.isNaN(start) && !Number.isNaN(end), 'Interval: start/end must not be NaN')
            this._start = Math.min(start, end)
            this._end = Math.max(start, end)
        } else {
            MathError.throw('Interval: 构造函数仅支持 0 或 2 个参数')
        }
    }

    /** 区间起点 */
    public get start() {
        return this._start
    }

    /** 区间起点 */
    public set start(v: number) {
        const e = this._end
        this._start = Math.min(v, e)
        this._end = Math.max(v, e)
    }

    /** 区间终点 */
    public get end() {
        return this._end
    }

    /** 区间终点 */
    public set end(v: number) {
        const s = this._start
        this._start = Math.min(s, v)
        this._end = Math.max(s, v)
    }

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

    /**
     * 计算区间长度。
     * @returns `end - start`，点区间返回 `0`。
     */
    public length() {
        return this._end - this._start
    }

    /**
     * 计算区间中点。
     * @returns `(start + end) / 2`。
     */
    public mid() {
        return (this._start + this._end) * 0.5
    }

    /**
     * 克隆当前区间。
     * @returns 与当前区间数值相同的新实例。
     */
    public clone() {
        return new Interval(this._start, this._end)
    }

    /**
     * 设置区间端点（自动保持 `start <= end`）。
     * @param start 区间起点。
     * @param end 区间终点。
     * @returns 当前实例。
     */
    public set(start: number, end: number) {
        this._start = Math.min(start, end)
        this._end = Math.max(start, end)
        return this
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
     * 判断参数是否落在区间起点或终点上。
     * @param u 待判断参数。
     * @param eps 端点比较容差。
     * @returns 在任一端点（容差内）返回 `true`。
     */
    public containsAtStartOrEnd(u: number, eps = Precision.EPS) {
        return Precision.equal(u, this._start, eps) || Precision.equal(u, this._end, eps)
    }

    /**
     * 断言参数在区间内。
     * @param u 待校验参数。
     * @param eps 区间边界比较容差。
     * @returns 当前区间实例。
     * @throws MathError 参数不在区间内时抛错。
     */
    public assertContains(u: number, eps = Precision.EPS) {
        MathError.assert(this.contains(u, eps), 'Interval.assertContains: parameter out of range')
        return this
    }

    /**
     * 断言子区间完整落在当前区间内。
     * @param range 待校验子区间。
     * @param eps 区间边界比较容差。
     * @returns 当前区间实例。
     * @throws MathError 子区间超出当前区间时抛错。
     */
    public assertContainsRange(range: Interval, eps = Precision.EPS) {
        MathError.assert(
            this.contains(range.start, eps) && this.contains(range.end, eps),
            'Interval.assertContainsRange: range out of bounds',
        )
        return this
    }

    /**
     * 判断是否完全包含另一区间。
     * @param other 待判断区间。
     * @param eps 区间边界比较容差。
     * @returns `other` 的起终点都在当前区间内时返回 `true`。
     */
    public containsInterval(other: Interval, eps = Precision.EPS) {
        return this.contains(other.start, eps) && this.contains(other.end, eps)
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
     * 判断与另一区间是否连通（相交或相接）。
     * @param other 对比区间。
     * @param eps 判定“相离/相接”时的容差。
     * @returns 相交或相接（容差内）返回 `true`；相离返回 `false`。
     */
    public isConnected(other: Interval, eps = Precision.EPS) {
        return !(this._end < other._start - eps || other._end < this._start - eps)
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
     * 计算与另一区间的最短距离。
     * @param other 对比区间。
     * @param eps 判定“连通/相离”时的容差。
     * @returns 连通返回 `0`；相离返回两区间间隙（非负）。
     */
    public distanceTo(other: Interval, eps = Precision.EPS) {
        if (this.isConnected(other, eps)) return 0
        if (this._end < other._start) {
            return other._start - this._end
        }
        return this._start - other._end
    }

    /**
     * 计算与另一区间的最小覆盖区间。
     * @param other 参与覆盖计算的区间。
     * @returns 同时覆盖两区间的单段区间。
     */
    public coverRange(other: Interval): Interval {
        return new Interval(
            Math.min(this._start, other._start),
            Math.max(this._end, other._end),
        )
    }

    /**
     * 计算与另一区间的严格并集。
     * @param other 参与求并的区间。
     * @param eps 判定“相离/相接”时的容差。
     * @returns 相交或相接返回单段；不相交返回按 `start` 升序的两段区间。
     */
    public union(other: Interval, eps = Precision.EPS): Interval[] {
        if (!this.isConnected(other, eps)) {
            const [a, b] = this._start <= other._start ? [this, other] : [other, this]
            return [a.clone(), b.clone()]
        }
        return [this.coverRange(other)]
    }

    /**
     * 从当前区间减去一组区间。
     * @param ranges 待减去的区间集合。
     * @param eps 判定“相离/相接”时的容差。
     * @returns 差集结果区间数组（按 `start` 升序）。
     */
    public subtracted(ranges: readonly Interval[], eps = Precision.EPS): Interval[] {
        const ret: Interval[] = []
        let cursor = this._start

        for (const cutter of Interval.merge(ranges, eps)) {
            if (cutter.end <= cursor + eps) continue
            if (cutter.start >= this._end - eps) break

            const s = Math.max(cutter.start, this._start)
            const e = Math.min(cutter.end, this._end)
            if (cursor < s - eps) ret.push(new Interval(cursor, s))
            if (e > cursor) cursor = e
            if (cursor >= this._end - eps) break
        }

        if (cursor < this._end - eps) ret.push(new Interval(cursor, this._end))
        return ret
    }

    /**
     * 以参数 `u` 切分区间。
     * @param u 切分参数。
     * @param eps 边界判定容差。
     * @returns `u` 在边界或区间外返回 `[]`；在区间内部返回两段子区间。
     */
    public split(u: number, eps = Precision.EPS): Interval[] {
        if (!this.contains(u, eps)) return []
        if (this.containsAtStartOrEnd(u, eps)) {
            return []
        }
        return [new Interval(this._start, u), new Interval(u, this._end)]
    }

    /**
     * 按点原地扩展区间，使区间覆盖该点。
     * @param pt 目标点。
     * @returns 当前实例（便于链式调用）。
     */
    public expandByPt(pt: number) {
        MathError.assert(Number.isFinite(pt), 'Interval.expandByPt: point must be finite')
        if (pt < this._start) {
            this._start = pt
        }
        if (pt > this._end) {
            this._end = pt
        }
        return this
    }

    /**
     * 按原点对区间做比例缩放（原地）。
     * @param scale 缩放比例，必须为有限数。
     * @returns 当前实例（便于链式调用）。
     */
    public multiply(scale: number) {
        this._start *= scale
        this._end *= scale
        if (this._start > this._end) {
            const t = this._start
            this._start = this._end
            this._end = t
        }
        return this
    }
}
