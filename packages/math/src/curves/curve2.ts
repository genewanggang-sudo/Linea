/*
 * Linea Math - Curves
 * Curve2: 二维曲线抽象基类
 */

import { Box2 } from '../core/box2'
import { GeomBase } from '../core/geom_base'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import type { IClosestPointResult } from '../types/type_define'
import type { IVec2 } from '../types/type_define'
import { DiscretizeEngine } from '../discretize/discretize_engine'
import { DiscretizeOptions } from '../discretize/discretize_options'
import type { Arc2 } from './arc2'
import type { BSpline2 } from './bspline2'
import type { Circle2 } from './circle2'
import type { Ellipse2 } from './ellipse2'
import type { EllipseArc2 } from './ellipse_arc2'
import { Interval } from './interval'
import type { Line2 } from './line2'

export abstract class Curve2 extends GeomBase {
    /**
     * 参数域
     * - 默认使用无界区间，具体曲线应在子类中覆盖
     * - 子类可直接赋值 this._range，或调用 setRange()
     */
    protected _range: Interval = Interval.infinite()

    /**
     * 获取参数域。
     * @returns 参数域副本，调用方修改不会影响内部状态。
     */
    public getRange(): Interval {
        return this._range.clone()
    }

    /**
     * 获取曲线理论参数定义域。
     * @returns 理论定义域副本；默认返回无界区间。
     */
    public getDomain(): Interval {
        return Interval.infinite()
    }

    /**
     * 获取参数域起点。
     * @returns 参数域起点。
     */
    public getStartParam(): number {
        return this._range.start
    }

    /**
     * 获取参数域终点。
     * @returns 参数域终点。
     */
    public getEndParam(): number {
        return this._range.end
    }

    /**
     * 获取曲线起点。
     * @returns 参数域起点对应的二维点。
     */
    public getStartPt(): Vec2 {
        return this.getPtAt(this.getStartParam())
    }

    /**
     * 获取曲线终点。
     * @returns 参数域终点对应的二维点。
     */
    public getEndPt(): Vec2 {
        return this.getPtAt(this.getEndParam())
    }

    /**
     * 获取曲线中点。
     * @returns 参数域中点对应的二维点。
     */
    public getMidPt(): Vec2 {
        return this.getPtAt(this._range.mid())
    }

    /**
     * 判断参数是否落在当前曲线参数域内。
     * @param u 待判断参数。
     * @param eps 区间边界比较容差。
     * @returns 落在参数域内返回 `true`。
     */
    public containsParam(u: number, eps = Precision.CURVE_PARAM_EPS): boolean {
        return this._range.contains(u, eps)
    }

    /**
     * 判断点投影回曲线后的参数是否落在当前曲线参数域内。
     * @param point 待检测点。
     * @param tolerance 参数区间边界容差。
     * @returns 投影参数落在当前曲线参数域内返回 `true`。
     */
    public containsProjectedPt(point: IVec2 | Vec2, tolerance = Precision.CURVE_PARAM_EPS): boolean {
        const p = point instanceof Vec2 ? point : new Vec2(point)
        return this.containsParam(this.getParamAt(p), tolerance)
    }

    /**
     * 获取点按参数反查链映射回曲线后的代表点。
     * @param point 待投影点。
     * @returns `getParamAt(point)` 对应参数下的曲线点。
     */
    public getProjectedPtBy(point: IVec2 | Vec2): Vec2 {
        const p = point instanceof Vec2 ? point : new Vec2(point)
        return this.getPtAt(this.getParamAt(p))
    }

    /**
     * 判断点是否落在当前曲线段上。
     * @param point 待检测点。
     * @param tolerance 几何距离容差。
     * @returns 点在当前曲线段上返回 `true`。
     */
    public containsPt(point: IVec2 | Vec2, tolerance = Precision.CURVE_LENGTH_EPS): boolean {
        const p = point instanceof Vec2 ? point : new Vec2(point)
        const tolSq = tolerance * tolerance

        if (this.getStartPt().distanceToSq(p) <= tolSq || this.getEndPt().distanceToSq(p) <= tolSq) {
            return true
        }

        const u = this.getParamAt(p)
        if (!this.containsParam(u)) {
            return false
        }

        return this.getPtAt(u).distanceToSq(p) <= tolSq
    }

