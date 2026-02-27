import { EN_GEO_TYPE } from '../constants/geom_type'
import { MathConst } from '../constants/math_const'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBCircle2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IClosestPointResult } from '../types/type_define'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Arc2 } from './arc2'
import { CircleCurve2 } from './circle_curve2'
import { Interval } from './interval'
import { PeriodInterval } from './period_interval'

@RegisterGeom
/**
 * 二维整圆曲线。
 * 参数域固定为 `PeriodInterval(0, 2π, 2π)`。
 */
export class Circle2 extends CircleCurve2 {
    public static readonly type = EN_GEO_TYPE.Circle2

    /**
     * 构造整圆。
     * @param center 圆心。
     * @param radius 半径。
     */
    constructor(center: Vec2, radius: number) {
        super(center, radius)
        this.setRange(new PeriodInterval(0, MathConst.PI2, MathConst.PI2))
    }

    public override length(range?: Interval) {
        if (!range) return MathConst.PI2 * this._radius
        this._range.assertContainsRange(range, Precision.CURVE_PARAM_EPS)
        return range.length() * this._radius
    }

    public override lengthAtParam(u: number) {
        const uu = this.normalizeParamForEval(u)
        const start = this._range.start
        return (uu - start) * this._radius
    }

    public override paramAtLength(s: number, tol = Precision.CURVE_LENGTH_EPS) {
        const total = this.length()
        MathError.assert(Number.isFinite(tol) && tol > 0, 'Circle2.paramAtLength: tol must be > 0')
        MathError.assert(s >= -tol && s <= total + tol, `Circle2.paramAtLength: s out of range [0, ${total}]`)

        const clamped = Math.min(total, Math.max(0, s))
        return this._range.start + clamped / this._radius
    }

    public override split(u: number) {
        const range = this._range as PeriodInterval
        const uu = range.normalizeInPeriod(u, range.start)
        if (Math.abs(uu - range.start) <= Precision.CURVE_PARAM_EPS || Math.abs(uu - range.end) <= Precision.CURVE_PARAM_EPS) {
            return []
        }

        const first = new Arc2(this._center, this._radius, range.start, uu, false)
        const second = new Arc2(this._center, this._radius, uu, range.start + range.period, false)
        return [first, second].filter((arc) => arc.length() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range, Precision.CURVE_PARAM_EPS)
        if (range.length() <= Precision.CURVE_PARAM_EPS) return []
        return [new Arc2(this._center, this._radius, range.start, range.end, false)]
    }

    public override reverse() {
        // 整圆反转后几何与参数域等价，保持不变即可。
        return this
    }

    public override transform(m: Mat3) {
        MathError.assert(m.isSimilarity2D(Precision.CURVE_PARAM_EPS), 'Circle2.transform: matrix must be a 2D similarity transform')

        const nextCenter = m.transformedPoint(this._center)
        const scale = m.getSimilarityScale2D(Precision.CURVE_PARAM_EPS)
        const nextRadius = this._radius * scale
        MathError.assert(nextRadius > Precision.CURVE_LENGTH_EPS, 'Circle2.transform: degenerate radius after transform')

        this._center = nextCenter
        this._radius = nextRadius
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override closestPoint(p: Vec2): IClosestPointResult {
        const v = p.subtracted(this._center)
        let u = this._range.start

        if (v.len() > Precision.CURVE_NEWTON_EPS) {
            u = (this._range as PeriodInterval).normalizeInPeriod(Math.atan2(v.y, v.x), this._range.start)
        }

        const point = this.pointAt(u)
        return {
            point,
            param: u,
            distance: point.distanceTo(p),
        }
    }

    public override boundingBox() {
        return new Box2(
            this._center.x - this._radius,
            this._center.y - this._radius,
            this._center.x + this._radius,
            this._center.y + this._radius,
        )
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        return this.isCircleStructValid(eps)
    }

    public override isClosed(): boolean {
        return true
    }

    public override isCircle(): this is Circle2 {
        return true
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比圆。
     * @param eps 数值容差。
     * @returns 圆心和半径近似相等时返回 `true`。
     */
    public equals(other: Circle2, eps = Precision.EPS) {
        return this._center.equals(other._center, eps) && Precision.equal(this._radius, other._radius, eps)
    }

    public override clone(): this {
        return new Circle2(this._center, this._radius) as this
    }

    public override dump(): IDBCircle2 {
        return {
            type: Circle2.type,
            center: { x: this._center.x, y: this._center.y },
            radius: this._radius,
        }
    }

    public static load(data: IDBCircle2) {
        return new Circle2(new Vec2(data.center.x, data.center.y), data.radius)
    }
}
