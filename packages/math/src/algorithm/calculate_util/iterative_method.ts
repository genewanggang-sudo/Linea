import * as numeric from 'numeric';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Curve } from '../../geometry/curve';
import { Curve3 } from '../../geometry/curve3d';
import { Surface } from '../../geometry/surface';
import { LinearSystem } from '../../solve_equations/linear_system';
import { CONST } from '../../type_define/const';
import { types } from '../../type_define/i_types';



export interface ICurvePtInfo<PointType extends Vec> {
    t: number;
    pt: PointType;
}

export interface ICurve2dPtInfo extends ICurvePtInfo<Vec2> {}

export interface ICurve3dPtInfo extends ICurvePtInfo<Vec3> {}

export interface ISurfacePtInfo {
    uv: types.IXY;
    pt: Vec3;
}

export function calSurfaceFootParamIteratively(
    pt: Vec,
    surf: Surface,
    refT: types.IXY,
    tol: number = Tol.length,
): ISurfacePtInfo | undefined {
    return undefined;
}

// 目前没有一个好的方法能正确估计方程根的重数，只能根据统计结果大致推测是否是重根。如果后续探索出来根的重数计算方法，再修改此函数
export function estimateRootMultiplicity(sqrDistProportions: number[]): number {
    const arrayLength = sqrDistProportions.length;
    if (arrayLength < 3) {
        return 1;
    }

    if (
        Math.abs(sqrDistProportions[arrayLength - 1] - sqrDistProportions[arrayLength - 2]) < 0.01 &&
        Math.abs(sqrDistProportions[arrayLength - 2] - sqrDistProportions[arrayLength - 3]) < 0.01
    ) {
        return 2;
    }

    return 1;
}

export function calcNextCurvesIteration<VectorType extends Vec>(
    curve1: Curve<VectorType>,
    curve2: Curve<VectorType>,
    iteration: number[],
): number[] {
    // 计算牛顿迭代函数
    const pts1 = curve1.getDerivatives(iteration[0], 2);
    const pts2 = curve2.getDerivatives(iteration[1], 2);

    const refVect = pts1[0].subtracted(pts2[0]);
    const fx: number[] = [refVect.dot(pts1[1]), refVect.dot(pts2[1])];

    const df1 = [pts1[1].dot(pts1[1]) + refVect.dot(pts1[2]), -pts2[1].dot(pts1[1])];
    const df2 = [pts1[1].dot(pts2[1]), -pts2[1].dot(pts2[1]) + refVect.dot(pts2[2])];

    // |det| < 0
    if (Math.abs(df1[0] * df2[1] - df1[1] * df2[0]) < Tol.CALCULATE_EPS) {
        return [];
    }
    const deltaParams = LinearSystem.execute([df1, df2], fx);
    if (deltaParams === undefined) {
        return [];
    }

    return deltaParams;
}

