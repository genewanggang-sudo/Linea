import { CubicEquation } from './cubic_equation';



/**
 * 四次方程求根: a * x^4 + b * x^3 + c * x^2 + d * x + e = 0 (a != 0) // 求解存在问题，很多测试用例不通过
 */
export class QuarticEquation {
    public static solve(a: number, b: number, c: number, d: number, e: number): number[] | undefined {
        if (Math.abs(a) < 1e-12) {
            return CubicEquation.solve(b, c, d, e);
        }

        const aa = a * a;
        const bb = b * b;
        const cc = c * c;
        const ae = a * e;
        const bc = b * c;
        const bd = b * d;
        const delta1 = 12 * ae - 3 * bd + cc;
        const delta2 = -72 * a * c * e + 27 * a * d * d + 27 * bb * e - 9 * bc * d + 2 * cc * c;
        const delta3 = -4 * delta1 * delta1 * delta1 + delta2 * delta2;
        if (delta3 < 0) {
            return []; // 很多有实数根的，走到这一步为负数，无法继续计算下去
        }

        const sqrtdelta3 = Math.sqrt(delta3);
        const delta4 = sqrtdelta3 + delta2;
        // 垃圾库，负数直接开根号3次开不出来，先变为正数再开根号3次方
        let delta4Pow = Math.abs(delta4) ** (1 / 3);
        if (delta4 < 0) {
            delta4Pow = -delta4Pow;
        }

        const delta5 = delta4Pow / (3 * 2 ** (1 / 3) * a);
        const delta6 = (2 ** (1 / 3) * delta1) / (3 * a * delta4Pow);
        const delta = delta5 + delta6;
        const tmp1 = bb / (4 * aa) - (2 * c) / (3 * a);

        const delta7 = tmp1 + delta;
        if (delta7 < 0) {
            return [];
        }
        const delta7Sqrt = Math.sqrt(delta7);

        const tmp21 = -(bb * b) / (aa * a) + (4 * bc) / aa - (8 * d) / a;
        const tmp22 = tmp21 / (4 * delta7Sqrt);
        const tmp23 = tmp1 * 2 - delta;

        const res21 = tmp23 - tmp22;
        const res22 = tmp23 + tmp22;

        const xi: number[] = [];
        const res3 = -b / (4 * a);
        const rootHead1 = res3 - delta7Sqrt / 2;
        if (res21 > 1e-12) {
            const rootTail = Math.sqrt(res21) / 2;
            const x1 = rootHead1 - rootTail;
            const x2 = rootHead1 + rootTail;
            xi.push(x1);
            xi.push(x2);
        } else if (Math.abs(res21) < 1e-12) {
            xi.push(rootHead1);
        }

        const rootHead2 = res3 + delta7Sqrt / 2;
        if (res22 > 1e-12) {
            const rootTail = Math.sqrt(res22) / 2;
            const x3 = rootHead2 - rootTail;
            const x4 = rootHead2 + rootTail;
            xi.push(x3);
            xi.push(x4);
        } else if (Math.abs(res22) < 1e-12) {
            xi.push(rootHead2);
        }

        return xi;
    }
}