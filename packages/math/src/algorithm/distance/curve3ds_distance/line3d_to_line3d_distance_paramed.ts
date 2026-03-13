import * as numeric from 'numeric';
import { Vec3 } from '../../../base/vec3';
import { types } from '../../../type_define/i_types';



export class Line3dToLine3dDistanceParamed {
    /**
     * 方程求解三维直线到三维直线的距离
     * @param origin1 原点1
     * @param origin2 原点2
     * @param dir1 直线方向1
     * @param dir2 直线方向2
     * @returns 交点在直线1、2上的参数
     */
    public static execute(
        origin1: types.IXYZ,
        origin2: types.IXYZ,
        dir1: types.IXYZ,
        dir2: types.IXYZ,
    ): types.numberArr2 {
        const dp = new Vec3(origin1, origin2);
        const _dir1 = new Vec3(dir1);
        const _dir2 = new Vec3(dir2);
        const A = [
            [_dir1.dot(dir1), -_dir1.dot(dir2)],
            [_dir2.dot(dir1), -_dir2.dot(dir2)],
        ];
        const b = [_dir1.dot(dp), _dir2.dot(dp)];
        const t = numeric.solve(A, b);
        return t as types.numberArr2;
    }
}