export function curvesIteration<VectorType extends Vec>(
    curve1: Curve<VectorType>,
    curve2: Curve<VectorType>,
    params: number[],
    tol: Tol = Tol.DEFAULT,
): boolean {
    const sqrEps = tol.lengthEps * tol.lengthEps;
    const sSqrEps = sqrEps * 1e-4;

    let point1 = curve1.getPtAt(params[0]);
    let point2 = curve2.getPtAt(params[1]);
    let sqrDist = point1.sqDistanceTo(point2);
    if (sqrDist < Tol.CALCULATE_EPS2) {
        return true;
    }

    let iter = 0;
    let rootMultiplicity = 1;
    const sqrDistProportions: number[] = [];
    let bIsDecrease: boolean = true;
    for (; iter < CONST.NORMAL_ITER_NUM || bIsDecrease; iter++) {
        rootMultiplicity = rootMultiplicity > 1 ? rootMultiplicity : estimateRootMultiplicity(sqrDistProportions);
        const deltaParams: number[] = calcNextCurvesIteration(curve1, curve2, params);
        if (deltaParams.length === 0) {
            return sqrDist < sqrEps;
        }

        const newParams: number[] = [params[0] - deltaParams[0], params[1] - deltaParams[1]];
        newParams[0] = curve1.getDomain().clamp(newParams[0]);
        newParams[1] = curve2.getDomain().clamp(newParams[1]);

        let newPoint1 = curve1.getPtAt(newParams[0]);
        let newPoint2 = curve2.getPtAt(newParams[1]);
        let newSqDist = newPoint1.sqDistanceTo(newPoint2);
        let sqrDistProportion = newSqDist / sqrDist;
        if (sqrDistProportion > 1 - 0.1) {
            // 回溯，缩减步长，重新计算
            newParams[0] = params[0] - 0.5 * deltaParams[0];
            newParams[1] = params[1] - 0.5 * deltaParams[1];

            newParams[0] = curve1.getDomain().clamp(newParams[0]);
            newParams[1] = curve2.getDomain().clamp(newParams[1]);

            newPoint1 = curve1.getPtAt(newParams[0]);
            newPoint2 = curve2.getPtAt(newParams[1]);
            newSqDist = newPoint1.sqDistanceTo(newPoint2);
            sqrDistProportion = newSqDist / sqrDist;
        }

        if (sqrDistProportion > 1 && newSqDist < Tol.CALCULATE_EPS2) {
            return true; // 快到计算精度极限了，下一次计算不如上次，使用上次的结果
        }

        params[0] = newParams[0];
        params[1] = newParams[1];
        if (newSqDist < Tol.ZERO_JUDGE_EPS2) {
            return true;
        }

        if (
            (point1.sqDistanceTo(newPoint1) < sSqrEps && point2.sqDistanceTo(newPoint2) < sSqrEps) ||
            iter > CONST.MAX_ITER_NUM
        ) {
            return newSqDist < sqrEps;
        }

        if (iter >= CONST.NORMAL_ITER_NUM) {
            bIsDecrease = newSqDist < sqrDist; // 如果迭代趋势收敛，继续迭代
        }

        point1 = newPoint1;
        point2 = newPoint2;
        sqrDist = newSqDist;

        sqrDistProportions.push(sqrDistProportion);
    }

    return sqrDist < sqrEps;
}

// 如果二阶迭代计算跑太远，用一阶迭代
export function calcNextSurfaceSurfaceIterationSimple(
    surface1: Surface,
    surface2: Surface,
    iteration: types.IXY[],
): number[] {
    const pts1: Vec3[] = surface1.getDerivatives(iteration[0], 2);
    const pts2: Vec3[] = surface2.getDerivatives(iteration[1], 2);

    // 因为考虑到不满秩时，svd分解解方程会使u1、v1、u2、v2最小二乘最小化，所以要将参数弧长化，才能将u1、v1、u2、v2正常比例解出来
    const du1Length = 1 / pts1[1].getLength();
    const dv1Length = 1 / pts1[2].getLength();
    const du2Length = 1 / pts2[1].getLength();
    const dv2Length = 1 / pts2[2].getLength();
    pts1[1] = pts1[1].multiply(du1Length);
    pts1[2] = pts1[2].multiply(dv1Length);
    pts2[1] = pts2[1].multiply(du2Length);
    pts2[2] = pts2[2].multiply(dv2Length);

    const refVect: Vec3 = pts1[0].subtracted(pts2[0]);
    const fx: types.numberArr4 = [
        refVect.dot(pts1[1]),
        refVect.dot(pts1[2]),
        refVect.dot(pts2[1]),
        refVect.dot(pts2[2]),
    ];

    const df1: types.numberArr4 = [
        pts1[1].dot(pts1[1]),
        pts1[2].dot(pts1[1]),
        -pts2[1].dot(pts1[1]),
        -pts2[2].dot(pts1[1]),
    ];
    const df2: types.numberArr4 = [
        pts1[1].dot(pts1[2]),
        pts1[2].dot(pts1[2]),
        -pts2[1].dot(pts1[2]),
        -pts2[2].dot(pts1[2]),
    ];
    const df3: types.numberArr4 = [
        pts1[1].dot(pts2[1]),
        pts1[2].dot(pts2[1]),
        -pts2[1].dot(pts2[1]),
        -pts2[2].dot(pts2[1]),
    ];
    const df4: types.numberArr4 = [
        pts1[1].dot(pts2[2]),
        pts1[2].dot(pts2[2]),
        -pts2[1].dot(pts2[2]),
        -pts2[2].dot(pts2[2]),
    ];

    const deltaParams = LinearSystem.execute([df1, df2, df3, df4], fx);
    if (deltaParams === undefined) {
        return [];
    }
    deltaParams[0] *= du1Length;
    deltaParams[1] *= dv1Length;
    deltaParams[2] *= du2Length;
    deltaParams[3] *= dv2Length;

    return deltaParams;
}

