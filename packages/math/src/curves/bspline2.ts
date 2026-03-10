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
import { PeriodInterval } from './period_interval'

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

    /**
     * 初始化 B 样条曲线并校验输入约束。
     */
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

    /**
     * 将展开结向量压缩为唯一结值与重数。
     */
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

    /**
     * 返回控制点副本，避免外部修改内部状态。
     */
    public get controlPoints() {
        return this._controlPoints.map((p) => p.clone())
    }

    /**
     * 返回样条曲线的多项式次数。
     */
    public get degree() {
        return this._degree
    }

    /**
     * 返回展开结向量的副本。
     */
    public get expandedKnots() {
        return [...this._knots]
    }

    /**
     * 返回有理权重数组的副本。
     */
    public get weights() {
        return [...this._weights]
    }

    /**
     * 判断当前曲线是否使用周期参数化。
     */
    public get isPeriodic() {
        return this._isPeriodic
    }

    public override getDomain(): Interval {
        if (!this._isPeriodic) return this.getRange()
        return new PeriodInterval(this._range.start, this._range.end, this._range.end - this._range.start)
    }

    /**
     * 判断曲线在几何意义下是否闭合。
     */
    public override isClosed(): boolean {
        return this._isClosed
    }

    /**
     * 收集可能发生连续性下降的内部结参数。
     */
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

    /**
     * 宽松求值：参数越界时沿边界样条分段继续外推。
     */
    public override getPtAt(u: number) {
        MathError.assert(Number.isFinite(u), 'BSpline2.getPtAt: u must be finite')

        if (this._isPeriodic) {
            return this.evalPointOnDomain(this.normalizePeriodicParam(u))
        }
        if (this._range.contains(u, Precision.CURVE_PARAM_EPS)) {
            return this.evalPointOnDomain(this.snapBoundary(u))
        }
        return this.extrapolateFromBoundarySpan(u, u < this._range.start ? 'start' : 'end')
    }

    /**
     * 计算参数 u 处的一阶导数（切向量）。
     */
    public override getTangentAt(u: number) {
        return this.derivativeAt(u, 1)
    }

    /**
     * 使用有理 B 样条公式计算 0 阶到 n 阶导数。
     */
    public override getDerivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'BSpline2.getDerivatives: n must be a non-negative integer')
        const uu = this.normalizeParamForEval(u)
        return this.evalDerivativesOnDomain(uu, n)
    }

    /**
     * 计算参数 u 处的曲率绝对值。
     */
    public override curvatureAt(u: number) {
        const d1 = this.derivativeAt(u, 1)
        const d2 = this.derivativeAt(u, 2)
        const denom = Math.pow(d1.lenSq(), 1.5)
        MathError.assert(denom > Precision.CURVE_NEWTON_EPS, 'BSpline2.curvatureAt: tangent is degenerate')
        return Math.abs(d1.cross(d2)) / denom
    }

    /**
     * 计算全区间或子区间内的弧长。
     */
    public override getLength(range?: Interval) {
        if (!range) {
            return this.integrateLength(this._range.start, this._range.end)
        }

        this._range.assertContainsRange(range)
        return this.integrateLength(range.start, range.end)
    }

    /**
     * 计算参数域起点到 u 的累计弧长。
     */
    public override lengthAtParam(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.integrateLength(this._range.start, uu)
    }

    /**
     * 通过 Newton 与二分混合迭代将弧长反解为参数。
     */
    public override paramAtLength(s: number, tol = Precision.CURVE_LENGTH_EPS) {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'BSpline2.paramAtLength: tol must be > 0')

        const total = this.getLength()
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
            (u) => this.getTangentAt(u).len(),
            'BSpline2.paramAtLength: failed to converge',
            start + (target / total) * (end - start),
        )
    }

    /**
     * 通过插结在参数 u 处分割曲线。
     */
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

        return [left, right].filter((c) => c.getLength() > Precision.CURVE_LENGTH_EPS)
    }

    /**
     * 通过多次分割将曲线裁剪到目标参数区间。
     */
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

        return cur.getLength() > Precision.CURVE_LENGTH_EPS ? [cur] : []
    }

    /**
     * 原地反转控制点顺序与结向量方向。
     */
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

    /**
     * 原地对全部控制点应用仿射变换。
     */
    public override transform(m: Mat3) {
        const next = this._controlPoints.map((p) => m.transformedPoint(p))
        this.assertFiniteControlPoints(next)
        this._controlPoints = next
        return this
    }

    /**
     * 返回变换后的克隆对象，不修改当前曲线。
     */
    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    /**
     * 求解查询点 p 到曲线的最近点。
     */
    public override closestPoint(p: Vec2, tol = Precision.CURVE_LENGTH_EPS): IClosestPointResult {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'BSpline2.closestPoint: tol must be > 0')
        const result = this.solveClosestPointBySampleNewton(
            p,
            tol,
            96,
            (u) => this.getPtAt(u),
            (u) => this.derivativeAt(u, 1),
            (u) => this.derivativeAt(u, 2),
            'BSpline2.closestPoint: failed to converge',
            this._isPeriodic
                ? (a, b) => this.normalizePeriodicParam(a) - this.normalizePeriodicParam(b)
                : undefined,
        )
        if (!this._isPeriodic) return result
        const param = this.normalizePeriodicParam(result.param)
        const point = this.getPtAt(param)
        return { point, param, distance: point.distanceTo(p) }
    }

    public override getParamAt(p: Vec2) {
        const candidates: number[] = []
        const seeds = this.buildProjectedParamSeedIntervals(p)
        for (const [lo, hi] of seeds) {
            const root = this.refineProjectedParamRoot(p, lo, hi)
            if (root === undefined) continue
            const normalized = this.normalizeProjectedParamResult(root)
            if (candidates.some((u) => Math.abs(this.normalizeProjectedParamResult(u) - normalized) <= Precision.CURVE_PARAM_EPS * 8)) continue
            candidates.push(root)
        }

        let picked = this.normalizeProjectedParamResult(this.pickBestProjectedSampleParam(p))
        let pickedEq = this.projectedEquation(picked, p)
        for (const candidate of candidates) {
            const normalized = this.normalizeProjectedParamResult(candidate)
            const eq = this.projectedEquation(normalized, p)
            if (
                eq.distanceSq < pickedEq.distanceSq - Precision.CURVE_LENGTH_EPS_SQ * 4 ||
                (Math.abs(eq.distanceSq - pickedEq.distanceSq) <= Precision.CURVE_LENGTH_EPS_SQ * 4 && this.compareProjectedParam(normalized, picked) < 0)
            ) {
                picked = normalized
                pickedEq = eq
            }
        }
        return picked
    }

    /**
     * 计算包围盒：快速控制盒或基于极值根的紧包围盒。
     */
    public override getBBox(accurate = false) {
        const controlBox = Box2.fromPoints(this._controlPoints)
        if (!accurate) return controlBox

        const range = this.getRange()
        const spanBounds = this.buildBBoxSpanBounds()
        const candidates: Vec2[] = [
            this.getStartPt(),
            this.getEndPt(),
        ]

        for (const [u0, u1] of spanBounds) {
            const xRoots = this.solveComponentExtremaInSpan(Axis2D.X, u0, u1)
            const yRoots = this.solveComponentExtremaInSpan(Axis2D.Y, u0, u1)
            for (const u of [...xRoots, ...yRoots]) {
                if (!range.contains(u)) continue
                candidates.push(this.getPtAt(u))
            }
        }

        if (candidates.length < 2) return controlBox
        const tightBox = Box2.fromPoints(candidates)
        // Perf experiment: skip span sampling fallback.
        return tightBox
    }

    /**
     * 校验几何与参数化相关的不变量是否成立。
     */
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

    /**
     * 运行时类型守卫：判断是否为 B 样条曲线。
     */
    public override isBSpline(): this is BSpline2 {
        return true
    }

    /**
     * 在给定容差下比较两条 B 样条是否等价。
     */
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

    /**
     * 深拷贝当前曲线，并保留紧凑结数据语义。
     */
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

    /**
     * 将曲线序列化为可持久化的 dump 结构。
     */
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

    /**
     * 从序列化数据重建 B 样条曲线。
     */
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

    /**
     * 规范化可选权重输入并校验其为正值。
     */
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

    /**
     * 将紧凑的结值与重数展开为完整结向量。
     */
    private resolveKnots(input: IBSpline2Param): Array<number> {
        return BSpline2.expandKnots(input.knots, input.multiplicities)
    }

    /**
     * 校验展开结向量的长度、有限性与非递减顺序。
     */
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

    /**
     * 断言所有控制点坐标均为有限数。
     */
    private assertFiniteControlPoints(points: readonly Vec2[]) {
        for (const p of points) {
            MathError.assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'BSpline2: control point must be finite')
        }
    }

    /**
     * 构造用于有理求值的齐次控制点。
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

    private evalPointOnDomain(u: number) {
        return this.evalDerivativesOnDomain(u, 0)[0]
    }

    private evalDerivativesOnDomain(u: number, n: number) {
        const p = this._degree
        const du = Math.min(n, p)
        const ckw = this.homogeneousDerivativesAt(u, du)

        MathError.assert(Math.abs(ckw[0].w) > Precision.CURVE_NEWTON_EPS, 'BSpline2.getDerivatives: rational weight is degenerate')

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

    private homogeneousDerivativesAt(u: number, n: number) {
        const p = this._degree
        const du = Math.min(n, p)
        const span = BSpline2.findSpan(this._controlPoints.length - 1, p, u, this._knots)
        const ders = BSpline2.basisFunctionDerivatives(span, u, p, du, this._knots)
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
        return ckw
    }

    /**
     * 使用自适应 5 点高斯-勒让德积分递归计算弧长。
     */
    private integrateLength(u0: number, u1: number, depth = 0): number {
        if (u1 < u0) return 0
        const f = (u: number) => this.getTangentAt(u).len()

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

    /**
     * 在区间 [a, b] 上执行 5 点高斯-勒让德求积。
     */
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

    /**
     * 构建用于包围盒极值求解的参数分段。
     */
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

    /**
     * 收集给定参数区间内的唯一内部结值。
     */
    private getUniqueKnotsInRange(start: number, end: number) {
        const unique: Array<number> = []
        for (const knot of this._knots) {
            if (knot <= start + Precision.CURVE_PARAM_EPS || knot >= end - Precision.CURVE_PARAM_EPS) continue
            if (unique.length > 0 && Math.abs(unique[unique.length - 1] - knot) <= Precision.CURVE_PARAM_EPS) continue
            unique.push(knot)
        }
        return unique
    }

    /**
     * 在单个分段内求解某坐标分量导数的根。
     */
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

    /**
     * 通过导数采样符号变化构造根区间。
     */
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

    /**
     * 使用带保护的 Newton 迭代细化已包围的根。
     */
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

    /**
     * 合并重叠根区间并裁剪到目标参数范围。
     */
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

    /**
     * 选择包围盒极值求根时的采样密度。
     */
    private bboxRootSampleCount() {
        return Math.max(8, Math.min(32, this._degree * 4))
    }

    /**
     * 通过分段补采样扩展包围盒（兜底辅助）。
     */
    private expandBoxBySpanSamples(box: Box2, spans: Array<[number, number]>) {
        let expanded = box
        const samplesPerSpan = Math.max(4, Math.floor(this.bboxRootSampleCount() / 2))
        for (const [u0, u1] of spans) {
            for (let i = 1; i < samplesPerSpan; i++) {
                const t = i / samplesPerSpan
                const u = u0 + (u1 - u0) * t
                const p = this.getPtAt(u)
                if (!expanded.containsPoint(p)) {
                    expanded = expanded.expandByPoint(p)
                }
            }
        }
        return expanded
    }

    /**
     * 计算参数 u 处指定坐标分量的导数值。
     */
    private componentDerivative(axis: Axis2D, u: number, order: 1 | 2) {
        const d = this.derivativeAt(this.clampParamForBBox(u), order)
        return axis === Axis2D.X ? d.x : d.y
    }

    private projectedEquation(u: number, p: Vec2) {
        const ds = this.getDerivatives(u, 2)
        const c = ds[0]
        const d1 = ds[1]
        const d2 = ds[2]
        const dx = c.x - p.x
        const dy = c.y - p.y
        return {
            f: dx * d1.x + dy * d1.y,
            fp: d1.dot(d1) + dx * d2.x + dy * d2.y,
            distanceSq: dx * dx + dy * dy,
        }
    }

    private buildProjectedParamSeedIntervals(p: Vec2) {
        const range = this._range
        const boundaries = [range.start, ...this.getContinuityBreakParams(Precision.CURVE_PARAM_EPS), range.end]
        const windows: Array<[number, number]> = []
        const steps = this.bboxRootSampleCount()
        let bestU = range.start
        let bestDistSq = Number.POSITIVE_INFINITY
        let bestStep = Math.max(range.length() / Math.max(steps, 1), Precision.CURVE_PARAM_EPS * 8)

        for (let i = 0; i < boundaries.length - 1; i++) {
            const u0 = boundaries[i]
            const u1 = boundaries[i + 1]
            if (u1 - u0 <= Precision.CURVE_PARAM_EPS) continue
            const du = (u1 - u0) / steps
            const samples: Array<{ u: number; f: number; distanceSq: number }> = []
            for (let j = 0; j <= steps; j++) {
                const u = j === steps ? u1 : (u0 + du * j)
                const eq = this.projectedEquation(u, p)
                samples.push({ u, f: eq.f, distanceSq: eq.distanceSq })
                if (
                    eq.distanceSq < bestDistSq - Precision.CURVE_LENGTH_EPS_SQ * 4 ||
                    (Math.abs(eq.distanceSq - bestDistSq) <= Precision.CURVE_LENGTH_EPS_SQ * 4 && this.compareProjectedParam(u, bestU) < 0)
                ) {
                    bestU = u
                    bestDistSq = eq.distanceSq
                    bestStep = du
                }
            }

            for (let j = 0; j < samples.length - 1; j++) {
                const cur = samples[j]
                const next = samples[j + 1]
                if (Math.abs(cur.f) <= Precision.CURVE_NEWTON_EPS * 32) {
                    windows.push([Math.max(u0, cur.u - du), Math.min(u1, cur.u + du)])
                }
                if (Math.abs(next.f) <= Precision.CURVE_NEWTON_EPS * 32 || cur.f * next.f < 0) {
                    windows.push([cur.u, next.u])
                }
            }

            for (let j = 1; j < samples.length - 1; j++) {
                if (samples[j].distanceSq <= samples[j - 1].distanceSq && samples[j].distanceSq <= samples[j + 1].distanceSq) {
                    windows.push([Math.max(u0, samples[j].u - du), Math.min(u1, samples[j].u + du)])
                }
            }
        }

        windows.push([Math.max(range.start, bestU - bestStep), Math.min(range.end, bestU + bestStep)])
        return this.mergeBrackets(windows, range.start, range.end)
    }

    private refineProjectedParamRoot(p: Vec2, lo0: number, hi0: number) {
        let lo = this.clampProjectedParam(Math.min(lo0, hi0))
        let hi = this.clampProjectedParam(Math.max(lo0, hi0))
        if (hi - lo <= Precision.CURVE_PARAM_EPS * 4) return (lo + hi) * 0.5

        let eqLo = this.projectedEquation(lo, p)
        let eqHi = this.projectedEquation(hi, p)
        let u = (lo + hi) * 0.5
        let bestU = u
        let bestDistSq = this.projectedEquation(u, p).distanceSq

        for (let iter = 0; iter < Precision.CURVE_MAX_ITER; iter++) {
            const eq = this.projectedEquation(u, p)
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
                const eqMid = this.projectedEquation(mid, p)
                return eqMid.distanceSq < bestDistSq ? mid : bestU
            }
            u = next
        }
        return bestU
    }

    private pickBestProjectedSampleParam(p: Vec2) {
        const range = this._range
        const steps = Math.max(32, this.bboxRootSampleCount() * Math.max(2, this.getContinuityBreakParams().length + 1))
        let bestU = range.start
        let bestDistSq = Number.POSITIVE_INFINITY
        for (let i = 0; i <= steps; i++) {
            const u = i === steps ? range.end : (range.start + (range.length() * i) / steps)
            const eq = this.projectedEquation(u, p)
            if (
                eq.distanceSq < bestDistSq - Precision.CURVE_LENGTH_EPS_SQ * 4 ||
                (Math.abs(eq.distanceSq - bestDistSq) <= Precision.CURVE_LENGTH_EPS_SQ * 4 && this.compareProjectedParam(u, bestU) < 0)
            ) {
                bestU = u
                bestDistSq = eq.distanceSq
            }
        }
        return bestU
    }

    private clampProjectedParam(u: number) {
        if (u <= this._range.start) return this._range.start
        if (u >= this._range.end) return this._range.end
        return u
    }

    private normalizeProjectedParamResult(u: number) {
        return this._isPeriodic ? this.normalizePeriodicParam(u) : this.clampProjectedParam(u)
    }

    private compareProjectedParam(a: number, b: number) {
        if (this._isPeriodic) {
            return this.normalizePeriodicParam(a) - this.normalizePeriodicParam(b)
        }
        return a - b
    }

    /**
     * 将参数裁剪到当前曲线参数域（包围盒流程）。
     */
    private clampParamForBBox(u: number) {
        const range = this._range
        if (u <= range.start) return range.start
        if (u >= range.end) return range.end
        return u
    }

    /**
     * 在求值前归一化并校验输入参数。
     */
    private normalizeParamForEval(u: number) {
        if (this._isPeriodic) {
            return this.normalizePeriodicParam(u)
        }
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)
        return this.snapBoundary(u)
    }

    /**
     * 将参数映射到周期域并执行边界吸附。
     */
    private normalizePeriodicParam(u: number) {
        const domain = this.getDomain() as PeriodInterval
        const start = domain.start
        const period = domain.period
        let local = (u - start) % period
        if (local < 0) local += period
        return this.snapBoundary(start + local)
    }

    private firstActiveSpan() {
        for (let span = this._degree; span < this._controlPoints.length; span++) {
            if (this._knots[span + 1] - this._knots[span] > Precision.CURVE_PARAM_EPS) {
                return { span, u0: this._range.start }
            }
        }
        MathError.throw('BSpline2.firstActiveSpan: no active span')
    }

    private lastActiveSpan() {
        const n = this._controlPoints.length - 1
        for (let span = n; span >= this._degree; span--) {
            if (this._knots[span + 1] - this._knots[span] > Precision.CURVE_PARAM_EPS) {
                return { span, u0: this._range.end }
            }
        }
        MathError.throw('BSpline2.lastActiveSpan: no active span')
    }

    private extrapolateFromBoundarySpan(u: number, side: 'start' | 'end') {
        const boundary = side === 'start' ? this.firstActiveSpan() : this.lastActiveSpan()
        const du = u - boundary.u0
        const ckw = this.homogeneousDerivativesAt(boundary.u0, this._degree)

        let xw = 0
        let yw = 0
        let ww = 0
        for (let k = 0; k < ckw.length; k++) {
            const coeff = Math.pow(du, k) / BSpline2.factorial(k)
            xw += ckw[k].x * coeff
            yw += ckw[k].y * coeff
            ww += ckw[k].w * coeff
        }

        if (Math.abs(ww) > Precision.CURVE_NEWTON_EPS) {
            const x = xw / ww
            const y = yw / ww
            if (Number.isFinite(x) && Number.isFinite(y)) {
                return new Vec2(x, y)
            }
        }

        return this.fallbackJetExtrapolation(boundary.u0, du)
    }

    private fallbackJetExtrapolation(u0: number, du: number) {
        const ds = this.evalDerivativesOnDomain(u0, Math.min(2, this._degree))
        let point = ds[0].clone()
        if (ds.length > 1) {
            point = point.addScaleded(ds[1], du)
        }
        if (ds.length > 2) {
            point = point.addScaleded(ds[2], 0.5 * du * du)
        }
        if (point.isFinite()) return point
        return ds[0].clone()
    }

    /**
     * 将接近边界的参数吸附到稳定端点值。
     */
    private snapBoundary(u: number) {
        const start = this._range.start
        const end = this._range.end
        if (Math.abs(u - start) <= Precision.CURVE_PARAM_EPS) return start
        if (Math.abs(u - end) <= Precision.CURVE_PARAM_EPS) {
            return this._isPeriodic ? start : end
        }
        return u
    }

    /**
     * 由齐次控制点构建非周期 B 样条。
     */
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

    /**
     * 约束输入至少包含两个值（用于元组类型）。
     */
    private static requireAtLeastTwo(values: ReadonlyArray<number>, errorMessage: string): [number, number, ...number[]] {
        MathError.assert(values.length >= 2, errorMessage)
        return [values[0], values[1], ...values.slice(2)]
    }

    /**
     * 统计展开结向量起点或终点的重数。
     */
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

    /**
     * 按重数展开紧凑结表示。
     */
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

    /**
     * 定位参数 u 所在的结区间索引。
     */
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

    /**
     * 统计参数 u 在结向量 U 中的重数。
     */
    private static knotMultiplicity(u: number, U: ReadonlyArray<number>) {
        let s = 0
        for (const k of U) {
            if (Precision.equal(k, u, Precision.CURVE_PARAM_EPS)) s++
        }
        return s
    }

    /**
     * 在齐次控制多边形中执行一次插结。
     */
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

    /**
     * 计算非有理 B 样条基函数及其至 n 阶导数。
     */
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

    /**
     * 计算二项式系数 C(n, k)。
     */
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

    private static factorial(n: number) {
        let ret = 1
        for (let i = 2; i <= n; i++) ret *= i
        return ret
    }

    /**
     * 校验周期曲线特有的结与重数约束。
     */
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

    /**
     * 判断起终点是否足够接近以视作闭合。
     */
    private endpointsAreNear(eps = Precision.CURVE_LENGTH_EPS) {
        const start = this._range.start
        const end = this._range.end
        return this.getPtAt(start).distanceTo(this.getPtAt(end)) <= eps
    }
}
