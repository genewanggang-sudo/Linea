import * as numeric from 'numeric';
import { Matrix3 } from '../base/matrix3';
import { Matrix4 } from '../base/matrix4';
import { Tol } from '../base/tol';
import { types } from '../type_define/i_types';
import { MathError } from '../util/math_error';



/**
 * 求解线性方程组：包装了LU和SVD分解解方程，可求解非满秩方程组，但A必须是方阵。// 解不了矛盾方程组
 */
export class LinearSystem {
    public static execute(A: number[][], b: number[]): number[] | undefined {
        if (A.length < 1 || A.length !== A[0].length) {
            return undefined;
        }

        if (A.length === 2) {
            const det0: number = A[0][0] * A[1][1] - A[0][1] * A[1][0];
            const detx: number = b[0] * A[1][1] - b[1] * A[0][1];

            if (Math.abs(det0) < Tol.CALCULATE_EPS) {
                if (Math.abs(A[0][0]) < Tol.NUMBER_CALC_EPS) {
                    if (Math.abs(A[0][0]) < Math.abs(A[1][0])) {
                        [A[0], A[1]] = [A[1], A[0]];
                        [b[0], b[1]] = [b[1], b[0]];
                    } else if (
                        Math.abs(A[0][1]) < Tol.NUMBER_CALC_EPS &&
                        Math.abs(A[0][1]) < Math.abs(A[1][1])
                    ) {
                        [A[0], A[1]] = [A[1], A[0]];
                        [b[0], b[1]] = [b[1], b[0]];
                    }
                }

                if (Math.abs(detx) < Tol.CALCULATE_EPS) {
                    if (Math.abs(A[0][0]) > Math.abs(A[0][1])) {
                        return [b[0] / A[0][0], 0];
                    }
                    return [0, b[0] / A[0][1]];
                }

                // 遇到b[0]十分接近0但不为0的情况，求解结果undefined
                if (
                    Math.abs(b[1]) < Tol.ZERO_JUDGE_EPS &&
                    Math.abs(A[1][0]) < Tol.ZERO_JUDGE_EPS &&
                    Math.abs(A[1][0]) < Tol.ZERO_JUDGE_EPS
                ) {
                    return [b[0] / A[0][0], 0];
                }

                return undefined;
            }

            const det1: number = 1.0 / det0;
            const dety: number = b[1] * A[0][0] - b[0] * A[1][0];

            return [detx * det1, dety * det1];
        }

        const det = numeric.det(A);
        // let conditionA: number; // 矩阵A的条件数
        // if (Math.abs(det) > Tol.CALCULATE_EPS) {
        //     let normA = 0; // A的无穷范数
        //     for (const row of A) {
        //         let rowSum = 0;
        //         for (const aij of row) {
        //             rowSum += Math.abs(aij);
        //         }

        //         if (rowSum > normA) {
        //             normA = rowSum;
        //         }
        //     }

        //     const invA = numeric.inv(A);
        //     let normInvA = 0; // A-1的无穷范数
        //     for (const row of invA) {
        //         let rowSum = 0;
        //         for (const aij of row) {
        //             rowSum += Math.abs(aij);
        //         }

        //         if (rowSum > normInvA) {
        //             normInvA = rowSum;
        //         }
        //     }

        //     conditionA = normA * normInvA;
        // }

        // 满秩矩阵A用LU求解
        if (Math.abs(det) > Tol.CALCULATE_EPS) {
            return numeric.solve(A, b);
        }

        // 非满秩矩阵A用SVD分解: x = V*S*UT*b => multiply(matV.transposed()).multiplied(matS).matU(.transposed().transposed())*b;
        // numeric.svd(A)的得到的是U、S、V，V不是VT。 A = U*S*(V转置)
        // 但是我们的矩阵是列存储，所以new Matrix3(svd.V).transposed()才是V，matU.transposed()是U
        // 所以，A = matU.transposed().multiplied(matS).multiply(matV.transposed().transposed())
        //        = matU.transposed().multiplied(matS).multiply(matV);

        const isValidSVD = (arr: number[]) => {
            for (let i = 0; i < b.length; i++) {
                if (Number.isNaN(arr[i])) {
                    return false;
                }
            }
            return true;
        };

        let svd = numeric.svd(A);
        let iter = 0;
        while (!isValidSVD(svd.S) && iter < 4) {
            const numTol = Tol.ZERO_JUDGE_EPS * 100 ** iter;
            for (const row of A) {
                for (let j = 0; j < row.length; j++) {
                    row[j] = Math.abs(row[j]) < numTol ? 0 : row[j] + numTol;
                }
            }
            svd = numeric.svd(A);
            iter++;
        }

        // 二维不满秩，svd分解结果有问题，因此不能用
        // if (A.length === 2) {
        //     const matInvS: number[][] = [];
        //     for (let i = 0; i < 2; i++) {
        //         const row: number[] = [0, 0];
        //         if (svd.S[i] < Tol.CALCULATE_EPS) {
        //             row[i] = svd.S[i];
        //             matInvS.push(row);
        //         } else {
        //             row[i] = 1 / svd.S[i];
        //             matInvS.push(row);
        //         }
        //     }

        //     const tmp = numeric.dot(svd.V, matInvS);
        //     const vsu = numeric.dot(tmp, numeric.transpose(svd.U));
        //     const xres = numeric.dot(vsu, b); // V*S*UT*b
        //     return xres;
        // }
        if (A.length === 3) {
            const matV: Matrix3 = new Matrix3(svd.V as types.numberArrs3X3);
            const matInvS: Matrix3 = new Matrix3();
            for (let i = 0; i < 3; i++) {
                if (svd.S[i] < Tol.CALCULATE_EPS) {
                    matInvS.set(i, i, svd.S[i]);
                } else {
                    matInvS.set(i, i, 1 / svd.S[i]);
                }
            }
            const matU: Matrix3 = new Matrix3(svd.U as types.numberArrs3X3);

            // const matS: Matrix3 = new Matrix3();
            // for (let i = 0; i < 3; i++) {
            //     matS.set(i, i, svd.S[i]);
            // }
            // const resA = matU.transposed().multiplied(matS).multiply(matV);

            const xres = matV.transposed().multiplied(matInvS).multiply(matU).multipliedVector3([b[0], b[1], b[2]]); // V*S*UT*b
            return xres;
        }
        if (A.length === 4) {
            const matV: Matrix4 = new Matrix4(svd.V as types.numberArrs4X4);
            const matInvS: Matrix4 = new Matrix4();
            for (let i = 0; i < 4; i++) {
                if (svd.S[i] < Tol.CALCULATE_EPS) {
                    matInvS.set(i, i, svd.S[i]);
                } else {
                    matInvS.set(i, i, 1 / svd.S[i]);
                }
            }
            const matU: Matrix4 = new Matrix4(svd.U as types.numberArrs4X4);

            // const matS: Matrix4 = new Matrix4();
            // for (let i = 0; i < 4; i++) {
            //     matS.set(i, i, svd.S[i]);
            // }
            // const resA = matU.transposed().multiplied(matS).multiply(matV);

            //
            const xres = matV
                .transposed()
                .multiplied(matInvS)
                .multiply(matU)
                .multipliedVector4([b[0], b[1], b[2], b[3]]);
            return xres;
        }

        MathError.warn('不支持的类型：矩阵不满秩，且矩阵A的维数 > 4');
        return undefined;
    }
}