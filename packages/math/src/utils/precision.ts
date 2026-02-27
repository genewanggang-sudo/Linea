/*
 * Linea Math - Utils
 * Precision: 集中定义数值容差与比较工具
 */

export class Precision {
    /** 通用数值容差 */
    public static EPS = 1e-9

    /** 长度与近零判断容差 */
    public static LEN_EPS = 1e-12

    /** 角度容差（弧度） */
    public static ANG_EPS = 1e-6

    /** 曲线参数域容差（求值与区间校验） */
    public static CURVE_PARAM_EPS = 1e-9

    /** 曲线长度/距离相关容差 */
    public static CURVE_LENGTH_EPS = 1e-8

    /** 曲线长度容差的平方 */
    public static CURVE_LENGTH_EPS_SQ = Precision.CURVE_LENGTH_EPS * Precision.CURVE_LENGTH_EPS

    /** 曲线牛顿迭代收敛容差 */
    public static CURVE_NEWTON_EPS = 1e-10

    /** 曲线求解最大迭代次数，避免死循环 */
    public static CURVE_MAX_ITER = 50

    /** 自适应积分最大递归深度 */
    public static CURVE_INTEGRAL_MAX_DEPTH = 12

    /** 近似相等判断：绝对误差 + 相对误差 */
    public static equal(a: number, b: number, eps = Precision.EPS) {
        const diff = Math.abs(a - b)
        if (diff <= eps) return true
        const max = Math.max(1, Math.abs(a), Math.abs(b))
        return diff <= eps * max
    }

    /** 近零判断 */
    public static nearlyZero(x: number, eps = Precision.LEN_EPS) {
        return Math.abs(x) <= eps
    }

    /** 平方量近零判断（避免频繁开方） */
    public static nearlyZeroSq(x: number, eps = Precision.LEN_EPS) {
        return x <= eps * eps
    }

    /** 角度近似相等判断（弧度） */
    public static angleEqual(a: number, b: number, eps = Precision.ANG_EPS) {
        return Precision.equal(a, b, eps)
    }
}
