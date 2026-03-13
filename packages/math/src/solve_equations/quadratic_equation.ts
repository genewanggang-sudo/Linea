import { Tol } from '../base/tol';
import { MathError } from '../util/math_error';



/**
 * 二次方程求根: a * x^2 + b * x + c = 0
 */
export class QuadraticEquation {
    public static solve(a: number, b: number, c: number, eps = Tol.CALCULATE_EPS): number[] {
        if (Math.abs(a) < eps) {
            if (Math.abs(b) < eps) {
                MathError.warn('QuadraticEquation方程不合法：a = b = 0');
                if (Math.abs(c) > eps) {
                    return [NaN];
                }

                return [0];
            }

            return [c / b];
        }

        const sqrEps = eps * eps;
        const bsqr = b * b;
        const ac4 = 4 * a * c;

        let sqrDelta = bsqr - ac4;
        const den = (bsqr + Math.abs(ac4)) / 2;
        if (sqrDelta < -sqrEps || (den > 1e12 && sqrDelta / den < -sqrEps)) {
            MathError.warn('QuadraticEquation方程无解：b * b - 4 * a * c < 0');
            return [];
        }
        if (sqrDelta < sqrEps) {
            sqrDelta = 0;
        }

        const delta = Math.sqrt(sqrDelta);
        // if (Math.abs(ac4) > sqrEps && bsqr > 1000 * ac4) {
        //     const x1 = (-2 * c) / (b + delta);
        //     const x2 = (-2 * c) / (b - delta); // 这个公式也不好用

        //     if (Math.abs(x1 - x2) < eps) {
        //         return [x1];
        //     }

        //     return [x1, x2];
        // }

        const x1 = (-b - delta) / (2 * a);
        const x2 = (-b + delta) / (2 * a);

        if (Math.abs(x2 - x1) < eps) {
            return [x1];
        }

        return [x1, x2];
    }
}