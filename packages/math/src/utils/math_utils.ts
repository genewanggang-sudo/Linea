/*
 * Linea Math - Utils
 * MathUtils：常用数值工具（clamp/lerp/almostEqual），纯静态类
 */

import { Precision } from './precision'

export class MathUtils {
    /** 将数值限制在 [min, max] */
    public static clamp(x: number, min: number, max: number) {
        if (min > max) {
            throw new Error('MathUtils.clamp: min must be <= max')
        }
        if (x < min) return min
        if (x > max) return max
        return x
    }

    /** 线性插值 */
    public static lerp(a: number, b: number, t: number) {
        return a + (b - a) * t
    }

    /** 近似相等 */
    public static almostEqual(a: number, b: number, eps = Precision.EPS) {
        return Precision.equal(a, b, eps)
    }
}