    /**
     * 原生参数取点。
     * @param u 曲线参数。
     * @returns 参数对应的二维点。
     */
    public abstract pointAt(u: number): Vec2

    /**
     * 宽松参数取点。
     * @param u 曲线参数，可超出当前参数域。
     * @returns 参数对应的二维点；对裁剪曲线返回值可落在支撑几何上。
     */
    public abstract getPtAt(u: number): Vec2

    /**
     * 原生参数切向（一阶导）。
     * @param u 曲线参数。
     * @returns 参数处切向量。
     */
    public abstract getTangentAt(u: number): Vec2

    /**
     * 计算导数序列 `[d0, d1, ...]`。
     * @param u 曲线参数。
     * @param n 最大导数阶数。
     * @returns 从 0 阶到 n 阶的导数数组。
     */
    public abstract getDerivatives(u: number, n: number): Vec2[]

    /**
     * 计算参数处曲率。
     * @param u 曲线参数。
     * @returns 曲率标量。
     */
    public abstract curvatureAt(u: number): number

    /**
     * 计算曲线长度。
     * @param range 可选子参数域；不传表示整段曲线。
     * @returns 指定参数范围内的弧长。
     */
    public abstract getLength(range?: Interval): number

    /**
     * 计算从参数域起点到 `u` 的弧长。
     * @param u 目标参数。
     * @returns 起点到 `u` 的累计弧长。
     */
    public abstract lengthAtParam(u: number): number

    /**
     * 给定弧长反求参数。
     * @param s 目标弧长。
     * @param tol 迭代容差（若实现采用迭代法）。
     * @returns 对应参数值。
     */
    public abstract paramAtLength(s: number, tol?: number): number

    /**
     * 以参数切分曲线。
     * @param u 切分参数。
     * @returns 切分结果曲线数组。
     */
    public abstract split(u: number): Curve2[]

    /**
     * 参数裁剪。
     * @param range 目标保留参数区间。
     * @returns 裁剪后的曲线数组。
     */
    public abstract trim(range: Interval): Curve2[]

    /**
     * 反转曲线方向（就地）。
     * @returns 当前实例。
     */
    public abstract reverse(): this

    /**
     * 反转曲线方向（返回新对象）。
     * @returns 反转后的新曲线对象。
     */
    public reversed(): this {
        return this.clone().reverse()
    }

    /**
     * 平移曲线（就地）。
     * @param offset 平移向量。
     * @returns 当前实例。
     */
    public translate(offset: IVec2): this {
        return this.transform(Mat3.makeTranslate(offset))
    }

    /**
     * 绕指定点旋转曲线（就地）。
     * @param angle 旋转角度（弧度）。
     * @param pivot 旋转中心。
     * @returns 当前实例。
     */
    public rotate(angle: number, pivot: IVec2 = { x: 0, y: 0 }): this {
        return this.transform(Mat3.makeRotate(pivot, angle))
    }

    /**
     * 等比缩放曲线（就地）。
     * @param factor 缩放因子。
     * @param center 缩放中心。
     * @returns 当前实例。
     */
    public scale(factor: number, center: IVec2 = { x: 0, y: 0 }): this {
        return this.transform(Mat3.makeScale(center, factor))
    }

    /**
     * 应用仿射变换（就地）。
     * @param m 3x3 变换矩阵。
     * @returns 当前实例。
     */
    public abstract transform(m: Mat3): this

    /**
     * 应用仿射变换（返回新对象）。
     * @param m 3x3 变换矩阵。
     * @returns 变换后的新曲线对象。
     */
    public abstract transformed(m: Mat3): this

    /**
     * 最近点查询。
     * @param p 查询点。
     * @param tol 计算容差。
     * @returns 最近点、对应参数和距离。
     */
    public abstract closestPoint(p: Vec2, tol?: number): IClosestPointResult

    /**
     * 获取某点（点也可以不在曲线上）对应的参数t（不限参数域）
     */
    public abstract getParamAt(p: Vec2): number

    /**
     * 计算包围盒。
     * @param accurate 是否使用高精度计算。
     * - `accurate !== true`：优先快速保守盒（用于高频场景）
     * - `accurate === true`：尽量返回更紧的包围盒（允许更慢）
     * @returns 曲线包围盒。
     */
    public abstract getBBox(accurate?: boolean): Box2

