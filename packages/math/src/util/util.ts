import { Tol } from '../base/tol';



/**
 * 定义一些工具类方法
 */
export class Util {
    // 角度转弧度
    public static degreeToRadian(angle: number) {
        return (angle * Math.PI) / 180;
    }

    // 弧度转角度
    public static radianToDegree(radius: number) {
        return (radius * 180) / Math.PI;
    }

    // 误差范围内相等
    public static isNearlyEqual(a: number, b: number, optTolerance: number = Tol.NUMBER): boolean {
        return Math.abs(a - b) <= optTolerance;
    }

    // 误差范围内小于
    public static isNearlySmaller(a: number, b: number, optTolerance: number = Tol.NUMBER): boolean {
        return a - b < -optTolerance;
    }

    // 误差范围内小于或等于
    public static isNearlySmallerOrEqual(a: number, b: number, optTolerance: number = Tol.NUMBER): boolean {
        return a - b <= optTolerance;
    }

    // 误差范围内大于
    public static isNearlyBigger(a: number, b: number, optTolerance: number = Tol.NUMBER): boolean {
        return a - b > optTolerance;
    }

    // 误差范围内大于或等于
    public static isNearlyBiggerOrEqual(a: number, b: number, optTolerance: number = Tol.NUMBER): boolean {
        return a - b >= -optTolerance;
    }

    // 误差范围内为0
    public static isNearly0(a: number, optTolerance: number = Tol.NUMBER): boolean {
        return Math.abs(a) <= optTolerance;
    }

    // 在范围内，带误差。 b<= a <= c
    public static isInRange(a: number, b: number, c: number, optTolerance: number = Tol.NUMBER): boolean {
        return a - b >= -optTolerance && a - c <= optTolerance;
    }

    // 指定范围内的随机数
    public static randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
    }

    public static sum(array: number[]) {
        return array.reduce((total, num) => {
            return total + num;
        }, 0);
    }

    public static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    public static getUniqueOnes<T>(values: T[], equals: (a: T, b: T) => boolean): T[] {
        const rets: T[] = [];
        // eslint-disable-next-line no-labels
        LOOP_V: for (const u of values) {
            for (const v of rets) {
                // eslint-disable-next-line no-labels
                if (equals(u, v)) continue LOOP_V;
            }
            rets.push(u);
        }
        return rets;
    }
}