import { EN_GEO_TYPE } from '../constants/geom_type'
import { MathConst } from '../constants/math_const'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBArc2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IClosestPointResult } from '../types/type_define'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { CircleCurve2 } from './circle_curve2'
import { Interval } from './interval'
import { PeriodInterval } from './period_interval'

@RegisterGeom
export class Arc2 extends CircleCurve2 {
    public static readonly type = EN_GEO_TYPE.Arc2

    private _clockwise: boolean

    constructor(center: Vec2, radius: number, startAngle: number, endAngle: number, clockwise = false) {
        super(center, radius)
        MathError.assert(Number.isFinite(startAngle) && Number.isFinite(endAngle), 'Arc2: startAngle/endAngle must be finite')
        this._clockwise = clockwise
        this.resetAngles(startAngle, endAngle, clockwise)
    }

    public get clockwise() {
        return this._clockwise
    }

    public get startAngle() {
        return this.normalizeAngle(this._range.start)
    }

    public get endAngle() {
        const sweep = this._range.length()
        const end = this._clockwise
            ? this._range.start - sweep
            : this._range.start + sweep
        return this.normalizeAngle(end)
    }

    public override pointAt(u: number) {
        return this.pointAtAngle(this.angleAtParam(u))
    }

    public override tangentAt(u: number) {
        const theta = this.angleAtParam(u)
        const sign = this._clockwise ? -1 : 1
        return this.derivativeAtAngle(theta, 1, sign)
    }