export function calcNextSurfaceSurfaceIteration(
    surface1: Surface,
    surface2: Surface,
    iteration: types.IXY[],
): number[] {
    const pts1: Vec3[] = surface1.getDerivatives(iteration[0], 2);
    const pts2: Vec3[] = surface2.getDerivatives(iteration[1], 2);

    const refVect: Vec3 = pts1[0].subtracted(pts2[0]);
    // 计算牛顿迭代函数
    const fx: types.numberArr4 = [
        refVect.dot(pts1[1]),
        refVect.dot(pts1[2]),
        refVect.dot(pts2[1]),
        refVect.dot(pts2[2]),
    ];

    // 一些特殊情况，用2x2方程组求解更快，用4x4也可以，但是不满秩svd分解解方程效率会低很多
    // u向都与vect垂直，方程1、3都已经为0，因此保证u向不动，只求解v向(方程2、4)
    const calcTol = Tol.CALCULATE_EPS;
    if (
        Math.abs(fx[0]) < calcTol &&
        Math.abs(fx[2]) < calcTol &&
        Math.abs(fx[1]) > calcTol &&
        Math.abs(fx[3]) > calcTol
    ) {
        const df2: types.numberArr2 = [pts1[2].dot(pts1[2]) + refVect.dot(pts1[5]), -pts2[2].dot(pts1[2])];
        const df4: types.numberArr2 = [pts1[2].dot(pts2[2]), -pts2[2].dot(pts2[2]) + refVect.dot(pts2[5])];
        const res = LinearSystem.execute([df2, df4], [fx[1], fx[3]]);
        if (res === undefined) {
            return [];
        }

        const deltaParams = [0, res[0], 0, res[1]];
        return deltaParams;
    }

    // v向都与vect垂直，方程2、4都已经为0，因此保证v向不动，只求解u向
    if (
        Math.abs(fx[1]) < calcTol &&
        Math.abs(fx[3]) < calcTol &&
        Math.abs(fx[0]) > calcTol &&
        Math.abs(fx[2]) > calcTol
    ) {
        const df1: types.numberArr2 = [pts1[1].dot(pts1[1]) + refVect.dot(pts1[3]), -pts2[1].dot(pts1[1])];
        const df3: types.numberArr2 = [pts1[1].dot(pts2[1]), -pts2[1].dot(pts2[1]) + refVect.dot(pts2[3])];
        const res = LinearSystem.execute([df1, df3], [fx[0], fx[2]]);
        if (res === undefined) {
            return [];
        }

        const deltaParams = [res[0], 0, res[1], 0];
        return deltaParams;
    }

    const df1: types.numberArr4 = [
        pts1[1].dot(pts1[1]) + refVect.dot(pts1[3]),
        pts1[2].dot(pts1[1]) + refVect.dot(pts1[4]),
        -pts2[1].dot(pts1[1]),
        -pts2[2].dot(pts1[1]),
    ];
    const df2: types.numberArr4 = [
        pts1[1].dot(pts1[2]) + refVect.dot(pts1[4]),
        pts1[2].dot(pts1[2]) + refVect.dot(pts1[5]),
        -pts2[1].dot(pts1[2]),
        -pts2[2].dot(pts1[2]),
    ];
    const df3: types.numberArr4 = [
        pts1[1].dot(pts2[1]),
        pts1[2].dot(pts2[1]),
        -pts2[1].dot(pts2[1]) + refVect.dot(pts2[3]),
        -pts2[2].dot(pts2[1]) + refVect.dot(pts2[4]),
    ];
    const df4: types.numberArr4 = [
        pts1[1].dot(pts2[2]),
        pts1[2].dot(pts2[2]),
        -pts2[1].dot(pts2[2]) + refVect.dot(pts2[4]),
        -pts2[2].dot(pts2[2]) + refVect.dot(pts2[5]),
    ];

    // 如果不满秩，svd解方程会有问题：一种方法是调用一阶迭代；一种办法办法是对一阶导二阶导弧长参数化，然后再求解方程，但是此方法二阶导数计算会有问题，挠曲率会丢失，导致不准确
    const det = numeric.det([df1, df2, df3, df4]);
    if (Math.abs(det) < Tol.CALCULATE_EPS) {
        return calcNextSurfaceSurfaceIterationSimple(surface1, surface2, iteration);
    }

    const deltaParams = LinearSystem.execute([df1, df2, df3, df4], fx);
    if (deltaParams === undefined) {
        return [];
    }

    return deltaParams;
}

