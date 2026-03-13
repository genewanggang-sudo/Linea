import { Tol } from '../base/tol';
import { CONST } from '../type_define/const';
import { CubicEquation } from './cubic_equation';
import { QuadraticEquation } from './quadratic_equation';



// 通用的方程求根方法：求方程的一个根
// 包含牛顿法（暂未实现）、（改进的）割线法、（逆）二次插值法、布伦特（综合）法
export class SolveEquationUtil {
    /**
     * 二次方程求根（只求实数根）: a * x^2 + b * x + c = 0
     */
    public static solveQuadraticEquation(a: number, b: number, c: number): number[] {
        return QuadraticEquation.solve(a, b, c);
    }

    /**
     * 三次方程求根（只求实数根）: a * x^3 + b * x^2 + c * x + d = 0
     */
    public static solveCubicEquation(a: number, b: number, c: number, d: number): number[] {
        return CubicEquation.solve(a, b, c, d);
    }

    /**
     * 方程求根
     * @param func 方程函数
     * @param xMin 所求参数区间的下限
     * @param xMax 所求参数区间的上限
     * @param paramEps 容差精度
     */
    public static execute(
        func: (param: number) => number,
        xMin: number,
        xMax: number,
        paramEps: number = Tol.NUMBER_CALC_EPS,
    ) {
        return this.quadraticInterpolation(func, xMin, xMax, paramEps);
    }

    /**
     * 牛顿迭代法，可能不收敛
     * 备注：迭代收敛较快，但是对于多重根，迭代非常慢，需要改进；并且容易陷入局部极值点位置
     * @param func 目标函数
     * @param dvtFunc 计算目标函数一阶微分的函数
     * @param x0 初值
     * @param tol
     */
    public static iterationNewton(
        func: (param: number) => number,
        dtFunc: (param: number) => number,
        x0: number,
        tol: number = Tol.NUMBER_CALC_EPS,
        validEps?: number,
        maxIterNum?: number,
    ) {
        let iter = 0;
        let xi: number = x0;
        let bIsDecrease = true;
        while (iter < CONST.NORMAL_ITER_NUM || bIsDecrease) {
            const fx = func(xi);
            const dfx = dtFunc(xi);
            const newx = xi - fx / dfx;
            if (Math.abs(newx - xi) < tol || iter > (maxIterNum || CONST.MAX_ITER_NUM)) {
                xi = newx;
                break;
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                const newFx = func(newx);
                bIsDecrease = Math.abs(newFx) < Math.abs(fx) - Tol.CALCULATE_EPS; // 如果迭代趋势收敛(距离0更近了)，继续迭代
            }

            xi = newx;
            iter++;
        }

        if (Math.abs(func(xi)) < (validEps || tol)) {
            return xi;
        }
        return undefined;
    }

    /**
     * 改进的正割法（近似牛顿迭代法，可能不收敛）
     * 备注：迭代收敛较快，但是对于多重根，迭代非常慢，需要改进；并且容易陷入局部极值点位置
     * @param x0 初值
     * @param tol
     */
    public static linearInterpolation(
        func: (param: number) => number,
        x0: number,
        tol: number = Tol.NUMBER_CALC_EPS,
    ) {
        let iter = 0;
        let xi: number = x0;
        let bIsDecrease = true;
        const delta = 0.0001;
        while (iter < CONST.NORMAL_ITER_NUM || bIsDecrease) {
            const fx0 = func(xi);
            const fx1 = func(xi + delta); // 多重根的时候，delta需要更小，否则导数计算不准确，会导致不收敛
            const newx = xi - (fx0 * delta) / (fx1 - fx0);
            if (Math.abs(newx - xi) < tol || iter > CONST.MAX_ITER_NUM) {
                xi = newx;
                break;
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                bIsDecrease = Math.abs(func(newx)) < Math.abs(func(xi)) - Tol.CALCULATE_EPS; // 如果迭代趋势收敛(距离0更近了)，继续迭代
            }

            xi = newx;
            iter++;
        }

        if (Math.abs(func(xi)) < tol) {
            return xi;
        }
        return undefined;
    }