    public override derivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'Arc2.derivatives: n must be a non-negative integer')
        const theta = this.angleAtParam(u)
        const sign = this._clockwise ? -1 : 1

        const ret: Vec2[] = [this.pointAtAngle(theta)]
        for (let i = 1; i <= n; i++) {
            ret.push(this.derivativeAtAngle(theta, i, sign))
        }
        return ret
    }

    public override curvatureAt(u: number) {
        this.angleAtParam(u)
        return 1 / this._radius
    }

    public override length(range?: Interval) {
        if (!range) return this._range.length() * this._radius
        this._range.assertContainsRange(range, Precision.CURVE_PARAM_EPS)
        return range.length() * this._radius
    }

    public override lengthAtParam(u: number) {
        const uu = this.normalizeParamForEval(u)
        return (uu - this._range.start) * this._radius
    }

    public override paramAtLength(s: number, tol = Precision.CURVE_LENGTH_EPS) {
        const total = this.length()
        MathError.assert(Number.isFinite(tol) && tol > 0, 'Arc2.paramAtLength: tol must be > 0')
        MathError.assert(s >= -tol && s <= total + tol, `Arc2.paramAtLength: s out of range [0, ${total}]`)
        const clamped = Math.min(total, Math.max(0, s))
        return this._range.start + clamped / this._radius
    }

    public override split(u: number) {
        const pieces = this._range.split(u, Precision.CURVE_PARAM_EPS)
        if (pieces.length === 0) return []

        const theta = this.angleAtParam(u)
        const left = new Arc2(this._center, this._radius, this.startAngle, theta, this._clockwise)
        const right = new Arc2(this._center, this._radius, theta, this.endAngle, this._clockwise)
        return [left, right].filter((arc) => arc.length() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range, Precision.CURVE_PARAM_EPS)
        if (range.length() <= Precision.CURVE_PARAM_EPS) return []

        const s = this.angleAtParam(range.start)
        const e = this.angleAtParam(range.end)
        const arc = new Arc2(this._center, this._radius, s, e, this._clockwise)
        return arc.length() <= Precision.CURVE_LENGTH_EPS ? [] : [arc]
    }

    public override reverse() {
        const s = this.startAngle
        const e = this.endAngle
        this.resetAngles(e, s, !this._clockwise)
        return this
    }

    public override transform(m: Mat3) {
        MathError.assert(m.isSimilarity2D(Precision.CURVE_PARAM_EPS), 'Arc2.transform: matrix must be a 2D similarity transform')

        const oldSweep = this._range.length()
        const oldClockwise = this._clockwise

        const startPoint = this.pointAt(this._range.start)
        const endPoint = this.pointAt(this._range.end)

        const nextCenter = m.transformedPoint(this._center)
        const nextStartPoint = m.transformedPoint(startPoint)
        const nextEndPoint = m.transformedPoint(endPoint)
        const nextRadius = this._radius * m.getSimilarityScale2D(Precision.CURVE_PARAM_EPS)
        MathError.assert(nextRadius > Precision.CURVE_LENGTH_EPS, 'Arc2.transform: degenerate radius after transform')

        const det = m.determinant()
        const mirrored = det < 0
        const nextClockwise = mirrored ? !oldClockwise : oldClockwise

        const startAngle = Math.atan2(nextStartPoint.y - nextCenter.y, nextStartPoint.x - nextCenter.x)
        let endAngle = Math.atan2(nextEndPoint.y - nextCenter.y, nextEndPoint.x - nextCenter.x)
        if (Math.abs(oldSweep - MathConst.PI2) <= Precision.CURVE_PARAM_EPS) {
            endAngle = startAngle + (nextClockwise ? -MathConst.PI2 : MathConst.PI2)
        }

        this._center = nextCenter
        this._radius = nextRadius
        this.resetAngles(startAngle, endAngle, nextClockwise)

        MathError.assert(this.length() > Precision.CURVE_LENGTH_EPS || Math.abs(oldSweep) <= Precision.CURVE_PARAM_EPS, 'Arc2.transform: invalid transformed arc')
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override closestPoint(p: Vec2): IClosestPointResult {
        const range = this._range as PeriodInterval

        const v = p.subtracted(this._center)
        let candidateU = this._range.start
        if (v.len() > Precision.CURVE_NEWTON_EPS) {
            const theta = Math.atan2(v.y, v.x)
            candidateU = this.paramFromAngle(theta)
        }

        const candidates: number[] = []
        if (this._range.contains(candidateU, Precision.CURVE_PARAM_EPS)) {
            candidates.push(candidateU)
        }
        candidates.push(this._range.start, this._range.end)

        let bestU = candidates[0]
        let bestP = this.pointAt(bestU)
        let bestD = bestP.distanceTo(p)

        for (let i = 1; i < candidates.length; i++) {
            const u = candidates[i]
            const q = this.pointAt(u)
            const d = q.distanceTo(p)
            if (d < bestD - Precision.CURVE_LENGTH_EPS) {
                bestU = u
                bestP = q
                bestD = d
                continue
            }
            if (Math.abs(d - bestD) <= Precision.CURVE_LENGTH_EPS) {
                const uu = range.normalizeInPeriod(u, range.start)
                const bb = range.normalizeInPeriod(bestU, range.start)
                if (uu < bb) {
                    bestU = u
                    bestP = q
                    bestD = d
                }
            }
        }

        return {
            point: bestP,
            param: bestU,
            distance: bestD,
        }
    }

    public override boundingBox() {
        const points: Vec2[] = [
            this.pointAt(this._range.start),
            this.pointAt(this._range.end),
        ]

        const axes = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]
        for (const theta of axes) {
            const u = this.paramFromAngle(theta)
            if (this._range.contains(u, Precision.CURVE_PARAM_EPS)) {
                points.push(this.pointAt(u))
            }
        }

        return Box2.fromPoints(points)
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        return this.isCircleStructValid(eps) && this._range.length() >= 0 && this._range.length() <= MathConst.PI2 + Precision.CURVE_PARAM_EPS
    }

    public override isClosed(): boolean {
        return Precision.equal(this._range.length(), MathConst.PI2, Precision.CURVE_PARAM_EPS)
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比圆弧。
     * @param eps 数值容差。
     * @returns 圆心、半径、方向和起终角参数近似相等时返回 `true`。
     */
    public equals(other: Arc2, eps = Precision.EPS) {
        return this._clockwise === other._clockwise &&
            this._center.equals(other._center, eps) &&
            Precision.equal(this._radius, other._radius, eps) &&
            Precision.equal(this.startAngle, other.startAngle, eps) &&
            Precision.equal(this.endAngle, other.endAngle, eps)
    }

    public override clone(): this {
        return new Arc2(this._center, this._radius, this.startAngle, this.endAngle, this._clockwise) as this
    }

    public override dump(): IDBArc2 {
        return {
            type: Arc2.type,
            center: { x: this._center.x, y: this._center.y },
            radius: this._radius,
            startAngle: this.startAngle,
            endAngle: this.endAngle,
            clockwise: this._clockwise,
        }
    }

    public static load(data: IDBArc2) {
        return new Arc2(
            new Vec2(data.center.x, data.center.y),
            data.radius,
            data.startAngle,
            data.endAngle,
            data.clockwise,
        )
    }

    private angleAtParam(u: number) {
        const uu = this.normalizeParamForEval(u)
        // 内部参数域总是递增；顺时针时通过镜像映射回几何角度。
        if (!this._clockwise) return uu
        return this._range.start - (uu - this._range.start)
    }

    private paramFromAngle(theta: number) {
        const range = this._range as PeriodInterval
        if (!this._clockwise) {
            return range.normalizeInPeriod(theta, range.start)
        }
        // 反向参数化：关于 start 角做镜像。
        const reflected = 2 * range.start - theta
        return range.normalizeInPeriod(reflected, range.start)
    }

    private resetAngles(startAngle: number, endAngle: number, clockwise: boolean) {
        const s = this.normalizeAngle(startAngle)
        const startEqEnd = Precision.equal(startAngle, endAngle, Precision.CURVE_PARAM_EPS)
        let sweep = 0

        if (!startEqEnd) {
            const raw = clockwise ? (startAngle - endAngle) : (endAngle - startAngle)
            sweep = this.positiveMod(raw)
            if (Precision.equal(sweep, 0, Precision.CURVE_PARAM_EPS)) {
                sweep = MathConst.PI2
            }
        }

        this._clockwise = clockwise
        this.setRange(new PeriodInterval(s, s + sweep, MathConst.PI2))
    }

    private normalizeAngle(a: number) {
        const r = a % MathConst.PI2
        return r < 0 ? r + MathConst.PI2 : r
    }

    private positiveMod(x: number) {
        const r = x % MathConst.PI2
        return r < 0 ? r + MathConst.PI2 : r
    }
}
