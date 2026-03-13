import * as numeric from 'numeric';
import { types } from '../../../type_define/i_types';



export class LinesXUtil {
    public static line2dsParamed(
        origin1: types.IXY,
        origin2: types.IXY,
        dir1: types.IXY,
        dir2: types.IXY,
    ): types.numberArr2 {
        const A = [
            [dir1.x, -dir2.x],
            [dir1.y, -dir2.y],
        ];
        const b = [origin2.x - origin1.x, origin2.y - origin1.y];
        return numeric.solve(A, b) as types.numberArr2;
    }
}

