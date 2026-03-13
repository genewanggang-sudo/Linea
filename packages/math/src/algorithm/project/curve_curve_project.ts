import { Interval } from '../../base/interval';
import { ILine } from '../../type_define/i_geometry';
import { Vec } from '../../base/vec';



/**
 * curve1 向 curve2 投影，返回一个区间，该区间代表投影后的线在 curve2 参数域上的区间
 */
export class CurvesProject {
    public static lines<VectorType extends Vec>(line1: ILine<VectorType>, line2: ILine<VectorType>): Interval {
        const r1 = line2.getParamAt(line1.getStartPt());
        const r2 = line2.getParamAt(line1.getEndPt());
        return new Interval(r1, r2, true);
    }
}