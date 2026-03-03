import { EN_GEO_TYPE } from '../constants/geom_type'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBBSpline2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { Axis2D, type IClosestPointResult, type IVec2, type IWeightedPoint2 } from '../types/type_define'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Curve2 } from './curve2'
import { Interval } from './interval'

export type IBSpline2Param = {
    controlPoints: IVec2[]
    degree: number
    weights?: Array<number>
    isClosed?: boolean
    isPeriodic?: boolean
    knots: [number, number, ...number[]]
    multiplicities: [number, number, ...number[]]
}

@RegisterGeom

export class BSpline2 extends Curve2 {
    public static readonly type = EN_GEO_TYPE.BSpline2

    private _controlPoints: Vec2[]

    private _degree: number

    private _weights: Array<number>

    private _knots: Array<number>

    private _isPeriodic: boolean

    private _isClosed: boolean

    constructor(input: IBSpline2Param) {
        super()
        const { controlPoints, degree } = input
        MathError.assert(Number.isInteger(degree) && degree >= 1, 'BSpline2: degree must be an integer >= 1')
        MathError.assert(controlPoints.length >= degree + 1, 'BSpline2: controlPoints.length must be >= degree + 1')

        this._degree = degree
        this._controlPoints = controlPoints.map((p) => new Vec2(p))
        this.assertFiniteControlPoints(this._controlPoints)

        this._weights = this.resolveWeights(input.weights)
        this._knots = this.resolveKnots(input)
        this.validateExpandedKnots(this._knots, this._controlPoints.length, degree)

        const domainStart = this._knots[this._degree]
        const domainEnd = this._knots[this._knots.length - this._degree - 1]
        MathError.assert(domainEnd > domainStart, 'BSpline2: invalid parameter domain')
        this.setRange(new Interval(domainStart, domainEnd))

        this._isPeriodic = input.isPeriodic === true
        if (this._isPeriodic) {
            this.validatePeriodicInput(this._knots, input.multiplicities, domainStart, domainEnd)
            this._isClosed = true
        } else {
            this._isClosed = input.isClosed ?? this.endpointsAreNear()
        }
    }

    private static compactKnotDataFromExpanded(expandedKnots: ReadonlyArray<number>) {
        MathError.assert(expandedKnots.length >= 2, 'BSpline2.compactKnotDataFromExpanded: expandedKnots requires at least two values')
        const knots: Array<number> = []
        const multiplicities: Array<number> = []
        for (const value of expandedKnots) {
            if (
                knots.length === 0 ||
                !Precision.equal(value, knots[knots.length - 1], Precision.CURVE_PARAM_EPS)
            ) {
                knots.push(value)
                multiplicities.push(1)
            } else {
                multiplicities[multiplicities.length - 1]++
            }
        }
        return { knots, multiplicities }
    }

    public get controlPoints() {
        return this._controlPoints.map((p) => p.clone())
    }

    public get degree() {
        return this._degree
    }

    public get expandedKnots() {
        return [...this._knots]
    }

    public get weights() {
        return [...this._weights]
    }

    public get isPeriodic() {
        return this._isPeriodic
    }

    public override isClosed(): boolean {
        return this._isClosed
    }

    public getContinuityBreakParams(eps = Precision.CURVE_PARAM_EPS): Array<number> {
        const breaks: Array<number> = []
        const range = this._range
        for (let i = 0; i < this._knots.length;) {
            const knot = this._knots[i]
            let multiplicity = 1
            i++
            while (i < this._knots.length && Math.abs(this._knots[i] - knot) <= eps) {
                multiplicity++
                i++
            }
            if (multiplicity >= this._degree && knot > range.start + eps && knot < range.end - eps) {
                breaks.push(knot)
            }
        }
        return breaks
    }

    public override pointAt(u: number) {
        return this.derivatives(u, 0)[0]
    }

    public override tangentAt(u: number) {
        return this.derivativeAt(u, 1)
    }

