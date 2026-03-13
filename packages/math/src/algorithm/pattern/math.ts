import { Paths64, PolyPath64 } from "clipper2-wasm/dist/clipper2z";
import { IPoint, Path, Paths } from "./pave";
import * as numeric from 'numeric';



export interface Point<T extends bigint | number> {
    x: T;
    y: T;
}

export function dot(v1: IPoint, another: IPoint) {
    return v1.x * another.x + v1.y * another.y;
}

export function getUVMinMax(uDirNormal: IPoint, vDirNormal: IPoint, path: IPoint[], origin: IPoint) {
    let uMax = -Infinity, uMin = Infinity, vMax = -Infinity, vMin = Infinity;

    path.forEach(pt => {
        const delta = { x: pt.x - origin.x, y: pt.y - origin.y };
        const [u, v] = getParamAtUV(uDirNormal, vDirNormal, delta);
        uMax = Math.max(uMax, u);
        uMin = Math.min(uMin, u);
        vMax = Math.max(vMax, v);
        vMin = Math.min(vMin, v);
    });
    return { uMin, uMax, vMin, vMax };
}

export function getParamAtUV(uDirNormal: IPoint, vDirNormal: IPoint, another: IPoint) {
    const A = [
        [uDirNormal.x, -vDirNormal.x],
        [uDirNormal.y, -vDirNormal.y],
    ];
    const b = [another.x, another.y];

    const intersectSolve = numeric.solve(A, b);
    // intersectSolve[1]是交点到another在v方向上的距离，我们需要的是反过来的
    return [intersectSolve[0], -intersectSolve[1]];
}

export function getPointAt(dir: IPoint, param: number) {
    return { x: dir.x * param, y: dir.x * param };
}

/**
 *
 * @param data  [
                [this._xDir.x, this._xDir.y, 0],
                [this._yDir.x, this._yDir.y, 0],
                [this._origin.x, this._origin.y, 1],
            ],
 */
export function applyMatrix(arr: number[], start: number, matrix: number[][]) {
    const data = matrix;//inv(matrix);
    const x = arr[start] * data[0][0] + arr[start + 1] * data[1][0] + data[2][0];
    const y = arr[start] * data[0][1] + arr[start + 1] * data[1][1] + data[2][1];

    // const w = arr[start] * data[2][0] + arr[start + 1] + data[2][1] + data[2][2];

    arr[start] = x;
    arr[start + 1] = y;

}

export function applyMatrixToPt(pt: IPoint, matrix: number[][]) {
    const data = matrix;//inv(matrix);
    const x = pt.x * data[0][0] + pt.y * data[1][0] + data[2][0];
    const y = pt.x * data[0][1] + pt.y * data[1][1] + data[2][1];

    // const w = arr[start] * data[2][0] + arr[start + 1] + data[2][1] + data[2][2];

    return { x, y };
}

