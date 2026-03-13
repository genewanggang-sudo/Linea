import { QuadraticEquation } from './quadratic_equation';
import { MathAssert } from '../util/assert';
import { Plurality } from './plurality';



function sqrt3(x: number): number {
    // 垃圾库，负数直接开根号3次开不出来，先变为正数再开根号3次方
    const t = Math.abs(x) ** (1 / 3);
    return x > 0 ? t : -t;
}

/**
 * 三次方程求根（只求实数根）: a * x^3 + b * x^2 + c * x + d = 0 (a != 0)
 */
export class CubicEquation {
    // 卡尔丹公式法
    public static solve(a: number, b: number, c: number, d: number): number[] {
        if (Math.abs(a) < 1e-12) {
            return QuadraticEquation.solve(b, c, d);
        }

        // 化为x^3+p*x+q=0
        const p = (3 * a * c - b * b) / (3 * a * a);
        const q = (27 * a * a * d - 9 * a * b * c + 2 * b * b * b) / (27 * a * a * a);
        const normSolve = () => {
            // 1. 三重0根
            if (Math.abs(p) < 1e-12 && Math.abs(q) < 1e-12) {
                return [0];
            }

            const q_2 = q / 2;
            const p_3 = p / 3;
            const delta = q_2 * q_2 + p_3 * p_3 * p_3;
            if (delta > -1e-16) {
                const sqrtDelta = Math.sqrt(Math.abs(delta));
                const tmp1 = sqrt3(-q_2 + sqrtDelta);
                const tmp2 = sqrt3(-q_2 - sqrtDelta);

                const x1 = tmp1 + tmp2;
                // 2.一个实根两个虚根
                if (delta > 1e-7) {
                    return [x1];
                }

                // 3.一个实根，两个二重实根
                const omiga = new Plurality(-1 / 2, Math.sqrt(3) / 2);
                const sqrOmiga = omiga.multiplied(omiga);
                const x2 = omiga.scaled(tmp1).added(sqrOmiga.scaled(tmp2));
                const x3 = sqrOmiga.scaled(tmp1).added(omiga.scaled(tmp2));
                return [x1, x2.added(x3).a / 2];
            }

            // 4.三个不同的实根
            const r = Math.sqrt(-p_3 * p_3 * p_3);
            const preMult = 2 * sqrt3(r);
            const theta = Math.acos(-q / (2 * r));
            const x1 = preMult * Math.cos(theta);
            const x2 = preMult * Math.cos(theta + (Math.PI * 2) / 3);
            const x3 = preMult * Math.cos(theta + (Math.PI * 4) / 3);
            return [x1, x2, x3];
        };

        const res0 = normSolve();
        const add = -b / (3 * a);
        const res = res0.map(_x => _x + add);
        return res;
    }

    // 盛金公式法 // 当数值较大时，双精度浮点数计算不精确，容易漏根
    public static solve2(a: number, b: number, c: number, d: number): number[] | undefined {
        if (Math.abs(a) < 1e-12) {
            return QuadraticEquation.solve(b, c, d);
        }

        const A = b * b - 3 * a * c;
        const B = b * c - 9 * a * d;
        const C = c * c - 3 * b * d;

        // // 是否处理浮点数以后遇到再说
        // if (Math.abs(A) < 1e-12) {
        //     A = 0.0;
        // }

        // if (Math.abs(B) < 1e-12) {
        //     B = 0.0;
        // }

        // if (Math.abs(C) < 1e-12) {
        //     C = 0.0;
        // }

        // 1.三重实根
        if (Math.abs(A) < 1e-12 && Math.abs(B) < 1e-12) {
            if (Math.abs(a) > Math.abs(b)) {
                if (Math.abs(a) >= Math.abs(c)) {
                    return [-b / (3 * a)];
                }

                return [-(3 * d) / c];
                // eslint-disable-next-line no-else-return
            } else {
                if (Math.abs(b) >= Math.abs(c)) {
                    return [-c / b];
                }

                return [-b / (3 * a)];
            }
        }

        const delta = B * B - 4 * A * C;
        if (delta > 1e-12) {
            // 2.一个实根和两个共轭虚根
            const deltaSqrt = Math.sqrt(delta);
            const Y1 = A * b + (3 * a * (-B + deltaSqrt)) / 2;
            const Y2 = A * b + (3 * a * (-B - deltaSqrt)) / 2;

            const sqrt3Y1 = sqrt3(Y1);
            const sqrt3Y2 = sqrt3(Y2);
            const x1 = (-b - sqrt3Y1 - sqrt3Y2) / (3 * a);

            if (Math.abs(sqrt3Y1 - sqrt3Y2) > 1e-8) {
                return [x1];
            }

            // 共轭虚根为：【-b / (3 * a) + (sqrt3Y1 + sqrt3Y2) / (6 * a)】+【(sqrt3Y1 - sqrt3Y2) * i】;
            // sqrt3Y1 = sqrt3Y2时，由于前面计算不精确，或者说计算容差问题，这个地方其实是有一个二重根
            const x2 = -b / (3 * a) + (sqrt3Y1 + sqrt3Y2) / (6 * a);
            return [x1, x2];
        }
        if (Math.abs(delta) < 1e-12) {
            // 3.一个实根和一个二重根
            if (Math.abs(A) < 1e-12) {
                MathAssert.warn('解三次方程错误！');
                return undefined;
            }

            const K = B / A;
            const x1 = -b / a + K;
            const x2 = -K / 2;
            return [x1, x2];
        }

        // 4.三个实根
        const T = (2 * A * b - 3 * a * B) / (2 * A ** (1 / 3));
        const theta = Math.acos(T);
        const cosTheta3 = Math.cos(theta / 3);
        const sqrtA = Math.sqrt(A);

        const x1 = (-b - 2 * sqrtA * cosTheta3) / (3 * a);
        const x2 = (-b + sqrtA * (cosTheta3 + 1.7320508075688772935274463415059 * Math.sin(theta / 3))) / (3 * a);
        const x3 = (-b + sqrtA * (cosTheta3 - 1.7320508075688772935274463415059 * Math.sin(theta / 3))) / (3 * a);

        return [x1, x2, x3];
    }
}