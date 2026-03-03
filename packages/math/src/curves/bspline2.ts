import { EN_GEO_TYPE } from '../constants/geom_type'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBBSpline2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { Axis2D, type IClosestPointResult, type IWeightedPoint2 } from '../types/type_define'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Curve2 } from './curve2'
import { Interval } from './interval'

/**
 * B 样条构造选项。
 * - `expandedKnots` 与 `knots + multiplicities` 二选一或同时提供（同时提供需一致）。
 * - `weights` 省略时按全 1 处理。
 * - 第一版仅支持 `isPeriodic !== true`。
 */
export type IBSpline2Options = {
    expandedKnots?: readonly number[]
    knots?: readonly number[]
    multiplicities?: readonly number[]
    weights?: readonly number[]
    isPeriodic?: boolean
}

@RegisterGeom
/**
 * 二维有理 B 样条（NURBS）曲线。
 * 内部统一使用 expanded knot vector 存储与计算。
 */
export class BSpline2 extends Curve2 {
    public static readonly type = EN_GEO_TYPE.BSpline2

    /**
     * 控制点序列（内部存储）。
     * 约定：始终为深拷贝后的可变数组，不直接暴露引用给外部。
     */
    private _controlPoints: Vec2[]

    /**
     * 样条次数（degree）。
     * 约束：构造后保持 >= 1，且与控制点数量/节点向量长度匹配。
     */
    private _degree: number

    /**
     * 权重序列（与控制点一一对应）。
     * 约定：长度始终等于控制点数量；未传入时按全 1 处理。
     */
    private _weights: number[]

    /**
     * 展开后的节点向量（expanded knot vector）。
     * 约定：非递减；长度始终满足 n + p + 2（n 为控制点末索引，p 为次数）。
     */
    private _knots: number[]

    /**
     * 构造 B 样条曲线。
     * @param controlPoints 控制点数组。
     * @param degree 样条次数（`>=1`）。
     * @param options 节点、权重与周期配置。
     */
    constructor(controlPoints: readonly Vec2[], degree: number, options: IBSpline2Options = {}) {
        super()
        MathError.assert(Number.isInteger(degree) && degree >= 1, 'BSpline2: degree must be an integer >= 1')
        MathError.assert(controlPoints.length >= degree + 1, 'BSpline2: controlPoints.length must be >= degree + 1')
        MathError.assert(options.isPeriodic !== true, 'BSpline2: periodic is not supported in v1')

        this._degree = degree
        this._controlPoints = controlPoints.map((p) => p.clone())
        this.assertFiniteControlPoints(this._controlPoints)

        this._weights = this.resolveWeights(options.weights)
        this._knots = this.resolveKnots(options)
        this.validateExpandedKnots(this._knots, this._controlPoints.length, degree)

        const domainStart = this._knots[this._degree]
        const domainEnd = this._knots[this._knots.length - this._degree - 1]
        MathError.assert(domainEnd > domainStart, 'BSpline2: invalid parameter domain')
        this.setRange(new Interval(domainStart, domainEnd))
    }

    /** 控制点数组（返回深拷贝） */
    public get controlPoints() {
        return this._controlPoints.map((p) => p.clone())
    }

    /** 样条次数 */
    public get degree() {
        return this._degree
    }

    /** 展开节点向量（返回副本） */
    public get expandedKnots() {
        return [...this._knots]
    }

    /** 权重数组（返回副本） */
    public get weights() {
        return [...this._weights]
    }

    /**
     * 获取参数域内部的连续性断点参数。
     * 当 knot 重数 >= degree 时，可视为连续性下降断点。
     */
    public getContinuityBreakParams(eps = Precision.CURVE_PARAM_EPS): number[] {
        const breaks: number[] = []
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
        const uu = this.snapParam(u)

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
        const uu = this.snapParam(u)
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
        // 使用基类统一的“Newton + 二分”模板，保证边界与收敛行为一致。
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

        const uu = this.snapParam(u)
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
        // 先采样粗定位，再用 Newton 在局部窗口细化，避免直接迭代落入错误极值点。
        return this.solveClosestPointBySampleNewton(
            p,
            tol,
            96,
            (u) => this.pointAt(u),
            (u) => this.derivativeAt(u, 1),
            (u) => this.derivativeAt(u, 2),
            'BSpline2.closestPoint: failed to converge',
        )
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
        return Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainEnd - domainStart > eps
    }