    /**
     * 有效性检查。
     * @param eps 数值判定容差。
     * @returns 曲线定义有效返回 `true`。
     */
    public abstract isValid(eps?: number): boolean

    /**
     * 是否为退化曲线。
     * 默认规则：参数域过小或曲线长度过小。
     */
    public isDegenerate(): boolean {
        return this._range.length() <= Precision.CURVE_PARAM_EPS || this.getLength() <= Precision.CURVE_LENGTH_EPS
    }

    /**
     * 是否为闭合曲线。
     * 默认返回 `false`，由闭合曲线子类覆盖。
     */
    public isClosed(): boolean {
        return false
    }

    /** 是否为线段曲线。 */
    public isLine(): this is Line2 {
        return false
    }

    /** 是否为整圆曲线。 */
    public isCircle(): this is Circle2 {
        return false
    }

    /** 是否为圆弧曲线。 */
    public isArc(): this is Arc2 {
        return false
    }

    /** 是否为整椭圆曲线。 */
    public isEllipse(): this is Ellipse2 {
        return false
    }

    /** 是否为椭圆弧曲线。 */
    public isEllipseArc(): this is EllipseArc2 {
        return false
    }

    /** 是否为 B 样条曲线。 */
    public isBSpline(): this is BSpline2 {
        return false
    }

    /**
     * 克隆曲线。
     * @returns 当前曲线的深拷贝对象。
     */
    public abstract clone(): this

