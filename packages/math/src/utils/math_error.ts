/*
 * Linea Math - Utils
 * MathError: 统一异常处理入口
 *
 * 用法示例：
 * - MathError.throw('参数超出范围')
 * - MathError.assert(radius > 0, '半径必须为正')
 * - MathError.warn('数值迭代未收敛')
 */

export class MathError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'MathError'
    }

    /**
     * 直接抛出 MathError，用于显式失败场景
     */
    public static throw(message: string): never {
        throw new MathError(message)
    }

    /**
     * 条件不满足时抛出 MathError，用于参数校验或逻辑保护
     */
    public static assert(condition: unknown, message: string): asserts condition {
        if (!condition) {
            MathError.throw(message)
        }
    }

    /**
     * 仅警告，不抛异常；用于数值退化或可容忍的异常情形
     */
    public static warn(message: string): void {
        console.warn(`[MathError] ${message}`)
    }
}
