import { Box2 } from '../core/box2'
import { Vec2 } from '../core/vec2'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import type { IClosestPointResult } from '../types/type_define'
import { Curve2 } from './curve2'
import { Interval } from './interval'
import { PeriodInterval } from './period_interval'

/**
 * 椭圆族曲线基类（整椭圆与椭圆弧）。
 */
export abstract class EllipseCurve2 extends Curve2 {
    protected _center: Vec2
    protected _rx: number
    protected _ry: number
    protected _rotation: number

    constructor(center: Vec2, rx: number, ry: number, rotation = 0) {
        super()
        MathError.assert(Number.isFinite(center.x) && Number.isFinite(center.y), 'EllipseCurve2: center must be finite')
        MathError.assert(Number.isFinite(rx) && rx > 0, 'EllipseCurve2: rx must be > 0')
        MathError.assert(Number.isFinite(ry) && ry > 0, 'EllipseCurve2: ry must be > 0')
        MathError.assert(Number.isFinite(rotation), 'EllipseCurve2: rotation must be finite')
        this._center = center.clone()
        this._rx = rx
        this._ry = ry
        this._rotation = rotation
    }

    public get center() {
        return this._center.clone()
    }

    public get rx() {
        return this._rx
    }

    public get ry() {
        return this._ry
    }

    public get rotation() {
        return this._rotation
    }

    public override pointAt(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.pointAtAngle(this.paramToAngle(uu))
    }

    public override tangentAt(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.derivativeFromAngle(this.paramToAngle(uu), 1, this.angleDerivativeSign())
    }

