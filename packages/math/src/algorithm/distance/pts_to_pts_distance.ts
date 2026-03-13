import { CONST } from '../../type_define/const';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
/**
 * 点集到点集的最近距离
 */
export class PtsToPtsDistance {
    public static execute(
        ptSet1: Array<Vec>,
        ptSet2: Array<Vec>,
        minDisPoint1: Vec,
        minDisPoint2: Vec,
    ): number {
        let minSqrDist: number = CONST.MAX_INTEGER;
        for (const pt1 of ptSet1) {
            for (const pt2 of ptSet2) {
                const ptSqrDist: number = pt1.sqDistanceTo(pt2);
                if (ptSqrDist < minSqrDist) {
                    minSqrDist = ptSqrDist;
                    minDisPoint1.copy(pt1);
                    minDisPoint2.copy(pt2);



                    if (minSqrDist < Tol.LENGTH) {
                        return Math.sqrt(minSqrDist);
                    }
                }
            }
        }

        return Math.sqrt(minSqrDist);
    }
}