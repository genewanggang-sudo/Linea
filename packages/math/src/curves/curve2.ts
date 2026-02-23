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
import { Interval } from './interval'

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
     * 原生参数取点。
     * @param u 曲线参数。
     * @returns 参数对应的二维点。
     */
    public abstract pointAt(u: number): Vec2

    /**
     * 原生参数切向（一阶导）。
     * @param u 曲线参数。
     * @returns 参数处切向量。
     */
    public abstract tangentAt(u: number): Vec2

    /**
     * 计算导数序列 `[d0, d1, ...]`。
     * @param u 曲线参数。
     * @param n 最大导数阶数。
     * @returns 从 0 阶到 n 阶的导数数组。
     */
    public abstract derivatives(u: number, n: number): Vec2[]

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
    public abstract length(range?: Interval): number

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
     * 计算包围盒。
     * @param accurate 是否使用高精度计算。
     * @returns 曲线包围盒。
     */
    public abstract boundingBox(accurate?: boolean): Box2

    /**
     * 有效性检查。
     * @param eps 数值判定容差。
     * @returns 曲线定义有效返回 `true`。
     */
    public abstract isValid(eps?: number): boolean

    /**
     * 克隆曲线。
     * @returns 当前曲线的深拷贝对象。
     */
    public abstract clone(): this

    /**
     * 获取第 `n` 阶导数（默认由 `derivatives` 派生）。
     * @param u 曲线参数。
     * @param n 导数阶数，要求为非负整数。
     * @returns 第 `n` 阶导数向量。
     */
    public derivativeAt(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'Curve2.derivativeAt: n must be a non-negative integer')
        const ds = this.derivatives(u, n)
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
     * 设置参数域（供子类构造期使用）。
     * @param range 参数区间。
     * @returns 当前实例。
     */
    protected setRange(range: Interval) {
        this._range = range.clone()
        return this
    }
}