    /**
     * 二次插值法（米勒法）: 求方程的根
     * 备注：稳定性不错，但是给的初值不好，容易陷入局部极值点附近无意义循环
     * @param x0 初值
     * @param h 初始步长
     * @param tol
     */
    public static quadraticInterpolation(
        func: (param: number) => number,
        xMin: number,
        xMax: number,
        tol: number = Tol.NUMBER_CALC_EPS,
    ): number | undefined {
        let iter = 0;
        let x3 = xMax;
        const xs: number[] = [xMin, xMax, (xMin + xMax) / 2];
        const fxs: number[] = [func(xs[0]), func(xs[1]), func(xs[2])];
        let bIsDecrease = true;
        while (iter < CONST.NORMAL_ITER_NUM || bIsDecrease) {
            // 三个点(param0, fx0)，(param1, fx1)，(param2, fx2)二次方程求根g(x) = 0
            // const x0x1Diff = xs[0] - xs[1];
            // const x1x2Diff = xs[1] - xs[2];
            // const x2x0Diff = xs[2] - xs[0];
            // const gx = (fx0 * (x - x1) * (x - x2)) / (x0x1Diff * -x2x0Diff)
            //          + (fx1 * (x - x0) * (x - x2)) / (x1x2Diff * -x0x1Diff)
            //          + (fx2 * (x - x0) * (x - x1)) / (x2x0Diff * -x1x2Diff);
            // 得到g(x) = ax^2 + bx + c
            const h0 = xs[1] - xs[0];
            const h1 = xs[2] - xs[1];
            const d0 = (fxs[1] - fxs[0]) / h0;
            const d1 = (fxs[2] - fxs[1]) / h1;
            const a = (d1 - d0) / (h0 + h1);
            const b = a * h1 + d1;
            const c = fxs[2];

            const bsqr = b * b;
            const ac4 = 4 * a * c;
            if (bsqr - ac4 < 0) {
                // return undefined; // 多重根求不到：需要处理复数根的情况
                x3 = -b / (2 * a);
                if (Math.abs(x3 - xs[2]) < tol) {
                    break;
                }
            } else {
                let delta = Math.sqrt(bsqr - ac4);
                delta = b > 0 ? delta : -delta;

                const den = -(2 * c) / (b + delta);
                x3 = xs[2] + den;

                if (Math.abs(den) < tol) {
                    break;
                }
            }

            if (Math.abs(x3 - xs[1]) < Math.abs(x3 - xs[0])) {
                [xs[0], xs[1], xs[2]] = [xs[1], xs[2], x3];
                [fxs[0], fxs[1], fxs[2]] = [fxs[1], fxs[2], func(x3)];
            } else {
                [xs[1], xs[2]] = [xs[2], x3];
                [fxs[1], fxs[2]] = [fxs[2], func(x3)];
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                bIsDecrease = Math.abs(fxs[2]) < Math.abs(fxs[1]) - Tol.CALCULATE_EPS; // 如果迭代趋势收敛(距离0更近了)，继续迭代
            }
            if (iter > CONST.MAX_ITER_NUM) {
                break;
            }

            iter++;
        }

        if (Math.abs(func(x3)) < tol) {
            return x3;
        }
        return undefined;
    }

