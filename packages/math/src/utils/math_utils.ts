/*
 * Linea Math - Utils
 * MathUtils: 通用标量工具
 */

import { MathError } from './math_error'
import { Precision } from './precision'

export class MathUtils {
    /** 将数值限制在 [min, max] 区间内 */
    public static clamp(x: number, min: number, max: number) {
        MathError.assert(min <= max, 'MathUtils.clamp: min must be <= max')
        if (x < min) return min
        if (x > max) return max
        return x
    }

    /** 线性插值 */
    public static lerp(a: number, b: number, t: number) {
        return a + (b - a) * t
    }

    /** 近似相等判断（Precision.equal 包装） */
    public static almostEqual(a: number, b: number, eps = Precision.EPS) {
        return Precision.equal(a, b, eps)
    }
}
