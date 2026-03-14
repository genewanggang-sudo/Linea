import { Matrix4 } from '@ccpc/math';
import { Matrix4 as ThreeMatrix4 } from 'three';

export class ThreeUtil {
    public static mathMatrix4toThreeMatrix4(mat: Matrix4) {
        const [r0, r1, r2, r3] = mat.data;
        return new ThreeMatrix4().set(
            r0[0], r1[0], r2[0], r3[0],
            r0[1], r1[1], r2[1], r3[1],
            r0[2], r1[2], r2[2], r3[2],
            r0[3], r1[3], r2[3], r3[3],
        );
    }
}
