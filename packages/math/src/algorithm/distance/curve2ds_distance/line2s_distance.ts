import * as numeric from 'numeric';
import { Ln2 } from '../../../geometry/ln2';
import { Vec2 } from '../../../base/vec2';
import { CurvedDistanceUtil } from '../base_calc_distance/curves_distance_util';
/**
 * 二维线段到二维线段的最近距离
 */
export class Line2sDistance {
    /**
     * 二维直线段到二维直线段的距离
     * @param line1  二维线段
     * @param line2  二维线段
     * @param footPoint1 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     * @param footPoint2 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(line1: Ln2, line2: Ln2, point1?: Vec2, point2?: Vec2): number {
        // 1.解析计算，判断两条直线是否相交
        if (!line1.isParallelTo(line2)) {
            const dir1 = line1.getDirection();
            const dir2 = line2.getDirection();
            const p12: Vec2 = line2.getOrigin().subtracted(line1.getOrigin());



            const A = [
                [dir1.x, -dir2.x],
                [dir1.y, -dir2.y],
            ];
            const b = [p12.x, p12.y];
            const t = numeric.solve(A, b);

            if (line1.getRange().containsPt(t[0]) && line2.getRange().containsPt(t[1])) {
                if (point1) {
                    point1.copy(line1.getPtAt(t[0]));
                }

                if (point2) {
                    point2.copy(line2.getPtAt(t[1]));
                }

                return 0.0;
            }
        }

        // 2.否则，最小距离一定在直线端点处取得
        return CurvedDistanceUtil.minAtEnds2d(line1, line2, point1, point2);
    }
}