// 计算最近距离用
export function calcNextIterationCurveSurface(
    curve: Curve3,
    surf: Surface,
    iteration: number[],
    newIteration: number[],
): boolean {
    const pts1: Vec3[] = curve.getDerivatives(iteration[0], 2);
    const pts2: Vec3[] = surf.getDerivatives(new Vec2(iteration[1], iteration[2]), 2);

    const refVect: Vec3 = pts1[0].subtracted(pts2[0]);
    const fx: types.numberArr3 = [refVect.dot(pts1[1]), refVect.dot(pts2[1]), refVect.dot(pts2[2])];

    const df1: types.numberArr3 = [
        pts1[1].dot(pts1[1]) + refVect.dot(pts1[2]),
        -pts2[1].dot(pts1[1]),
        -pts2[2].dot(pts1[1]),
    ];
    const df2: types.numberArr3 = [
        pts1[1].dot(pts2[1]),
        -pts2[1].dot(pts2[1]) + refVect.dot(pts2[3]),
        -pts2[2].dot(pts2[1]) + refVect.dot(pts2[4]),
    ];
    const df3: types.numberArr3 = [
        pts1[1].dot(pts2[2]),
        -pts2[1].dot(pts2[2]) + refVect.dot(pts2[4]),
        -pts2[2].dot(pts2[2]) + refVect.dot(pts2[5]),
    ];

    const det = numeric.det([df1, df2, df3]);
    if (Math.abs(det) > Tol.CALCULATE_EPS) {
        const deltaParams = LinearSystem.execute([df1, df2, df3], fx);
        if (deltaParams === undefined) {
            return false;
        }

        newIteration[0] = iteration[0] - deltaParams[0];
        newIteration[1] = iteration[1] - deltaParams[1];
        newIteration[2] = iteration[2] - deltaParams[2];
        return true;
    }

    // 矩阵不满秩，有多解，用svd分解解方程的结果会最小化结果，导致参数变化值大小其实不对。因此，需要将一阶导弧长参数化，解出来的参数结果也是弧长参数化的结果
    const d1Length = 1 / pts1[1].getLength();
    const du2Length = 1 / pts2[1].getLength();
    const dv2Length = 1 / pts2[2].getLength();
    pts1[1] = pts1[1].multiply(d1Length);
    pts2[1] = pts2[1].multiply(du2Length);
    pts2[2] = pts2[2].multiply(dv2Length);

    const refVects: Vec3 = pts1[0].subtracted(pts2[0]);
    const fxs: types.numberArr3 = [refVects.dot(pts1[1]), refVects.dot(pts2[1]), refVects.dot(pts2[2])];
    const df1s: types.numberArr3 = [pts1[1].dot(pts1[1]), -pts2[1].dot(pts1[1]), -pts2[2].dot(pts1[1])];
    const df2s: types.numberArr3 = [pts1[1].dot(pts2[1]), -pts2[1].dot(pts2[1]), -pts2[2].dot(pts2[1])];
    const df3s: types.numberArr3 = [pts1[1].dot(pts2[2]), -pts2[1].dot(pts2[2]), -pts2[2].dot(pts2[2])];
    const deltaParams = LinearSystem.execute([df1s, df2s, df3s], fxs);
    if (deltaParams === undefined) {
        return false;
    }

    deltaParams[0] *= d1Length;
    deltaParams[1] *= du2Length;
    deltaParams[2] *= dv2Length;

    newIteration[0] = iteration[0] - deltaParams[0];
    newIteration[1] = iteration[1] - deltaParams[1];
    newIteration[2] = iteration[2] - deltaParams[2];
    return true;
}