    public override derivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'EllipseCurve2.derivatives: n must be a non-negative integer')
        const uu = this.normalizeParamForEval(u)
        const theta = this.paramToAngle(uu)
        const sign = this.angleDerivativeSign()

        const ret: Vec2[] = []
        for (let k = 0; k <= n; k++) {
            if (k === 0) {
                ret.push(this.pointAtAngle(theta))
                continue
            }
            ret.push(this.derivativeFromAngle(theta, k, sign))
        }
        return ret
    }

    public override curvatureAt(u: number) {
        const d1 = this.derivativeAt(u, 1)
        const d2 = this.derivativeAt(u, 2)
        const denom = Math.pow(d1.lenSq(), 1.5)
        MathError.assert(denom > Precision.CURVE_NEWTON_EPS, 'EllipseCurve2.curvatureAt: tangent is degenerate')
        return Math.abs(d1.cross(d2)) / denom
    }

    public override length(range?: Interval) {
        if (!range) {
            return this.integrateLength(this._range.start, this._range.end)
        }
        this._range.assertContainsRange(range)
        return this.integrateLength(range.start, range.end)
    }

    public override lengthAtParam(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.integrateLength(this._range.start, uu)
    }

    public override paramAtLength(s: number, tol = Precision.CURVE_LENGTH_EPS) {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'EllipseCurve2.paramAtLength: tol must be > 0')

        const total = this.length()
        const start = this._range.start
        const end = this._range.end

        MathError.assert(
            s >= -tol && s <= total + tol,
            `EllipseCurve2.paramAtLength: s out of range [0, ${total}]`,
        )

        if (s <= tol) return start
        if (total - s <= tol) return end

        const target = Math.min(total, Math.max(0, s))
        // 与 B-spline 保持同一套求解策略：Newton 优先，失败时回退二分。
        return this.solveParamByHybridNewton(
            target,
            start,
            end,
            tol,
            (u) => this.integrateLength(start, u),
            (u) => this.tangentAt(u).len(),
            'EllipseCurve2.paramAtLength: failed to converge',
            start + (target / total) * (end - start),
        )
    }

    public override closestPoint(p: Vec2, tol = Precision.CURVE_LENGTH_EPS): IClosestPointResult {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'EllipseCurve2.closestPoint: tol must be > 0')
        // 椭圆/椭圆弧都走统一最近点模板，tie-break 由子类参数语义决定。
        return this.solveClosestPointBySampleNewton(
            p,
            tol,
            96,
            (u) => this.pointAt(u),
            (u) => this.derivativeAt(u, 1),
            (u) => this.derivativeAt(u, 2),
            'EllipseCurve2.closestPoint: failed to converge',
            (a, b) => this.compareParamForTieBreak(a, b),
        )
    }

    public override boundingBox() {
        const points: Vec2[] = [
            this.pointAt(this._range.start),
            this.pointAt(this._range.end),
        ]

        const c = Math.cos(this._rotation)
        const s = Math.sin(this._rotation)

        const tx = Math.atan2(-s * this._ry, c * this._rx)
        const ty = Math.atan2(c * this._ry, s * this._rx)

        const candidates = [tx, tx + Math.PI, ty, ty + Math.PI]
        for (const theta of candidates) {
            const u = this.angleToParam(theta)
            if (this.containsParam(u)) {
                points.push(this.pointAt(u))
            }
        }

        return Box2.fromPoints(points)
    }

    /** 椭圆族结构有效性检查 */
    protected isEllipseStructValid(eps = Precision.CURVE_LENGTH_EPS) {
        return Number.isFinite(this._center.x) &&
            Number.isFinite(this._center.y) &&
            Number.isFinite(this._rx) &&
            Number.isFinite(this._ry) &&
            Number.isFinite(this._rotation) &&
            this._rx > eps &&
            this._ry > eps
    }

    /** 将存储参数转换为椭圆角参数 */
    protected abstract paramToAngle(u: number): number

    /** 将椭圆角参数转换回存储参数 */
    protected abstract angleToParam(theta: number): number

    /** d(theta)/d(u)，仅允许 +1 或 -1 */
    protected abstract angleDerivativeSign(): 1 | -1

    protected pointAtAngle(theta: number) {
        const c = Math.cos(this._rotation)
        const s = Math.sin(this._rotation)
        const ct = Math.cos(theta)
        const st = Math.sin(theta)

        const lx = this._rx * ct
        const ly = this._ry * st

        return new Vec2(
            this._center.x + c * lx - s * ly,
            this._center.y + s * lx + c * ly,
        )
    }

    protected derivativeFromAngle(theta: number, order: number, sign: 1 | -1) {
        const c = Math.cos(this._rotation)
        const s = Math.sin(this._rotation)
        const ct = Math.cos(theta)
        const st = Math.sin(theta)

        let lx = 0
        let ly = 0
        const phase = order % 4
        switch (phase) {
            case 0:
                lx = this._rx * ct
                ly = this._ry * st
                break
            case 1:
                lx = -this._rx * st
                ly = this._ry * ct
                break
            case 2:
                lx = -this._rx * ct
                ly = -this._ry * st
                break
            default:
                lx = this._rx * st
                ly = -this._ry * ct
                break
        }

        const signPow = sign === 1 ? 1 : (order % 2 === 0 ? 1 : -1)
        const x = (c * lx - s * ly) * signPow
        const y = (s * lx + c * ly) * signPow
        return new Vec2(x, y)
    }

    protected normalizeParamForEval(u: number) {
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)

        const start = this._range.start
        const end = this._range.end
        if (Math.abs(u - start) <= Precision.CURVE_PARAM_EPS) return start
        if (Math.abs(u - end) <= Precision.CURVE_PARAM_EPS) return end

        if (this._range instanceof PeriodInterval) {
            return this._range.clamp(u)
        }
        return u
    }

    protected integrateLength(u0: number, u1: number, depth = 0): number {
        if (u1 < u0) return 0

        const f = (u: number) => this.tangentAt(u).len()
        const whole = this.gaussLegendre5(f, u0, u1)

        if (depth >= Precision.CURVE_INTEGRAL_MAX_DEPTH) {
            return whole
        }

        const mid = (u0 + u1) * 0.5
        const left = this.gaussLegendre5(f, u0, mid)
        const right = this.gaussLegendre5(f, mid, u1)
        const err = Math.abs((left + right) - whole)
        if (err <= Precision.CURVE_LENGTH_EPS) {
            return left + right
        }
        return this.integrateLength(u0, mid, depth + 1) + this.integrateLength(mid, u1, depth + 1)
    }

    protected gaussLegendre5(f: (u: number) => number, a: number, b: number) {
        const nodes = [
            0,
            -0.5384693101056831,
            0.5384693101056831,
            -0.906179845938664,
            0.906179845938664,
        ] as const
        const weights = [
            0.5688888888888889,
            0.47862867049936647,
            0.47862867049936647,
            0.23692688505618908,
            0.23692688505618908,
        ] as const

        const c1 = (b - a) * 0.5
        const c2 = (b + a) * 0.5
        let sum = 0
        for (let i = 0; i < nodes.length; i++) {
            sum += weights[i] * f(c1 * nodes[i] + c2)
        }
        return c1 * sum
    }

    protected compareParamForTieBreak(a: number, b: number) {
        if (this._range instanceof PeriodInterval) {
            const aa = PeriodInterval.normalizeParam(a, this._range.period, this._range.start)
            const bb = PeriodInterval.normalizeParam(b, this._range.period, this._range.start)
            return aa - bb
        }
        return a - b
    }

    protected solveProjectedParamOnSupport(
        p: Vec2,
        start: number,
        end: number,
        evalPoint: (u: number) => Vec2,
        evalD1: (u: number) => Vec2,
        evalD2: (u: number) => Vec2,
        normalizeParam: (u: number) => number,
        sampleCount = 128,
    ) {
        const span = end - start
        MathError.assert(Number.isFinite(start) && Number.isFinite(end) && span > 0, 'EllipseCurve2.solveProjectedParamOnSupport: invalid range')

        const sampleUs: number[] = []
        const sampleFs: number[] = []
        const sampleD2: number[] = []

        let bestU = start
        let bestDistSq = Number.POSITIVE_INFINITY
        for (let i = 0; i <= sampleCount; i++) {
            const u = i === sampleCount ? end : (start + (span * i) / sampleCount)
            const eq = this.projectedEquation(u, p, evalPoint, evalD1, evalD2)
            sampleUs.push(u)
            sampleFs.push(eq.f)
            sampleD2.push(eq.distanceSq)
            if (
                eq.distanceSq < bestDistSq - Precision.CURVE_LENGTH_EPS_SQ * 4 ||
                (Math.abs(eq.distanceSq - bestDistSq) <= Precision.CURVE_LENGTH_EPS_SQ * 4 && this.compareParamForTieBreak(normalizeParam(u), normalizeParam(bestU)) < 0)
            ) {
                bestU = u
                bestDistSq = eq.distanceSq
            }
        }

        const windows: Array<[number, number]> = []
        const step = span / sampleCount
        for (let i = 0; i < sampleUs.length - 1; i++) {
            const u0 = sampleUs[i]
            const u1 = sampleUs[i + 1]
            const f0 = sampleFs[i]
            const f1 = sampleFs[i + 1]
            if (Math.abs(f0) <= Precision.CURVE_NEWTON_EPS * 32) {
                windows.push([Math.max(start, u0 - step), Math.min(end, u0 + step)])
            }
            if (Math.abs(f1) <= Precision.CURVE_NEWTON_EPS * 32 || f0 * f1 < 0) {
                windows.push([u0, u1])
            }
        }
        for (let i = 1; i < sampleUs.length - 1; i++) {
            if (sampleD2[i] <= sampleD2[i - 1] && sampleD2[i] <= sampleD2[i + 1]) {
                windows.push([Math.max(start, sampleUs[i] - step), Math.min(end, sampleUs[i] + step)])
            }
        }
        windows.push([Math.max(start, bestU - step), Math.min(end, bestU + step)])

        const merged = this.mergeProjectedWindows(windows, start, end)
        const roots: number[] = []
        for (const [lo, hi] of merged) {
            const root = this.refineProjectedRoot(p, lo, hi, evalPoint, evalD1, evalD2)
            if (root === undefined) continue
            const normalized = normalizeParam(root)
            if (roots.some((u) => Math.abs(normalizeParam(u) - normalized) <= Precision.CURVE_PARAM_EPS * 8)) continue
            roots.push(root)
        }

        let picked = normalizeParam(bestU)
        let pickedDistSq = bestDistSq
        for (const root of roots) {
            const normalized = normalizeParam(root)
            const eq = this.projectedEquation(normalized, p, evalPoint, evalD1, evalD2)
            if (
                eq.distanceSq < pickedDistSq - Precision.CURVE_LENGTH_EPS_SQ * 4 ||
                (Math.abs(eq.distanceSq - pickedDistSq) <= Precision.CURVE_LENGTH_EPS_SQ * 4 && this.compareParamForTieBreak(normalized, picked) < 0)
            ) {
                picked = normalized
                pickedDistSq = eq.distanceSq
            }
        }
        return picked
    }

    protected projectedEquation(
        u: number,
        p: Vec2,
        evalPoint: (u: number) => Vec2,
        evalD1: (u: number) => Vec2,
        evalD2: (u: number) => Vec2,
    ) {
        const c = evalPoint(u)
        const d1 = evalD1(u)
        const d2 = evalD2(u)
        const dx = c.x - p.x
        const dy = c.y - p.y
        return {
            f: dx * d1.x + dy * d1.y,
            fp: d1.dot(d1) + dx * d2.x + dy * d2.y,
            distanceSq: dx * dx + dy * dy,
        }
    }

    protected refineProjectedRoot(
        p: Vec2,
        lo0: number,
        hi0: number,
        evalPoint: (u: number) => Vec2,
        evalD1: (u: number) => Vec2,
        evalD2: (u: number) => Vec2,
    ) {
        let lo = Math.min(lo0, hi0)
        let hi = Math.max(lo0, hi0)
        if (hi - lo <= Precision.CURVE_PARAM_EPS * 4) return (lo + hi) * 0.5

        let u = (lo + hi) * 0.5
        let eqLo = this.projectedEquation(lo, p, evalPoint, evalD1, evalD2)
        let eqHi = this.projectedEquation(hi, p, evalPoint, evalD1, evalD2)
        let bestU = u
        let bestDistSq = this.projectedEquation(u, p, evalPoint, evalD1, evalD2).distanceSq

        for (let iter = 0; iter < Precision.CURVE_MAX_ITER; iter++) {
            const eq = this.projectedEquation(u, p, evalPoint, evalD1, evalD2)
            if (eq.distanceSq < bestDistSq) {
                bestDistSq = eq.distanceSq
                bestU = u
            }
            if (Math.abs(eq.f) <= Precision.CURVE_LENGTH_EPS) return u

            let next = Number.NaN
            if (Math.abs(eq.fp) > Precision.CURVE_NEWTON_EPS) {
                next = u - eq.f / eq.fp
            }
            if (!Number.isFinite(next) || next <= lo || next >= hi) {
                next = (lo + hi) * 0.5
            }

            if (eqLo.f * eq.f <= 0) {
                hi = u
                eqHi = eq
            } else if (eq.f * eqHi.f <= 0) {
                lo = u
                eqLo = eq
            } else {
                if (next < u) {
                    hi = u
                    eqHi = eq
                } else {
                    lo = u
                    eqLo = eq
                }
            }

            if (hi - lo <= Precision.CURVE_PARAM_EPS * 4) {
                const mid = (lo + hi) * 0.5
                const eqMid = this.projectedEquation(mid, p, evalPoint, evalD1, evalD2)
                return eqMid.distanceSq < bestDistSq ? mid : bestU
            }
            u = next
        }

        return bestU
    }

    private mergeProjectedWindows(windows: Array<[number, number]>, start: number, end: number) {
        const sorted = windows
            .map(([a, b]) => [Math.max(start, Math.min(a, b)), Math.min(end, Math.max(a, b))] as [number, number])
            .filter(([a, b]) => b - a > Precision.CURVE_PARAM_EPS)
            .sort((lhs, rhs) => lhs[0] - rhs[0] || lhs[1] - rhs[1])
        if (sorted.length === 0) return []

        const merged: Array<[number, number]> = [sorted[0]]
        for (let i = 1; i < sorted.length; i++) {
            const cur = sorted[i]
            const prev = merged[merged.length - 1]
            if (cur[0] <= prev[1] + Precision.CURVE_PARAM_EPS * 8) {
                prev[1] = Math.max(prev[1], cur[1])
            } else {
                merged.push(cur)
            }
        }
        return merged
    }

    /**
     * 对当前椭圆应用仿射变换，并从变换后的形状提取规范参数
     * （center、rx、ry、rotation）。
     */
    protected transformedEllipseParams(m: import('../core/mat3').Mat3) {
        const me = m.toArray()
        const a = me[0], b = me[1], c = me[3], d = me[4]

        const cr = Math.cos(this._rotation)
        const sr = Math.sin(this._rotation)

        const ex = new Vec2(this._rx * cr, this._rx * sr)
        const ey = new Vec2(-this._ry * sr, this._ry * cr)

        const vx = new Vec2(a * ex.x + b * ex.y, c * ex.x + d * ex.y)
        const vy = new Vec2(a * ey.x + b * ey.y, c * ey.x + d * ey.y)

        const gxx = vx.x * vx.x + vy.x * vy.x
        const gxy = vx.x * vx.y + vy.x * vy.y
        const gyy = vx.y * vx.y + vy.y * vy.y

        const trace = gxx + gyy
        const delta = Math.sqrt(Math.max(0, (gxx - gyy) * (gxx - gyy) + 4 * gxy * gxy))
        let lambdaMax = (trace + delta) * 0.5
        let lambdaMin = (trace - delta) * 0.5
        lambdaMax = Math.max(0, lambdaMax)
        lambdaMin = Math.max(0, lambdaMin)

        const rx = Math.sqrt(lambdaMax)
        const ry = Math.sqrt(lambdaMin)
        const rotation = 0.5 * Math.atan2(2 * gxy, gxx - gyy)

        const center = m.transformedPoint(this._center)
        const mirrored = a * d - b * c < 0
        return { center, rx, ry, rotation, mirrored }
    }

    /** 将椭圆上的点反解为角参数。 */
    protected angleFromPointOnEllipse(p: Vec2, center: Vec2, rx: number, ry: number, rotation: number) {
        const dx = p.x - center.x
        const dy = p.y - center.y
        const c = Math.cos(rotation)
        const s = Math.sin(rotation)
        const lx = c * dx + s * dy
        const ly = -s * dx + c * dy
        return Math.atan2(ly / ry, lx / rx)
    }
}