    public override derivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'BSpline2.derivatives: n must be a non-negative integer')
        const uu = this.normalizeParamForEval(u)

        const p = this._degree
        const du = Math.min(n, p)

        const span = BSpline2.findSpan(this._controlPoints.length - 1, p, uu, this._knots)
        const ders = BSpline2.basisFunctionDerivatives(span, uu, p, du, this._knots)
        const pw = this.homogeneousControlPoints()

        const ckw: IWeightedPoint2[] = []
        for (let k = 0; k <= du; k++) {
            let x = 0
            let y = 0
            let w = 0
            for (let j = 0; j <= p; j++) {
                const idx = span - p + j
                const coeff = ders[k][j]
                x += coeff * pw[idx].x
                y += coeff * pw[idx].y
                w += coeff * pw[idx].w
            }
            ckw.push({ x, y, w })
        }

        MathError.assert(Math.abs(ckw[0].w) > Precision.CURVE_NEWTON_EPS, 'BSpline2.derivatives: rational weight is degenerate')

        const ret: Vec2[] = []
        for (let k = 0; k <= du; k++) {
            let vx = ckw[k].x
            let vy = ckw[k].y

            for (let i = 1; i <= k; i++) {
                const b = BSpline2.binomial(k, i) * ckw[i].w
                vx -= b * ret[k - i].x
                vy -= b * ret[k - i].y
            }

            ret.push(new Vec2(vx / ckw[0].w, vy / ckw[0].w))
        }

        for (let k = du + 1; k <= n; k++) {
            ret.push(Vec2.zero())
        }

        return ret
    }

    public override curvatureAt(u: number) {
        const d1 = this.derivativeAt(u, 1)
        const d2 = this.derivativeAt(u, 2)
        const denom = Math.pow(d1.lenSq(), 1.5)
        MathError.assert(denom > Precision.CURVE_NEWTON_EPS, 'BSpline2.curvatureAt: tangent is degenerate')
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
        MathError.assert(Number.isFinite(tol) && tol > 0, 'BSpline2.paramAtLength: tol must be > 0')

        const total = this.length()
        const start = this._range.start
        const end = this._range.end

        MathError.assert(
            s >= -tol && s <= total + tol,
            `BSpline2.paramAtLength: s out of range [0, ${total}]`,
        )

        if (s <= tol) return start
        if (total - s <= tol) return end

        const target = Math.min(total, Math.max(0, s))
        return this.solveParamByHybridNewton(
            target,
            start,
            end,
            tol,
            (u) => this.integrateLength(start, u),
            (u) => this.tangentAt(u).len(),
            'BSpline2.paramAtLength: failed to converge',
            start + (target / total) * (end - start),
        )
    }

    public override split(u: number) {
        const parts = this._range.split(u, Precision.CURVE_PARAM_EPS)
        if (parts.length === 0) return []

        const uu = this.normalizeParamForEval(u)
        const p = this._degree
        const U = [...this._knots]
        const n = this._controlPoints.length - 1
        const k = BSpline2.findSpan(n, p, uu, U)
        const s = BSpline2.knotMultiplicity(uu, U)

        let pw = this.homogeneousControlPoints()
        let knots = U
        const r = p - s
        for (let i = 0; i < r; i++) {
            const inserted = BSpline2.insertKnotOnce(pw, knots, p, uu)
            pw = inserted.points
            knots = inserted.knots
        }

        const leftEnd = k - s
        const leftPw = pw.slice(0, leftEnd + 1)
        const rightPw = pw.slice(leftEnd)

        const leftKnots = [...U.slice(0, k + 1), ...new Array<number>(p - s + 1).fill(uu)]
        const rightKnots = [...new Array<number>(p + 1).fill(uu), ...U.slice(k + 1)]

        const left = BSpline2.fromHomogeneous(leftPw, p, leftKnots)
        const right = BSpline2.fromHomogeneous(rightPw, p, rightKnots)

        return [left, right].filter((c) => c.length() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range)
        if (range.length() <= Precision.CURVE_LENGTH_EPS) return []

        const fullStart = this._range.start
        const fullEnd = this._range.end

        let cur: BSpline2 = this.clone()

        if (range.end < fullEnd - Precision.CURVE_PARAM_EPS) {
            const s = cur.split(range.end)
            MathError.assert(s.length > 0, 'BSpline2.trim: split at end failed')
            cur = s[0]
        }

        if (range.start > fullStart + Precision.CURVE_PARAM_EPS) {
            const s = cur.split(range.start)
            MathError.assert(s.length > 0, 'BSpline2.trim: split at start failed')
            cur = s[s.length - 1]
        }

        return cur.length() > Precision.CURVE_LENGTH_EPS ? [cur] : []
    }

    public override reverse() {
        const m = this._knots.length - 1
        const start = this._range.start
        const end = this._range.end

        this._controlPoints.reverse()
        this._weights.reverse()

        const nextKnots = new Array<number>(this._knots.length)
        for (let i = 0; i <= m; i++) {
            nextKnots[i] = start + end - this._knots[m - i]
        }
        this._knots = nextKnots
        this.setRange(new Interval(this._knots[this._degree], this._knots[this._knots.length - this._degree - 1]))
        return this
    }

    public override transform(m: Mat3) {
        const next = this._controlPoints.map((p) => m.transformedPoint(p))
        this.assertFiniteControlPoints(next)
        this._controlPoints = next
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override closestPoint(p: Vec2, tol = Precision.CURVE_LENGTH_EPS): IClosestPointResult {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'BSpline2.closestPoint: tol must be > 0')
        const result = this.solveClosestPointBySampleNewton(
            p,
            tol,
            96,
            (u) => this.pointAt(u),
            (u) => this.derivativeAt(u, 1),
            (u) => this.derivativeAt(u, 2),
            'BSpline2.closestPoint: failed to converge',
            this._isPeriodic
                ? (a, b) => this.normalizePeriodicParam(a) - this.normalizePeriodicParam(b)
                : undefined,
        )
        if (!this._isPeriodic) return result
        const param = this.normalizePeriodicParam(result.param)
        const point = this.pointAt(param)
        return { point, param, distance: point.distanceTo(p) }
    }

    public override boundingBox(accurate = false) {
        const controlBox = Box2.fromPoints(this._controlPoints)
        if (!accurate) return controlBox

        const range = this.getRange()
        const spanBounds = this.buildBBoxSpanBounds()
        const candidates: Vec2[] = [
            this.pointAt(range.start),
            this.pointAt(range.end),
        ]

        for (const [u0, u1] of spanBounds) {
            const xRoots = this.solveComponentExtremaInSpan(Axis2D.X, u0, u1)
            const yRoots = this.solveComponentExtremaInSpan(Axis2D.Y, u0, u1)
            for (const u of [...xRoots, ...yRoots]) {
                if (!range.contains(u)) continue
                candidates.push(this.pointAt(u))
            }
        }

        if (candidates.length < 2) return controlBox
        const tightBox = Box2.fromPoints(candidates)
        return this.expandBoxBySpanSamples(tightBox, spanBounds)
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        if (!Number.isInteger(this._degree) || this._degree < 1) return false
        if (this._controlPoints.length < this._degree + 1) return false
        if (this._weights.length !== this._controlPoints.length) return false
        if (this._weights.some((w) => !Number.isFinite(w) || w <= eps)) return false
        if (this._knots.length !== this._controlPoints.length + this._degree + 1) return false

        for (let i = 1; i < this._knots.length; i++) {
            if (this._knots[i] < this._knots[i - 1]) return false
        }

        const domainStart = this._knots[this._degree]
        const domainEnd = this._knots[this._knots.length - this._degree - 1]
        if (!Number.isFinite(domainStart) || !Number.isFinite(domainEnd) || domainEnd - domainStart <= eps) return false
        if (this._isPeriodic) {
            if (!this._isClosed) return false
            if (domainEnd - domainStart <= Precision.CURVE_PARAM_EPS) return false
            const startMul = BSpline2.endpointMultiplicity(this._knots, true)
            const endMul = BSpline2.endpointMultiplicity(this._knots, false)
            if (startMul !== endMul) return false
        }
        return true
    }

    public override isBSpline(): this is BSpline2 {
        return true
    }

    public equals(other: BSpline2, eps = Precision.EPS) {
        if (this._isPeriodic !== other._isPeriodic) return false
        if (this._isClosed !== other._isClosed) return false
        if (this._degree !== other._degree) return false
        if (this._controlPoints.length !== other._controlPoints.length) return false
        if (this._weights.length !== other._weights.length) return false
        if (this._knots.length !== other._knots.length) return false

        for (let i = 0; i < this._controlPoints.length; i++) {
            if (!this._controlPoints[i].equals(other._controlPoints[i], eps)) return false
            if (!Precision.equal(this._weights[i], other._weights[i], eps)) return false
        }
        for (let i = 0; i < this._knots.length; i++) {
            if (!Precision.equal(this._knots[i], other._knots[i], eps)) return false
        }
        return true
    }

    public override clone(): this {
        const compact = BSpline2.compactKnotDataFromExpanded(this._knots)
        return new BSpline2({
            controlPoints: this._controlPoints,
            degree: this._degree,
            knots: BSpline2.requireAtLeastTwo(compact.knots, 'BSpline2.clone: knots requires at least two values'),
            multiplicities: BSpline2.requireAtLeastTwo(compact.multiplicities, 'BSpline2.clone: multiplicities requires at least two values'),
            weights: this._weights,
            isClosed: this._isClosed,
            isPeriodic: this._isPeriodic,
        }) as this
    }

    public override dump(): IDBBSpline2 {
        const compact = BSpline2.compactKnotDataFromExpanded(this._knots)
        return {
            type: BSpline2.type,
            controlPoints: this._controlPoints.map((p) => ({ x: p.x, y: p.y })),
            degree: this._degree,
            knots: compact.knots,
            multiplicities: compact.multiplicities,
            weights: [...this._weights],
            isClosed: this._isClosed,
            isPeriodic: this._isPeriodic,
        }
    }

    public static load(data: IDBBSpline2) {
        MathError.assert(data.knots && data.multiplicities, 'BSpline2.load: knots and multiplicities are required')
        return new BSpline2({
            controlPoints: data.controlPoints.map((p) => new Vec2(p.x, p.y)),
            degree: data.degree,
            knots: BSpline2.requireAtLeastTwo(data.knots, 'BSpline2.load: knots requires at least two values'),
            multiplicities: BSpline2.requireAtLeastTwo(data.multiplicities, 'BSpline2.load: multiplicities requires at least two values'),
            weights: data.weights,
            isClosed: data.isClosed,
            isPeriodic: data.isPeriodic,
        })
    }

    private resolveWeights(weights?: ReadonlyArray<number>) {
        if (!weights) {
            return new Array<number>(this._controlPoints.length).fill(1)
        }

        MathError.assert(weights.length === this._controlPoints.length, 'BSpline2: weights.length must equal controlPoints.length')
        const w = [...weights]
        for (const wi of w) {
            MathError.assert(Number.isFinite(wi) && wi > 0, 'BSpline2: weight must be > 0')
        }
        return w
    }

    private resolveKnots(input: IBSpline2Param): Array<number> {
        return BSpline2.expandKnots(input.knots, input.multiplicities)
    }

    private validateExpandedKnots(knots: ReadonlyArray<number>, controlPointCount: number, degree: number) {
        MathError.assert(
            knots.length === controlPointCount + degree + 1,
            'BSpline2: invalid expandedKnots length',
        )

        for (const k of knots) {
            MathError.assert(Number.isFinite(k), 'BSpline2: knot must be finite')
        }

        for (let i = 1; i < knots.length; i++) {
            MathError.assert(knots[i] >= knots[i - 1], 'BSpline2: knots must be non-decreasing')
        }
    }

    private assertFiniteControlPoints(points: readonly Vec2[]) {
        for (const p of points) {
            MathError.assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'BSpline2: control point must be finite')
        }
    }

    private homogeneousControlPoints() {
        const ret: IWeightedPoint2[] = []
        for (let i = 0; i < this._controlPoints.length; i++) {
            const w = this._weights[i]
            const p = this._controlPoints[i]
            ret.push({ x: p.x * w, y: p.y * w, w })
        }
        return ret
    }

    private integrateLength(u0: number, u1: number, depth = 0): number {
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

    private gaussLegendre5(f: (u: number) => number, a: number, b: number) {
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

    private buildBBoxSpanBounds() {
        const range = this.getRange()
        const boundaries = [range.start, range.end, ...this.getUniqueKnotsInRange(range.start, range.end)]
        const sorted = [...new Set(boundaries)]
            .filter((u) => Number.isFinite(u) && range.contains(u))
            .sort((a, b) => a - b)

        const spans: Array<[number, number]> = []
        for (let i = 0; i < sorted.length - 1; i++) {
            const u0 = sorted[i]
            const u1 = sorted[i + 1]
            if (u1 - u0 <= Precision.CURVE_PARAM_EPS) continue
            spans.push([u0, u1])
        }
        return spans
    }

    private getUniqueKnotsInRange(start: number, end: number) {
        const unique: Array<number> = []
        for (const knot of this._knots) {
            if (knot <= start + Precision.CURVE_PARAM_EPS || knot >= end - Precision.CURVE_PARAM_EPS) continue
            if (unique.length > 0 && Math.abs(unique[unique.length - 1] - knot) <= Precision.CURVE_PARAM_EPS) continue
            unique.push(knot)
        }
        return unique
    }

    private solveComponentExtremaInSpan(axis: Axis2D, u0: number, u1: number) {
        const roots: Array<number> = []
        const brackets = this.findRootBrackets(axis, u0, u1)
        for (const [b0, b1] of brackets) {
            const root = this.refineRootBracketedNewton(axis, b0, b1)
            if (root === undefined) continue
            const clamped = this.clampParamForBBox(root)
            if (clamped < u0 - Precision.CURVE_PARAM_EPS || clamped > u1 + Precision.CURVE_PARAM_EPS) continue
            if (roots.some((u) => Math.abs(u - clamped) <= Precision.CURVE_PARAM_EPS * 4)) continue
            roots.push(clamped)
        }
        return roots
    }

    private findRootBrackets(axis: Axis2D, u0: number, u1: number) {
        const brackets: Array<[number, number]> = []
        const steps = this.bboxRootSampleCount()
        const du = (u1 - u0) / steps

        let prevU = u0
        let prevF = this.componentDerivative(axis, prevU, 1)
        for (let i = 1; i <= steps; i++) {
            const curU = i === steps ? u1 : (u0 + du * i)
            const curF = this.componentDerivative(axis, curU, 1)
            if (Math.abs(prevF) <= Precision.CURVE_NEWTON_EPS) {
                brackets.push([
                    Math.max(u0, prevU - du),
                    Math.min(u1, prevU + du),
                ])
            }
            if (Math.abs(curF) <= Precision.CURVE_NEWTON_EPS || prevF * curF <= 0) {
                brackets.push([prevU, curU])
            }
            prevU = curU
            prevF = curF
        }

        return this.mergeBrackets(brackets, u0, u1)
    }

    private refineRootBracketedNewton(axis: Axis2D, uL: number, uR: number) {
        let lo = this.clampParamForBBox(Math.min(uL, uR))
        let hi = this.clampParamForBBox(Math.max(uL, uR))
        if (hi - lo <= Precision.CURVE_PARAM_EPS) return undefined

        let fLo = this.componentDerivative(axis, lo, 1)
        let fHi = this.componentDerivative(axis, hi, 1)
        let u = (lo + hi) * 0.5

        for (let iter = 0; iter < Precision.CURVE_MAX_ITER; iter++) {
            const f = this.componentDerivative(axis, u, 1)
            if (Math.abs(f) <= Precision.CURVE_NEWTON_EPS) return u

            const d2 = this.componentDerivative(axis, u, 2)
            let next = Number.NaN
            if (Number.isFinite(d2) && Math.abs(d2) > Precision.CURVE_NEWTON_EPS) {
                next = u - f / d2
            }
            if (!Number.isFinite(next) || next <= lo || next >= hi) {
                next = (lo + hi) * 0.5
            }

            if (fLo * f <= 0) {
                hi = u
                fHi = f
            } else if (f * fHi <= 0) {
                lo = u
                fLo = f
            } else {
                if (next < u) hi = u
                else lo = u
                fLo = this.componentDerivative(axis, lo, 1)
                fHi = this.componentDerivative(axis, hi, 1)
            }

            if (hi - lo <= Precision.CURVE_PARAM_EPS) {
                const mid = (lo + hi) * 0.5
                if (Math.abs(this.componentDerivative(axis, mid, 1)) <= Precision.CURVE_NEWTON_EPS * 10) {
                    return mid
                }
                return undefined
            }
            u = next
        }
        return undefined
    }

    private mergeBrackets(brackets: Array<[number, number]>, u0: number, u1: number) {
        if (brackets.length === 0) return []
        const sorted = brackets
            .map(([a, b]) => [this.clampParamForBBox(Math.min(a, b)), this.clampParamForBBox(Math.max(a, b))] as [number, number])
            .filter(([a, b]) => b - a > Precision.CURVE_PARAM_EPS)
            .sort((lhs, rhs) => lhs[0] - rhs[0] || lhs[1] - rhs[1])
        if (sorted.length === 0) return []

        const merged: Array<[number, number]> = [sorted[0]]
        for (let i = 1; i < sorted.length; i++) {
            const cur = sorted[i]
            const prev = merged[merged.length - 1]
            if (cur[0] <= prev[1] + Precision.CURVE_PARAM_EPS) {
                prev[1] = Math.max(prev[1], cur[1])
                continue
            }
            merged.push(cur)
        }

        for (const item of merged) {
            item[0] = Math.max(item[0], u0)
            item[1] = Math.min(item[1], u1)
        }
        return merged.filter(([a, b]) => b - a > Precision.CURVE_PARAM_EPS)
    }

    private bboxRootSampleCount() {
        return Math.max(8, Math.min(32, this._degree * 4))
    }

    private expandBoxBySpanSamples(box: Box2, spans: Array<[number, number]>) {
        let expanded = box
        const samplesPerSpan = Math.max(4, Math.floor(this.bboxRootSampleCount() / 2))
        for (const [u0, u1] of spans) {
            for (let i = 1; i < samplesPerSpan; i++) {
                const t = i / samplesPerSpan
                const u = u0 + (u1 - u0) * t
                const p = this.pointAt(u)
                if (!expanded.containsPoint(p)) {
                    expanded = expanded.expandByPoint(p)
                }
            }
        }
        return expanded
    }

    private componentDerivative(axis: Axis2D, u: number, order: 1 | 2) {
        const d = this.derivativeAt(this.clampParamForBBox(u), order)
        return axis === Axis2D.X ? d.x : d.y
    }

    private clampParamForBBox(u: number) {
        const range = this._range
        if (u <= range.start) return range.start
        if (u >= range.end) return range.end
        return u
    }

    private normalizeParamForEval(u: number) {
        if (this._isPeriodic) {
            return this.normalizePeriodicParam(u)
        }
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)
        return this.snapBoundary(u)
    }

    private normalizePeriodicParam(u: number) {
        const start = this._range.start
        const period = this._range.length()
        let local = (u - start) % period
        if (local < 0) local += period
        return this.snapBoundary(start + local)
    }

    private snapBoundary(u: number) {
        const start = this._range.start
        const end = this._range.end
        if (Math.abs(u - start) <= Precision.CURVE_PARAM_EPS) return start
        if (Math.abs(u - end) <= Precision.CURVE_PARAM_EPS) {
            return this._isPeriodic ? start : end
        }
        return u
    }

    private static fromHomogeneous(points: IWeightedPoint2[], degree: number, knots: Array<number>) {
        const cps: Vec2[] = []
        const ws: Array<number> = []
        for (const p of points) {
            MathError.assert(Math.abs(p.w) > Precision.CURVE_NEWTON_EPS, 'BSpline2.fromHomogeneous: invalid homogeneous weight')
            cps.push(new Vec2(p.x / p.w, p.y / p.w))
            ws.push(p.w)
        }
        const compact = BSpline2.compactKnotDataFromExpanded(knots)
        return new BSpline2({
            controlPoints: cps,
            degree,
            knots: BSpline2.requireAtLeastTwo(compact.knots, 'BSpline2.fromHomogeneous: knots requires at least two values'),
            multiplicities: BSpline2.requireAtLeastTwo(compact.multiplicities, 'BSpline2.fromHomogeneous: multiplicities requires at least two values'),
            weights: ws,
            isClosed: false,
            isPeriodic: false,
        })
    }

    private static requireAtLeastTwo(values: ReadonlyArray<number>, errorMessage: string): [number, number, ...number[]] {
        MathError.assert(values.length >= 2, errorMessage)
        return [values[0], values[1], ...values.slice(2)]
    }

    private static endpointMultiplicity(knots: ReadonlyArray<number>, atStart: boolean) {
        if (knots.length === 0) return 0
        const v = atStart ? knots[0] : knots[knots.length - 1]
        let count = 0
        if (atStart) {
            for (let i = 0; i < knots.length; i++) {
                if (!Precision.equal(knots[i], v, Precision.CURVE_PARAM_EPS)) break
                count++
            }
        } else {
            for (let i = knots.length - 1; i >= 0; i--) {
                if (!Precision.equal(knots[i], v, Precision.CURVE_PARAM_EPS)) break
                count++
            }
        }
        return count
    }

    private static expandKnots(knots: ReadonlyArray<number>, multiplicities: ReadonlyArray<number>) {
        MathError.assert(knots.length === multiplicities.length, 'BSpline2: knots and multiplicities length mismatch')

        const expanded: Array<number> = []
        for (let i = 0; i < knots.length; i++) {
            const m = multiplicities[i]
            MathError.assert(Number.isInteger(m) && m > 0, 'BSpline2: multiplicity must be positive integer')
            for (let j = 0; j < m; j++) expanded.push(knots[i])
        }
        return expanded
    }

    private static findSpan(n: number, p: number, u: number, U: ReadonlyArray<number>) {
        if (u >= U[n + 1] - Precision.CURVE_PARAM_EPS) return n
        if (u <= U[p] + Precision.CURVE_PARAM_EPS) return p

        let low = p
        let high = n + 1
        let mid = Math.floor((low + high) * 0.5)
        while (u < U[mid] || u >= U[mid + 1]) {
            if (u < U[mid]) high = mid
            else low = mid
            mid = Math.floor((low + high) * 0.5)
        }
        return mid
    }

    private static knotMultiplicity(u: number, U: ReadonlyArray<number>) {
        let s = 0
        for (const k of U) {
            if (Precision.equal(k, u, Precision.CURVE_PARAM_EPS)) s++
        }
        return s
    }

    private static insertKnotOnce(points: IWeightedPoint2[], knots: Array<number>, degree: number, u: number) {
        const n = points.length - 1
        const k = BSpline2.findSpan(n, degree, u, knots)
        const s = BSpline2.knotMultiplicity(u, knots)

        const outPoints = new Array<IWeightedPoint2>(points.length + 1)
        const outKnots = new Array<number>(knots.length + 1)

        for (let i = 0; i <= k; i++) outKnots[i] = knots[i]
        outKnots[k + 1] = u
        for (let i = k + 1; i < knots.length; i++) outKnots[i + 1] = knots[i]

        for (let i = 0; i <= k - degree; i++) outPoints[i] = points[i]
        for (let i = k - s; i <= n; i++) outPoints[i + 1] = points[i]

        for (let i = k - degree + 1; i <= k - s; i++) {
            const denom = knots[i + degree] - knots[i]
            const alpha = Math.abs(denom) <= Precision.CURVE_NEWTON_EPS ? 0 : (u - knots[i]) / denom
            const p0 = points[i - 1]
            const p1 = points[i]
            outPoints[i] = {
                x: (1 - alpha) * p0.x + alpha * p1.x,
                y: (1 - alpha) * p0.y + alpha * p1.y,
                w: (1 - alpha) * p0.w + alpha * p1.w,
            }
        }

        return { points: outPoints, knots: outKnots }
    }

    private static basisFunctionDerivatives(span: number, u: number, p: number, n: number, U: ReadonlyArray<number>) {
        const ndu = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0))
        const left = new Array<number>(p + 1).fill(0)
        const right = new Array<number>(p + 1).fill(0)

        ndu[0][0] = 1
        for (let j = 1; j <= p; j++) {
            left[j] = u - U[span + 1 - j]
            right[j] = U[span + j] - u
            let saved = 0

            for (let r = 0; r < j; r++) {
                ndu[j][r] = right[r + 1] + left[j - r]
                const denom = ndu[j][r]
                const temp = Math.abs(denom) <= Precision.CURVE_NEWTON_EPS ? 0 : ndu[r][j - 1] / denom
                ndu[r][j] = saved + right[r + 1] * temp
                saved = left[j - r] * temp
            }
            ndu[j][j] = saved
        }

        const ders = Array.from({ length: n + 1 }, () => new Array<number>(p + 1).fill(0))
        for (let j = 0; j <= p; j++) {
            ders[0][j] = ndu[j][p]
        }

        const a = [new Array<number>(p + 1).fill(0), new Array<number>(p + 1).fill(0)]
        for (let r = 0; r <= p; r++) {
            let s1 = 0
            let s2 = 1
            a[0][0] = 1

            for (let k = 1; k <= n; k++) {
                let d = 0
                const rk = r - k
                const pk = p - k

                if (r >= k) {
                    const denom = ndu[pk + 1][rk]
                    a[s2][0] = Math.abs(denom) <= Precision.CURVE_NEWTON_EPS ? 0 : a[s1][0] / denom
                    d = a[s2][0] * ndu[rk][pk]
                }

                const j1 = rk >= -1 ? 1 : -rk
                const j2 = (r - 1 <= pk) ? (k - 1) : (p - r)

                for (let j = j1; j <= j2; j++) {
                    const denom = ndu[pk + 1][rk + j]
                    a[s2][j] = Math.abs(denom) <= Precision.CURVE_NEWTON_EPS
                        ? 0
                        : (a[s1][j] - a[s1][j - 1]) / denom
                    d += a[s2][j] * ndu[rk + j][pk]
                }

                if (r <= pk) {
                    const denom = ndu[pk + 1][r]
                    a[s2][k] = Math.abs(denom) <= Precision.CURVE_NEWTON_EPS ? 0 : -a[s1][k - 1] / denom
                    d += a[s2][k] * ndu[r][pk]
                }

                ders[k][r] = d
                const tmp = s1
                s1 = s2
                s2 = tmp
            }
        }

        let scale = p
        for (let k = 1; k <= n; k++) {
            for (let j = 0; j <= p; j++) {
                ders[k][j] *= scale
            }
            scale *= (p - k)
        }

        return ders
    }

    private static binomial(n: number, k: number) {
        if (k < 0 || k > n) return 0
        if (k === 0 || k === n) return 1
        let kk = k
        if (kk > n - kk) kk = n - kk
        let result = 1
        for (let i = 1; i <= kk; i++) {
            result = (result * (n - kk + i)) / i
        }
        return result
    }

    private validatePeriodicInput(knots: ReadonlyArray<number>, multiplicities: ReadonlyArray<number> | undefined, domainStart: number, domainEnd: number) {
        if (!(domainEnd - domainStart > Precision.CURVE_PARAM_EPS)) {
            MathError.throw('BSpline2: invalid periodic input')
        }

        if (multiplicities && multiplicities.length > 0) {
            if (multiplicities[0] !== multiplicities[multiplicities.length - 1]) {
                MathError.throw('BSpline2: invalid periodic input')
            }
            return
        }

        const startMul = BSpline2.endpointMultiplicity(knots, true)
        const endMul = BSpline2.endpointMultiplicity(knots, false)
        if (startMul !== endMul) {
            MathError.throw('BSpline2: invalid periodic input')
        }
    }

    private endpointsAreNear(eps = Precision.CURVE_LENGTH_EPS) {
        const start = this._range.start
        const end = this._range.end
        return this.pointAt(start).distanceTo(this.pointAt(end)) <= eps
    }
}