// 建议将平面作为surface1传入
export function calcNextIterationThreeSurfaces(
    surface1: Surface,
    surface2: Surface,
    surface3: Surface,
    iteration: types.IXY[],
): number[] {
    const pts1: Vec3[] = surface1.getDerivatives(iteration[0], 1);
    const pts2: Vec3[] = surface2.getDerivatives(iteration[1], 1);
    const pts3: Vec3[] = surface3.getDerivatives(iteration[2], 1);

    // 计算牛顿迭代函数
    const fx = [
        pts1[0].x - pts2[0].x,
        pts1[0].y - pts2[0].y,
        pts1[0].z - pts2[0].z,
        pts2[0].x - pts3[0].x,
        pts2[0].y - pts3[0].y,
        pts2[0].z - pts3[0].z,
    ];

    // 参数u、v、s、t、a、b
    const df1 = [pts1[1].x, pts1[2].x, -pts2[1].x, -pts2[2].x, 0, 0];
    const df2 = [pts1[1].y, pts1[2].y, -pts2[1].y, -pts2[2].y, 0, 0];
    const df3 = [pts1[1].z, pts1[2].z, -pts2[1].z, -pts2[2].z, 0, 0];
    const df4 = [0, 0, pts2[1].x, pts2[2].x, -pts3[1].x, -pts3[2].x];
    const df5 = [0, 0, pts2[1].y, pts2[2].y, -pts3[1].y, -pts3[2].y];
    const df6 = [0, 0, pts2[1].z, pts2[2].z, -pts3[1].z, -pts3[2].z];

    // 如果不满秩，svd解方程会有问题：一种方法是调用一阶迭代；一种办法办法是对一阶导二阶导弧长参数化，然后再求解方程，但是此方法二阶导数计算会有问题，挠曲率会丢失，导致不准确
    const det = numeric.det([df1, df2, df3, df4, df5, df6]);
    if (Math.abs(det) < Tol.CALCULATE_EPS) {
        return [];
    }

    const deltaParams = LinearSystem.execute([df1, df2, df3, df4, df5, df6], fx);
    if (deltaParams === undefined) {
        return [];
    }

    return deltaParams;
}