    /**
     * 逆二次插值法: 求方程的根
     * 备注：能保证能计算一个根，即使初值在局部极值点附近也能迭代最后到一个根（如果存在根），但是对于多重根的情况，（y值相等）会使用割线法，计算效率较低，并且达到的精度不够
     * @param x0 初值
     * @param h 初始步长
     * @param tol
     */
    public static inverseQuadraticInterpolation(
        func: (param: number) => number,
        x0: number = 0.5,
        h: number,
        tol: number = Tol.NUMBER_CALC_EPS,
    ): number | undefined {
        let iter = 0;
        let x3 = x0;
        const xs: number[] = [x0 - h, x0 + h, x0];
        const fxs: number[] = [func(xs[0]), func(xs[1]), func(xs[2])];
        let bIsDecrease = true;
        while (iter < CONST.NORMAL_ITER_NUM || bIsDecrease) {
            // 如果fx0，fx1，fx2其中两个相等，采用正割法计算第三个点
            if (Math.abs(fxs[0] - fxs[1]) < tol || Math.abs(fxs[0] - fxs[2]) < tol) {
                // 使用(x1, fx1)，(x2, fx2)正割法
                x3 = xs[2] - (fxs[2] * (xs[1] - xs[2])) / (fxs[1] - fxs[2]);
                if (Math.abs(x3 - xs[2]) < tol) {
                    break;
                }

                [xs[0], xs[1], xs[2]] = [xs[1], xs[2], x3];
                [fxs[0], fxs[1], fxs[2]] = [fxs[1], fxs[2], func(x3)];
                iter++;
                continue;
            } else if (Math.abs(fxs[1] - fxs[2]) < tol) {
                // 选取(x0, fx0)，(x1, fx1)使用正割法？？？还是选取(x0, fx0)，(x2, fx2)使用正割法？？？怎么选取问题
                x3 = xs[2] - (fxs[2] * (xs[0] - xs[2])) / (fxs[0] - fxs[2]);
                if (Math.abs(x3 - xs[2]) < tol) {
                    break;
                }

                [xs[1], xs[2]] = [xs[2], x3];
                [fxs[1], fxs[2]] = [fxs[2], func(x3)];
                iter++;
                continue;
                // if (Math.abs(xs[0] - xs[2]) < Math.abs(xs[0] - xs[1])) {
                //     // 选取(x0, fx0)，(x2, fx2)使用正割法
                //     x3 = xs[2] - (fx2 * (xs[0] - xs[2])) / (fx0 - fx2);
                //     if (Math.abs(x3 - xs[2]) < tol) {
                //         break;
                //     }

                //     [xs[1], xs[2]] = [xs[2], x3];
                //     iter++;
                //     continue;
                // } else {
                //     // 选取(x0, fx0)，(x1, fx1)使用正割法
                //     x3 = xs[1] - (fx1 * (xs[0] - xs[1])) / (fx0 - fx1);
                //     if (Math.abs(x3 - xs[1]) < tol) {
                //         break;
                //     }

                //     xs[2] = x3;
                //     iter++;
                //     continue;
                // }
            }

            // 三个点(param0, fx0)，(param1, fx1)，(param2, fx2)逆二次方程x = g(y)求根g(y) = 0：保证曲线总与x轴有交
            const fx0fx1Diff = fxs[0] - fxs[1];
            const fx1fx2Diff = fxs[1] - fxs[2];
            const fx2fx0Diff = fxs[2] - fxs[0];
            // // 逆二次插值函数
            // const gy = (x0 * (y - fx1) * (y - fx2)) / (fx0fx1Diff * -fx2fx0Diff)
            //          + (x1 * (y - fx0) * (y - fx2)) / (fx1fx2Diff * -fx0fx1Diff)
            //          + (x2 * (y - fx0) * (y - fx1)) / (fx2fx0Diff * -fx1fx2Diff);
            // 令y = 0得到x3:
            x3 =
                (xs[0] * fxs[1] * fxs[2]) / (fx0fx1Diff * -fx2fx0Diff) +
                (xs[1] * fxs[0] * fxs[2]) / (fx1fx2Diff * -fx0fx1Diff) +
                (xs[2] * fxs[0] * fxs[1]) / (fx2fx0Diff * -fx1fx2Diff);

            // 容差多大还待考虑
            if (Math.abs(x3 - xs[2]) < tol) {
                break;
            }

            if (Math.abs(x3 - xs[1]) < Math.abs(x3 - xs[0])) {
                [xs[0], xs[1], xs[2]] = [xs[1], xs[2], x3];
                [fxs[0], fxs[1], fxs[2]] = [fxs[1], fxs[2], func(x3)];
            } else {
                [xs[1], xs[2]] = [xs[2], x3];
                [fxs[1], fxs[2]] = [fxs[2], func(x3)];
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                bIsDecrease = Math.abs(fxs[2]) < Math.abs(fxs[1]) - Tol.CALCULATE_EPS; // 如果迭代趋势收敛(距离0更近了)，继续迭代
            }
            if (iter > CONST.MAX_ITER_NUM) {
                break;
            }

            iter++;
        }

        if (Math.abs(func(x3)) < tol) {
            return x3;
        }
        return undefined;
    }
}