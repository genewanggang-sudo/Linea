import { MathError, MathErrorType } from './math_error';



/**
 * 调试警告
 * @deprecated 使用 MathError 来替代
 */
export class MathAssert {
    /**
     * 使用 MathError.assert() 来替代
     * @param value
     * @param message
     * @param args
     */
    public static assert(value: any, message: string = 'error', ...args: any[]) {
        if (process.env.NODE_ENV === 'development') {
            MathError.assert(value, message, MathErrorType.Algorithm, ...args);
        }
    }

    /**
     * 使用 MathError.warn() 来替代
     * @param value
     * @param message
     * @param args
     */
    public static warn(value: any, message: string = 'error', ...args: any[]) {
        MathError.warn(value, message, MathErrorType.Algorithm, ...args);
    }

    public static mutedWarn(value: any, message: string = 'error', ...args: any[]) {
        MathError.mutedWarn(value, message, MathErrorType.Algorithm, ...args);
    }
}