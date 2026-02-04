/*
 * Linea Math - Utils
 * Precision：统一管理数值/长度/角度容差，提供通用近似比较方法
 */

export class Precision {
    /** 通用数值容差 */
    public static EPS = 1e-9

    /** 长度/零值容差 */
    public static LEN_EPS = 1e-12

    /** 角度容差（弧度） */
    public static ANG_EPS = 1e-6

    /** 近似相等（绝对误差 + 相对误差） */
    public static equal(a: number, b: number, eps = Precision.EPS) {
        const diff = Math.abs(a - b)
        if (diff <= eps) return true
        const max = Math.max(1, Math.abs(a), Math.abs(b))
        return diff <= eps * max
    }

    /** 近似为零 */
    public static nearlyZero(x: number, eps = Precision.LEN_EPS) {
        return Math.abs(x) <= eps
    }

    /** 角度近似相等（弧度） */
    public static angleEqual(a: number, b: number, eps = Precision.ANG_EPS) {
        return Precision.equal(a, b, eps)
    }
}
