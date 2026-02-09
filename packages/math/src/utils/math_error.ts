/*
 * Linea Math - Utils
 * MathError: 统一异常处理入口
 *
 * 用法示例：
 * - MathError.throw('param out of range', { method: 'lengthAtParam', u })
 * - MathError.assert(radius > 0, 'radius must be positive', { method: 'Circle' })
 * - MathError.warn('numeric not converged', { method: 'closestPoint', tol, maxIter })
 */

// 额外上下文信息，用于错误定位与调试
export type MathErrorDetail = Record<string, unknown>

export class MathError extends Error {
    public readonly detail?: MathErrorDetail

    constructor(message: string, detail?: MathErrorDetail) {
        super(message)
        this.name = 'MathError'
        this.detail = detail
    }

    /**
     * 直接抛出 MathError，用于显式失败场景
     */
    public static throw(message: string, detail?: MathErrorDetail): never {
        throw new MathError(message, detail)
    }

    /**
     * 条件不满足时抛出 MathError，用于参数校验或逻辑保护
     */
    public static assert(condition: boolean, message: string, detail?: MathErrorDetail): void {
        if (!condition) {
            MathError.throw(message, detail)
        }
    }

    /**
     * 仅警告，不抛异常；用于数值退化或可容忍的异常情形
     */
    public static warn(message: string, detail?: MathErrorDetail): void {
        if (detail === undefined) {
            console.warn(`[MathError] ${message}`)
        } else {
            console.warn(`[MathError] ${message}`, detail)
        }
    }
}