    public override isBSpline(): this is BSpline2 {
        return true
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比样条。
     * @param eps 数值容差。
     * @returns 阶次、控制点、权重与节点向量逐项近似相等时返回 `true`。
     */
    public equals(other: BSpline2, eps = Precision.EPS) {
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
        return new BSpline2(this._controlPoints, this._degree, {
            expandedKnots: this._knots,
            weights: this._weights,
            isPeriodic: false,
        }) as this
    }

    public override dump(): IDBBSpline2 {
        return {
            type: BSpline2.type,
            controlPoints: this._controlPoints.map((p) => ({ x: p.x, y: p.y })),
            degree: this._degree,
            expandedKnots: [...this._knots],
            weights: [...this._weights],
            isPeriodic: false,
        }
    }

    public static load(data: IDBBSpline2) {
        return new BSpline2(
            data.controlPoints.map((p) => new Vec2(p.x, p.y)),
            data.degree,
            {
                expandedKnots: data.expandedKnots,
                weights: data.weights,
                isPeriodic: data.isPeriodic,
            },
        )
    }

    /**
     * 解析并校验权重。
     * @param weights 输入权重；未传时返回全 1。
     */
    private resolveWeights(weights?: readonly number[]) {
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

    /**
     * 解析并统一节点输入。
     * @param options 构造选项。
     * @returns 统一后的 expanded knots。
     */
    private resolveKnots(options: IBSpline2Options): number[] {
        const fromExpanded = options.expandedKnots ? [...options.expandedKnots] : undefined
        const fromCompact = options.knots && options.multiplicities
            ? BSpline2.expandKnots(options.knots, options.multiplicities)
            : undefined
        const resolved = fromExpanded ?? fromCompact

        if (!resolved) {
            MathError.throw('BSpline2: expandedKnots or (knots+multiplicities) is required')
        }

        if (fromExpanded && fromCompact) {
            MathError.assert(fromExpanded.length === fromCompact.length, 'BSpline2: expandedKnots mismatch with knots+multiplicities')
            for (let i = 0; i < fromExpanded.length; i++) {
                MathError.assert(
                    Precision.equal(fromExpanded[i], fromCompact[i], Precision.CURVE_PARAM_EPS),
                    'BSpline2: expandedKnots mismatch with knots+multiplicities',
                )
            }
        }

        return resolved
    }

    /**
     * 校验 expanded knots 基本合法性。
     * @param knots 展开节点向量。
     * @param controlPointCount 控制点数量。
     * @param degree 样条次数。
     */
    private validateExpandedKnots(knots: readonly number[], controlPointCount: number, degree: number) {
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

    /**
     * 校验控制点坐标有限性。
     * @param points 控制点数组。
     */
    private assertFiniteControlPoints(points: readonly Vec2[]) {
        for (const p of points) {
            MathError.assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'BSpline2: control point must be finite')
        }
    }

    /**
     * 转换为齐次控制点。
     * @returns 齐次点数组 `{x,y,w}`。
     */
    private homogeneousControlPoints() {
        const ret: IWeightedPoint2[] = []
        for (let i = 0; i < this._controlPoints.length; i++) {
            const w = this._weights[i]
            const p = this._controlPoints[i]
            ret.push({ x: p.x * w, y: p.y * w, w })
        }
        return ret
    }

    /**
     * 自适应积分计算弧长。
     * @param u0 起始参数。
     * @param u1 结束参数。
     * @param depth 当前递归深度。
     */
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
        const unique: number[] = []
        for (const knot of this._knots) {
            if (knot <= start + Precision.CURVE_PARAM_EPS || knot >= end - Precision.CURVE_PARAM_EPS) continue
            if (unique.length > 0 && Math.abs(unique[unique.length - 1] - knot) <= Precision.CURVE_PARAM_EPS) continue
            unique.push(knot)
        }
        return unique
    }

    private solveComponentExtremaInSpan(axis: Axis2D, u0: number, u1: number) {
        const roots: number[] = []
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
        // Degree-scaled sampling keeps low-order curves fast while giving higher-order curves
        // enough brackets for extrema detection without a single hard-coded global level.
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

    /**
     * 参数吸附到端点，避免边界浮点抖动。
     * @param u 输入参数。
     * @returns 吸附后的参数。
     */
    private snapParam(u: number) {
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)
        const start = this._range.start
        const end = this._range.end
        if (Math.abs(u - start) <= Precision.CURVE_PARAM_EPS) return start
        if (Math.abs(u - end) <= Precision.CURVE_PARAM_EPS) return end
        return u
    }

    private static fromHomogeneous(points: IWeightedPoint2[], degree: number, knots: number[]) {
        const cps: Vec2[] = []
        const ws: number[] = []
        for (const p of points) {
            MathError.assert(Math.abs(p.w) > Precision.CURVE_NEWTON_EPS, 'BSpline2.fromHomogeneous: invalid homogeneous weight')
            cps.push(new Vec2(p.x / p.w, p.y / p.w))
            ws.push(p.w)
        }
        return new BSpline2(cps, degree, { expandedKnots: knots, weights: ws, isPeriodic: false })
    }

    private static expandKnots(knots: readonly number[], multiplicities: readonly number[]) {
        MathError.assert(knots.length === multiplicities.length, 'BSpline2: knots and multiplicities length mismatch')

        const expanded: number[] = []
        for (let i = 0; i < knots.length; i++) {
            const m = multiplicities[i]
            MathError.assert(Number.isInteger(m) && m > 0, 'BSpline2: multiplicity must be positive integer')
            for (let j = 0; j < m; j++) expanded.push(knots[i])
        }
        return expanded
    }

    private static findSpan(n: number, p: number, u: number, U: readonly number[]) {
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

    private static knotMultiplicity(u: number, U: readonly number[]) {
        let s = 0
        for (const k of U) {
            if (Precision.equal(k, u, Precision.CURVE_PARAM_EPS)) s++
        }
        return s
    }

    private static insertKnotOnce(points: IWeightedPoint2[], knots: number[], degree: number, u: number) {
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

    private static basisFunctionDerivatives(span: number, u: number, p: number, n: number, U: readonly number[]) {
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
}
