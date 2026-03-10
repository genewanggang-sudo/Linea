import { Mat4 } from '@ccpc/math';

export class CMathUtil {
    public static composeMatrix(mat1?: Mat4, mat2?: Mat4) {
        if (!mat1) return mat2?.clone()
        if (!mat2) return mat1.clone()
        const m = mat1.multiplied(mat2)
        return m
    }
}
