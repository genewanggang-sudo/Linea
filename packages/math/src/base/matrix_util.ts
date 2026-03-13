import * as numeric from 'numeric';
import { types } from '../type_define/i_types';



export function isExpectedSqureMatrix(m: number[][], expectDim: number) {
    const [dim0, dim1] = numeric.dim(m);
    return dim0 === dim1 && expectDim === dim0;
}

export function convertToMatrix3(
    matrix: types.IMatrix3 | types.IMatrix4 | types.numberArrs3X3 | types.numberArrs4X4,
): types.numberArrs3X3 {
    const data: number[][] = (matrix as any).data || matrix;
    if (data.length === 3) {
        return data as any;
    }
    return [
        [data[0][0], data[0][1], data[0][3]],
        [data[1][0], data[1][1], data[1][3]],
        [data[3][0], data[3][1], data[3][3]],
    ];
}

export function convertToMatrix4(
    matrix: types.IMatrix3 | types.IMatrix4 | types.numberArrs3X3 | types.numberArrs4X4,
): types.numberArrs4X4 {
    const data: types.numberArrs4X4 = (matrix as any).data || matrix;
    if (data.length === 4) {
        return data as any;
    }
    return [
        [data[0][0], data[0][1], 0, data[0][2]],
        [data[1][0], data[1][1], 0, data[1][2]],
        [0, 0, 1, 0],
        [data[2][0], data[2][1], 0, data[2][2]],
    ];
}

export function isMirror(m: types.IMatrix3 | types.IMatrix4 | types.numberArrs3X3 | types.numberArrs4X4): boolean {
    const data: number[][] = (m as any).data || m;
    return numeric.det(data) < 0;
}