// useNormalIterFunc: 正常情况下用常规迭代，如果常规迭代计算点跑太远或者计算不出来，用一阶迭代计算精确点
export function surfaceSurfaceIteration(
    surface1: Surface,
    surface2: Surface,
    iteration: types.IXY[],
    lengthEps: number = Tol.LENGTH,
    normalIteration = true,
): boolean {
    const sqrEps = lengthEps * lengthEps;
    const processEps2 = sqrEps * 1e-2;
    let point1 = surface1.getPtAt(iteration[0]);
    let point2 = surface2.getPtAt(iteration[1]);
    let sqrDist = point1.sqDistanceTo(point2);
    if (sqrDist < processEps2) {
        return true; // 有可能一开始的初始点选取就是相交点
    }

    // 连续迭代: 正常情况下，先用两次一阶迭代，再用正常（二阶）迭代。如果失败，就用纯一阶迭代。
    let iter = 0;
    let rootMultiplicity = 1;
    const sqrDistProportions: number[] = [];
    let bIsDecrease: boolean = true;
    for (; iter < CONST.NORMAL_ITER_NUM || bIsDecrease; iter++) {
        rootMultiplicity = rootMultiplicity > 1 ? rootMultiplicity : estimateRootMultiplicity(sqrDistProportions);
        let deltaParams: number[];
        if (normalIteration && iter > 1) {
            deltaParams = calcNextSurfaceSurfaceIteration(surface1, surface2, iteration);
            if (deltaParams.length === 0) {
                return sqrDist < sqrEps;
            }
        } else {
            deltaParams = calcNextSurfaceSurfaceIterationSimple(surface1, surface2, iteration);
            if (deltaParams.length === 0) {
                return sqrDist < sqrEps;
            }
        }

        const newIteration: types.IXY[] = [
            { x: iteration[0].x - deltaParams[0], y: iteration[0].y - deltaParams[1] },
            { x: iteration[1].x - deltaParams[2], y: iteration[1].y - deltaParams[3] },
        ];

        surface1.clampInDomain(newIteration[0]);
        surface2.clampInDomain(newIteration[1]);

        let newPoint1 = surface1.getPtAt(newIteration[0]);
        let newPoint2 = surface2.getPtAt(newIteration[1]);
        let newSqrDist = newPoint1.sqDistanceTo(newPoint2);
        let sqrDistProportion = newSqrDist / sqrDist;
        if (sqrDistProportion > 1 - 0.1) {
            // 回溯，缩减步长，重新计算
            newIteration[0].x = iteration[0].x - 0.5 * deltaParams[0];
            newIteration[0].y = iteration[0].y - 0.5 * deltaParams[1];
            newIteration[1].x = iteration[1].x - 0.5 * deltaParams[2];
            newIteration[1].y = iteration[1].y - 0.5 * deltaParams[3];

            surface1.clampInDomain(newIteration[0]);
            surface2.clampInDomain(newIteration[1]);

            newPoint1 = surface1.getPtAt(newIteration[0]);
            newPoint2 = surface2.getPtAt(newIteration[1]);
            newSqrDist = newPoint1.sqDistanceTo(newPoint2);
            sqrDistProportion = newSqrDist / sqrDist;
        }

        if (sqrDistProportion > 1 && newSqrDist < Tol.CALCULATE_EPS2) {
            return true; // 快到计算精度极限了，下一次计算不如上次，使用上次的结果
        }

        iteration[0] = newIteration[0];
        iteration[1] = newIteration[1];
        if (newSqrDist < Tol.ZERO_JUDGE_EPS2) {
            return true;
        }

        if (
            (point1.sqDistanceTo(newPoint1) < processEps2 && point2.sqDistanceTo(newPoint2) < processEps2) ||
            iter > CONST.MAX_ITER_NUM
        ) {
            return newSqrDist < sqrEps; // 正常迭代结束
        }

        if (iter >= CONST.NORMAL_ITER_NUM) {
            bIsDecrease = newSqrDist < sqrDist - Tol.CALCULATE_EPS2; // 如果迭代趋势收敛，继续迭代
        }

        point1 = newPoint1;
        point2 = newPoint2;
        sqrDist = newSqrDist;

        sqrDistProportions.push(sqrDistProportion);
    }

    // let isValid = sqrDist < sqrTol;
    // isValid = isValid || (iter > 45 && sqrDist < sqrTol * 100); // 遇到相切，就是相当于多重根，收敛非常慢（后续需要处理）,收敛非常慢，认为收敛
    return sqrDist < sqrEps * 10000;
}