export function multiplyMatrix(A: number[][], B: number[][]) {
    var n = A.length;
    var C: number[][] = [];
    for (var i = 0; i < n; i++) {
        C[i] = [];
        for (var j = 0; j < n; j++) {
            C[i][j] = 0;
            for (var k = 0; k < n; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C;
}

function transpose(matrix: number[][]) {
    let result = new Array(matrix.length).fill(0).map(arr => new Array(matrix[0].length).fill(0));
    for (let i = 0; i < result.length; i++) {
        for (let j = 0; j < result[0].length; j++) {
            result[i][j] = matrix[j][i];
        }
    }
    return result;
}

function det(square: number[][]) {
    // 方阵约束
    if (square.length !== square[0].length) {
        throw new Error();
    }
    // 方阵阶数
    let n = square.length;

    let result = 0;
    if (n > 3) {
        // n 阶
        for (let column = 0; column < n; column++) {
            // 去掉第 0 行第 column 列的矩阵
            let matrix = new Array(n - 1).fill(0).map(arr => new Array(n - 1).fill(0));
            for (let i = 0; i < n - 1; i++) {
                for (let j = 0; j < n - 1; j++) {
                    if (j < column) {
                        matrix[i][j] = square[i + 1][j];
                    } else {
                        matrix[i][j] = square[i + 1][j + 1];
                    }
                }
            }
            result += square[0][column] * Math.pow(-1, 0 + column) * det(matrix);
        }
    } else if (n === 3) {
        // 3 阶
        result = square[0][0] * square[1][1] * square[2][2] +
            square[0][1] * square[1][2] * square[2][0] +
            square[0][2] * square[1][0] * square[2][1] -
            square[0][2] * square[1][1] * square[2][0] -
            square[0][1] * square[1][0] * square[2][2] -
            square[0][0] * square[1][2] * square[2][1];
    } else if (n === 2) {
        // 2 阶
        result = square[0][0] * square[1][1] - square[0][1] * square[1][0];
    } else if (n === 1) {
        // 1 阶
        result = square[0][0];
    }
    return result;
}

function adjoint(square: number[][]) {
    // 方阵约束
    if (square[0].length !== square.length) {
        throw new Error();
    }

    let n = square.length;

    let result = new Array(n).fill(0).map(arr => new Array(n).fill(0));
    for (let row = 0; row < n; row++) {
        for (let column = 0; column < n; column++) {
            // 去掉第 row 行第 column 列的矩阵
            let matrix: number[][] = [];
            for (let i = 0; i < square.length; i++) {
                if (i !== row) {
                    let arr: number[] = [];
                    for (let j = 0; j < square.length; j++) {
                        if (j !== column) {
                            arr.push(square[i][j]);
                        }
                    }
                    matrix.push(arr);
                }
            }
            result[row][column] = Math.pow(-1, row + column) * det(matrix);
        }
    }
    return transpose(result);
}

export function inv(square: number[][]) {
    if (square[0].length !== square.length) {
        throw new Error();
    }
    let detValue = det(square);
    let result = adjoint(square);

    for (let i = 0; i < result.length; i++) {
        for (let j = 0; j < result.length; j++) {
            result[i][j] /= detValue;
        }
    }
    return result;
}
export function getBBox(bg: IPoint[][], offset: number = 0) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

    bg.forEach(path => path.forEach(pt => {
        left = Math.min(pt.x - offset, left);
        top = Math.min(pt.y - offset, top);
        right = Math.max(pt.x + offset, right);
        bottom = Math.max(pt.y + offset, bottom);
    }));
    return { right: right, left: left, bottom: bottom, top: top };
}

export function convert2Js(solution: Paths64, precise: number) {
    const p = precise;
    const pathsSize = solution.size();
    const ret: Paths = new Array(pathsSize);
    for (let i = 0; i < pathsSize; i++) {
        const path = solution.get(i);
        const pathSize = path.size();
        const newPath: Path = new Array(pathSize);
        for (let j = 0; j < pathSize; j++) {
            const pt = path.get(j);
            newPath[j] = { x: Number(pt.x) / p, y: Number(pt.y) / p };
        }

        ret[i] = newPath;
    }

    return ret;
}

export function toArray(path: Path, reversed = false) {
    return reversed ? path.reduceRight((ret, pt) => {
        ret.push(pt.x, pt.y);
        return ret;
    }, [] as number[]) : path.reduce((ret, pt) => {
        ret.push(pt.x, pt.y);
        return ret;
    }, [] as number[]);
}


export function addPolyPathToResult(solution: PolyPath64, joints: Paths[], precise: number, holes: Point<bigint>[][]) {

    const p = precise;
    const polygon = solution.polygon();
    const size = polygon.size();
    if (size > 0) {
        const outer: Path = [];
        const paths: Paths = [outer];
        for (let i = 0; i < size; i++) {
            const pt = polygon.get(i);
            outer.push({ x: Number(pt.x) / p, y: Number(pt.y) / p });
        }
        const count = solution.count();
        for (let i = 0; i < count; i++) {

            const hole = solution.child(i).polygon();
            const pathSize = hole.size();
            const newPath: Path = [];
            const newHolePath: Point<bigint>[] = [];
            for (let j = 0; j < pathSize; j++) {
                const pt = hole.get(j);
                newHolePath[j] = { x: pt.x, y: pt.y };

                newPath[j] = { x: Number(pt.x) / p, y: Number(pt.y) / p };
            }

            paths.push(newPath);
            holes.push(newHolePath);
        }

        joints.push(paths);
    } else {
        const count = solution.count();
        for (let i = 0; i < count; i++)
            addPolyPathToResult(solution.child(i), joints, precise, holes);
    }

}