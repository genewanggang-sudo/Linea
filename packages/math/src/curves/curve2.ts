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

    /** 获取参数域 */
    public getRange(): Interval {
        return this._range.clone()
    }

    /** 原生参数取点 */
    public abstract pointAt(u: number): Vec2

    /** 原生参数切向（一阶导） */
    public abstract tangentAt(u: number): Vec2

    /** 导数序列 [d0, d1, ...] */
    public abstract derivatives(u: number, n: number): Vec2[]

    /** 曲率 */
    public abstract curvatureAt(u: number): number

    /** 长度（可选子参数域） */
    public abstract length(range?: Interval): number

    /** 从参数域起点到 u 的弧长 */
    public abstract lengthAtParam(u: number): number

    /** 给定弧长反求参数 */
    public abstract paramAtLength(s: number, tol?: number): number

    /** 以参数切分曲线 */
    public abstract split(u: number): Curve2[]

    /** 参数裁剪 */
    public abstract trim(range: Interval): Curve2[]

    /** 反转方向（就地） */
    public abstract reverse(): this

    /** 变换（就地） */
    public abstract transform(m: Mat3): this

    /** 变换（返回新对象） */
    public abstract transformed(m: Mat3): this

    /** 最近点查询 */
    public abstract closestPoint(p: Vec2, tol?: number): IClosestPointResult

    /** 包围盒 */
    public abstract boundingBox(accurate?: boolean): Box2

    /** 有效性检查 */
    public abstract isValid(eps?: number): boolean

    /** 克隆 */
    public abstract clone(): this

    /**
     * 第 n 阶导数（默认由 derivatives 派生）
     */
    public derivativeAt(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'Curve2.derivativeAt: n must be a non-negative integer')
        const ds = this.derivatives(u, n)
        MathError.assert(ds.length > n, 'Curve2.derivativeAt: derivative order is not available')
        return ds[n]
    }

    /** 最近参数（默认由 closestPoint 派生） */
    public closestParam(p: Vec2, tol = Precision.LEN_EPS) {
        return this.closestPoint(p, tol).param
    }

    /** 点到曲线距离（默认由 closestPoint 派生） */
    public distanceToPoint(p: Vec2, tol = Precision.LEN_EPS) {
        return this.closestPoint(p, tol).distance
    }

    /** 设置参数域（供子类构造期使用） */
    protected setRange(range: Interval) {
        this._range = range.clone()
        return this
    }
}