    /**
     * 获取第 `n` 阶导数（默认由 `getDerivatives` 派生）。
     * @param u 曲线参数。
     * @param n 导数阶数，要求为非负整数。
     * @returns 第 `n` 阶导数向量。
     */
    public derivativeAt(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'Curve2.derivativeAt: n must be a non-negative integer')
        const ds = this.getDerivatives(u, n)
        MathError.assert(ds.length > n, 'Curve2.derivativeAt: derivative order is not available')
        return ds[n]
    }

    /**
     * 最近参数（默认由 `closestPoint` 派生）。
     * @param p 查询点。
     * @param tol 计算容差。
     * @returns 最近点对应参数。
     */
    public closestParam(p: Vec2, tol = Precision.LEN_EPS) {
        return this.closestPoint(p, tol).param
    }

    /**
     * 点到曲线距离（默认由 `closestPoint` 派生）。
     * @param p 查询点。
     * @param tol 计算容差。
     * @returns 点到曲线的最短距离。
     */
    public distanceToPoint(p: Vec2, tol = Precision.LEN_EPS) {
        return this.closestPoint(p, tol).distance
    }

    /**
     * 曲线离散化便捷入口（薄封装）。
     * @param options 离散参数。
     * @returns 折线采样结果。
     */
    public discretize(options?: DiscretizeOptions): Vec2[] {
        return DiscretizeEngine.discretize(this, options)
    }

    /**
     * 设置参数域（供子类构造期使用）。
     * @param range 参数区间。
     * @returns 当前实例。
     */
    protected setRange(range: Interval) {
        this._range = range.clone()
        return this
    }

    /**
     * Newton + 二分混合求解参数（常用于弧长反参）。
     * @param target 目标值（如目标弧长）。
     * @param start 参数下界。
     * @param end 参数上界。
     * @param tol 收敛容差。
     * @param evalValue 参数到目标量的映射函数（要求在 [start, end] 上单调）。
     * @param evalSlope 参数处导数量（如速度），用于 Newton 步。
     * @param failMessage 未收敛时抛错信息。
     * @param initialGuess 可选初值；不传时取区间中点。
     * @returns 收敛后的参数。
     */
    protected solveParamByHybridNewton(
        target: number,
        start: number,
        end: number,
        tol: number,
        evalValue: (u: number) => number,
        evalSlope: (u: number) => number,
        failMessage: string,
        initialGuess?: number,
    ) {
        MathError.assert(Number.isFinite(start) && Number.isFinite(end) && end > start, 'Curve2.solveParamByHybridNewton: invalid range')
        MathError.assert(Number.isFinite(tol) && tol > 0, 'Curve2.solveParamByHybridNewton: tol must be > 0')
        // lo/hi 始终包住当前根，Newton 出界时回退到二分保证收敛性。
        let lo = start
        let hi = end
        let u = initialGuess ?? ((lo + hi) * 0.5)
        if (!Number.isFinite(u) || u <= lo || u >= hi) {
            u = (lo + hi) * 0.5
        }

        for (let i = 0; i < Precision.CURVE_MAX_ITER; i++) {
            const value = evalValue(u)
            const f = value - target
            if (Math.abs(f) <= tol) return u

            const slope = evalSlope(u)
            let next = Number.NaN
            if (Math.abs(slope) > Precision.CURVE_NEWTON_EPS) {
                next = u - f / slope
            }

            // Newton 步越界或数值异常时，退回二分步，避免振荡/发散。
            if (!Number.isFinite(next) || next <= lo || next >= hi) {
                next = (lo + hi) * 0.5
            }

            if (f > 0) {
                hi = u
            } else {
                lo = u
            }
            u = next
        }

        MathError.throw(failMessage)
    }

    /**
     * “采样粗定位 + Newton 细化”最近点求解通用流程。
     * @param p 查询点。
     * @param tol 收敛容差。
     * @param sampleCount 初始采样数（含两端点）。
     * @param evalPoint 参数求点函数。
     * @param evalD1 一阶导函数。
     * @param evalD2 二阶导函数。
     * @param failMessage 未收敛时抛错信息。
     * @param compareParam 参数平局比较器（返回 <0 表示 a 更优）。
     * @returns 最近点结果。
     */
    protected solveClosestPointBySampleNewton(
        p: Vec2,
        tol: number,
        sampleCount: number,
        evalPoint: (u: number) => Vec2,
        evalD1: (u: number) => Vec2,
        evalD2: (u: number) => Vec2,
        failMessage: string,
        compareParam: (a: number, b: number) => number = (a, b) => a - b,
    ): IClosestPointResult {
        MathError.assert(Number.isFinite(tol) && tol > 0, 'Curve2.solveClosestPointBySampleNewton: tol must be > 0')
        MathError.assert(Number.isInteger(sampleCount) && sampleCount > 0, 'Curve2.solveClosestPointBySampleNewton: sampleCount must be a positive integer')
        const start = this._range.start
        const span = this._range.length()
        // 零跨度参数域直接退化为单点评估。
        if (span <= Precision.CURVE_PARAM_EPS) {
            const point = evalPoint(start)
            return { point, param: start, distance: point.distanceTo(p) }
        }

        // 第 1 阶段：均匀采样找一个稳定的初始参数。
        let bestU = start
        let bestDistSq = Number.POSITIVE_INFINITY
        for (let i = 0; i <= sampleCount; i++) {
            const u = start + (span * i) / sampleCount
            const q = evalPoint(u)
            const d2 = q.distanceToSq(p)
            if (d2 < bestDistSq - tol * tol) {
                bestDistSq = d2
                bestU = u
                continue
            }
            if (Math.abs(d2 - bestDistSq) <= tol * tol && compareParam(u, bestU) < 0) {
                bestU = u
            }
        }

        // 第 2 阶段：在采样命中的局部窗口做 Newton 迭代。
        const step = span / sampleCount
        let lo = Math.max(start, bestU - step)
        let hi = Math.min(start + span, bestU + step)
        let u = bestU

        for (let i = 0; i < Precision.CURVE_MAX_ITER; i++) {
            const c = evalPoint(u)
            const d1 = evalD1(u)
            const d2 = evalD2(u)
            const cp = c.subtracted(p)

            const f = cp.dot(d1)
            if (Math.abs(f) <= tol) {
                return { point: c, param: u, distance: c.distanceTo(p) }
            }

            const fp = d1.dot(d1) + cp.dot(d2)
            let next = Number.NaN
            if (Math.abs(fp) > Precision.CURVE_NEWTON_EPS) {
                next = u - f / fp
            }

            // Newton 失效时回退二分，保持区间收缩。
            if (!Number.isFinite(next) || next <= lo || next >= hi) {
                next = (lo + hi) * 0.5
            }

            if (f > 0) {
                hi = u
            } else {
                lo = u
            }
            u = next
        }

        MathError.throw(failMessage)
    }
}
