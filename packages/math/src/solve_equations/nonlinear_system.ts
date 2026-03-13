import { Tol } from '../base/tol';
import { LinearSystem } from './linear_system';
import { CONST } from '../type_define/const';



export class NonlinearSystem {
    /**
     * 两个非线性方程的求解
     * @func 方程组函数
     * @calcJacbiFunc 计算雅各比矩阵
     * @initParams 初始化函数初值
     * @paramEps 容差
     * @validFunc 额外的验证是否结束的函数 // 这个主要是求交用于验证距离满不满足容差的，不是求交可不必传入此函数
     */
    public static execute(
        func: (params: number[]) => number[],
        calcJacbiFunc: (params: number[]) => number[][],
        initParams: number[],
        lengthEps: number = Tol.LENGTH,
        angleEps: number = Tol.ANGLE,
        validFunc?: (params: number[], distEps: number) => boolean,
    ): number[] {
        const dotEps = Math.sin(angleEps);
        const processDistEps = lengthEps * 1e-2;
        const peocessDotEps = Math.sin(angleEps * 1e-2);

        // 计算牛顿迭代函数
        const calcNextIteration = (ts: number[], fs: number[]) => {
            const dfs = calcJacbiFunc(ts);
            if (Math.abs(dfs[0][0] * dfs[1][1] - dfs[0][1] * dfs[1][0]) < Tol.CALCULATE_EPS) {
                return []; // |det| < 0
            }
            const deltaParams = LinearSystem.execute(dfs, fs);
            return deltaParams !== undefined ? deltaParams : [];
        };

        const isSolved = (ts: number[], fs: number[], distEps: number, vDotEps: number) => {
            if (Math.abs(fs[0]) < vDotEps && Math.abs(fs[1]) < vDotEps) {
                if (validFunc === undefined || validFunc(ts, distEps)) {
                    return true;
                }
            }
            return false;
        };

        let iter = 0;
        let params: number[] = initParams;
        let funcs: number[] = func(params);
        let bIsDecrease = true;
        while (iter < CONST.NORMAL_ITER_NUM || bIsDecrease) {
            const deltaParams: number[] = calcNextIteration(params, funcs);
            if (deltaParams.length === 0) {
                return isSolved(params, funcs, lengthEps, dotEps) ? params : [];
            }

            const newParams: number[] = [params[0] - deltaParams[0], params[1] - deltaParams[1]];
            const newFuncs = func(newParams);
            if (isSolved(newParams, newFuncs, processDistEps, peocessDotEps)) {
                return newParams;
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                if (
                    Math.abs(newFuncs[0]) < Math.abs(funcs[0]) - Tol.CALCULATE_EPS &&
                    Math.abs(newFuncs[1]) < Math.abs(funcs[1]) - Tol.CALCULATE_EPS
                ) {
                    bIsDecrease = true; // 如果迭代趋势收敛(距离0更近了)，继续迭代
                }
            }

            params = newParams;
            funcs = newFuncs;
            if (iter > CONST.MAX_ITER_NUM) {
                break;
            }

            iter++;
        }

        return isSolved(params, funcs, lengthEps, dotEps) ? params : [];
    }
}