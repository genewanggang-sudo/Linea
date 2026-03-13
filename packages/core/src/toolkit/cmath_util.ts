import { Matrix4 } from '@ccpc/math';

export class CMathUtil {
    public static composeMatrix(mat1?: Matrix4, mat2?: Matrix4) {
        if (!mat1) return mat2?.clone()
        if (!mat2) return mat1.clone()
        const m = mat1.multiplied(mat2)
        return m
    }
}
