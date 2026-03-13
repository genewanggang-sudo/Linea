import { Vec2 } from '../../base/vec2';
import { Curve2 } from '../../geometry/curve2';
import { Arc2 } from '../../geometry/arc2d';
import { Ln2 } from '../../geometry/ln2';
import { Line2sDistance } from './curve2ds_distance/line2s_distance';
import { Line2dToArc2dDistance } from './curve2ds_distance/line2d_to_arc2d_distance';
import { Arc2sDistance } from './curve2ds_distance/arc2s_distance';



/**
 * 二维曲线到二维曲线的最近距离
 */
export class Curve2sDistance {
    /**
     * 二维曲线到二维曲线的最近距离
     * @param curve  二维曲线
     * @param curve  二维曲线
     * @param footPoint1 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     * @param footPoint2 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(curve1: Curve2, curve2: Curve2, footPoint1?: Vec2, footPoint2?: Vec2): number {
        if (curve1 instanceof Ln2 && curve2 instanceof Ln2) {
            return Line2sDistance.execute(curve1, curve2, footPoint1, footPoint2);
        }

        if (curve1 instanceof Ln2 && curve2 instanceof Arc2) {
            return Line2dToArc2dDistance.execute(curve1, curve2, footPoint1, footPoint2);
        }
        if (curve1 instanceof Arc2 && curve1.isEqualAB() && curve2 instanceof Ln2) {
            return Line2dToArc2dDistance.execute(curve2, curve1, footPoint2, footPoint1);
        }

        if (curve1 instanceof Arc2 && curve1.isEqualAB() && curve2 instanceof Arc2 && curve2.isEqualAB()) {
            return Arc2sDistance.execute(curve1, curve2, footPoint1, footPoint2);
        }

        throw new Error(`请实现点到曲线距离${curve1.getType()}${curve2.getType()}`);
    }
}