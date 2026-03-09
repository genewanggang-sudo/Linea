import { EN_GEO_TYPE } from '../constants/geom_type'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBLine2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IClosestPointResult } from '../types/type_define'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Curve2 } from './curve2'
import { Interval } from './interval'

@RegisterGeom
/**
 * 二维线段曲线。
 * 参数域固定为 `[0, len]`，其中 `len = |end - start|`。
 */
export class Line2 extends Curve2 {
    public static readonly type = EN_GEO_TYPE.Line2

    private _start: Vec2
    private _end: Vec2
    private _dir: Vec2
    private _len: number

    /**
     * 构造线段。
     * @param start 起点。
     * @param end 终点。
     */
    constructor(start: Vec2, end: Vec2) {
        super()
        this._start = start.clone()
        this._end = end.clone()
        this._dir = Vec2.zero()
        this._len = 0
        this.rebuildCache()
        this.setRange(new Interval(0, this._len))
    }

    /** 起点（返回副本） */
    public get start() {
        return this._start.clone()
    }

    /** 终点（返回副本） */
    public get end() {
        return this._end.clone()
    }

    public override getDomain(): Interval {
        return Interval.infinite()
    }

    public override pointAt(u: number) {
        const uu = this.snapParam(u)
        return this.evalPointAt(uu)
    }

    public override getPtAt(u: number) {
        MathError.assert(Number.isFinite(u), 'Line2.getPtAt: u must be finite')
        return this.evalPointAt(u)
    }

    public override getTangentAt(u: number) {
        this.snapParam(u)
        return this._dir.clone()
    }

    public override getDerivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'Line2.getDerivatives: n must be a non-negative integer')
        const ret: Vec2[] = [this.getPtAt(u)]
        for (let i = 1; i <= n; i++) {
            ret.push(i === 1 ? this._dir.clone() : Vec2.zero())
        }
        return ret
    }

    public override curvatureAt(u: number) {
        this.snapParam(u)
        return 0
    }

    public override getLength(range?: Interval) {
        if (!range) return this._len
        this._range.assertContainsRange(range)
        return range.length()
    }

    public override lengthAtParam(u: number) {
        return this.snapParam(u)
    }

    public override paramAtLength(s: number, tol = Precision.CURVE_LENGTH_EPS) {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'Line2.paramAtLength: tol must be > 0')
        MathError.assert(s >= -tol && s <= this._len + tol, `Line2.paramAtLength: s out of range [0, ${this._len}]`)
        return Math.min(this._len, Math.max(0, s))
    }

    public override split(u: number) {
        const parts = this._range.split(u, Precision.CURVE_PARAM_EPS)
        if (parts.length === 0) return []

        const p = this.getPtAt(u)
        const left = new Line2(this._start, p)
        const right = new Line2(p, this._end)

        return [left, right].filter((seg) => seg.getLength() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range)
        if (range.length() <= Precision.CURVE_LENGTH_EPS) return []

        const s = this.getPtAt(range.start)
        const e = this.getPtAt(range.end)
        return [new Line2(s, e)]
    }

    public override reverse() {
        const t = this._start
        this._start = this._end
        this._end = t
        this.rebuildCache()
        this.setRange(new Interval(0, this._len))
        return this
    }

    public override transform(m: Mat3) {
        const newStart = m.transformedPoint(this._start)
        const newEnd = m.transformedPoint(this._end)
        const nextLen = newStart.distanceTo(newEnd)

        MathError.assert(nextLen > Precision.CURVE_LENGTH_EPS, 'Line2.transform: degenerate line after transform')

        this._start = newStart
        this._end = newEnd
        this.rebuildCache()
        this.setRange(new Interval(0, this._len))
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override closestPoint(p: Vec2): IClosestPointResult {
        const sp = p.subtracted(this._start)
        const u = Math.min(this._len, Math.max(0, sp.dot(this._dir)))
        const point = this.getPtAt(u)
        return {
            point,
            param: u,
            distance: point.distanceTo(p),
        }
    }

    public override getParamAt(p: Vec2) {
        return p.subtracted(this._start).dot(this._dir)
    }

    public override getBBox() {
        return Box2.fromPoints([this._start, this._end])
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        return Number.isFinite(this._start.x) &&
            Number.isFinite(this._start.y) &&
            Number.isFinite(this._end.x) &&
            Number.isFinite(this._end.y) &&
            this._start.distanceTo(this._end) > eps
    }

    public override isLine(): this is Line2 {
        return true
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比线段。
     * @param eps 数值容差。
     * @returns 起点与终点分别近似相等时返回 `true`。
     */
    public equals(other: Line2, eps = Precision.EPS) {
        return this._start.equals(other._start, eps) && this._end.equals(other._end, eps)
    }

    public override clone(): this {
        return new Line2(this._start, this._end) as this
    }

    public override dump(): IDBLine2 {
        return {
            type: Line2.type,
            start: { x: this._start.x, y: this._start.y },
            end: { x: this._end.x, y: this._end.y },
        }
    }

    public static load(data: IDBLine2) {
        return new Line2(
            new Vec2(data.start.x, data.start.y),
            new Vec2(data.end.x, data.end.y),
        )
    }

    /**
     * 参数吸附到端点，避免边界浮点抖动。
     * @param u 输入参数。
     * @returns 吸附后的参数。
     */
    private snapParam(u: number) {
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)
        if (this._range.containsAtStartOrEnd(u, Precision.CURVE_PARAM_EPS)) {
            return Precision.equal(u, this._range.start, Precision.CURVE_PARAM_EPS) ? this._range.start : this._range.end
        }
        return u
    }

    private evalPointAt(u: number) {
        return this._start.added(this._dir.scaled(u))
    }

    /**
     * 重建方向与长度缓存。
     * - `_dir`：单位方向向量
     * - `_len`：线段长度
     */
    private rebuildCache() {
        const v = this._end.subtracted(this._start)
        const len = v.len()
        MathError.assert(len > Precision.CURVE_LENGTH_EPS, 'Line2: start and end must not coincide')
        this._len = len
        this._dir = v.scale(1 / len)
    }
}