export function threeSurfacesIteration(
    surface1: Surface,
    surface2: Surface,
    surface3: Surface,
    iteration: types.IXY[],
    lengthEps: number = Tol.LENGTH,
): boolean {
    const sqrEps = lengthEps * lengthEps;
    const processEps2 = sqrEps * 1e-2;
    let point1 = surface1.getPtAt(iteration[0]);
    let point2 = surface2.getPtAt(iteration[1]);
    let point3 = surface3.getPtAt(iteration[2]);
    let sqrDist1 = point1.sqDistanceTo(point2);
    let sqrDist2 = point1.sqDistanceTo(point3);
    let sqrDist3 = point2.sqDistanceTo(point3);
    if (
        sqrDist1 < Tol.CALCULATE_EPS2 &&
        sqrDist2 < Tol.CALCULATE_EPS2 &&
        sqrDist3 < Tol.CALCULATE_EPS2
    ) {
        return true; // 有可能一开始的初始点选取就是相交点
    }

    let iter = 0;
    let bIsDecrease: boolean = true;
    for (; iter < CONST.NORMAL_ITER_NUM || bIsDecrease; iter++) {
        const deltaParams = calcNextIterationThreeSurfaces(surface1, surface2, surface3, iteration);
        if (deltaParams.length === 0) {
            return sqrDist1 < sqrEps && sqrDist2 < sqrEps && sqrDist3 < sqrEps;
        }

        const newIteration: types.IXY[] = [
            { x: iteration[0].x - deltaParams[0], y: iteration[0].y - deltaParams[1] },
            { x: iteration[1].x - deltaParams[2], y: iteration[1].y - deltaParams[3] },
            { x: iteration[2].x - deltaParams[4], y: iteration[2].y - deltaParams[5] },
        ];

        surface1.clampInDomain(newIteration[0]);
        surface2.clampInDomain(newIteration[1]);
        surface3.clampInDomain(newIteration[2]);

        const newPoint1 = surface1.getPtAt(newIteration[0]);
        const newPoint2 = surface2.getPtAt(newIteration[1]);
        const newPoint3 = surface3.getPtAt(newIteration[2]);
        const newSqrDist1 = newPoint1.sqDistanceTo(newPoint2);
        const newSqrDist2 = newPoint1.sqDistanceTo(newPoint3);
        const newSqrDist3 = newPoint2.sqDistanceTo(newPoint3);

        iteration[0] = newIteration[0];
        iteration[1] = newIteration[1];
        iteration[2] = newIteration[2];

        if (
            (point1.sqDistanceTo(newPoint1) < processEps2 &&
                point2.sqDistanceTo(newPoint2) < processEps2 &&
                point3.sqDistanceTo(newPoint3) < processEps2) ||
            iter > CONST.MAX_ITER_NUM
        ) {
            return newSqrDist1 < sqrEps && newSqrDist2 < sqrEps && newSqrDist3 < sqrEps; // 正常迭代结束
        }

        if (iter >= CONST.NORMAL_ITER_NUM) {
            bIsDecrease =
                newSqrDist1 < sqrDist1 - Tol.CALCULATE_EPS2 &&
                newSqrDist2 < sqrDist2 - Tol.CALCULATE_EPS2 &&
                newSqrDist3 < sqrDist3 - Tol.CALCULATE_EPS2; // 如果迭代趋势收敛，继续迭代
        }

        point1 = newPoint1;
        point2 = newPoint2;
        point3 = newPoint3;
        sqrDist1 = newSqrDist1;
        sqrDist2 = newSqrDist2;
        sqrDist3 = newSqrDist3;
    }

    // let isValid = sqrDist < sqrTol;
    // isValid = isValid || (iter > 45 && sqrDist < sqrTol * 100); // 遇到相切，就是相当于多重根，收敛非常慢（后续需要处理）,收敛非常慢，认为收敛
    return sqrDist1 < sqrEps && sqrDist2 < sqrEps && sqrDist3 < sqrEps;
}