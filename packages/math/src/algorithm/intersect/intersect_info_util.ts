import { Tol } from '../../base/tol';
import { ICurvesOverlapInfo } from '../overlap/i_overlap';
import { Curve } from '../../geometry/curve';
import { Vec } from '../../base/vec';
import { ICurvesXInfo, ICurvesXInfo2d, ICurvesXInfo3d } from './x_info';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';



export class XInfoUtil {
    public static curvesFromOverlap(
        info: ICurvesOverlapInfo,
        curve1: Curve2,
        curve2: Curve2,
        tol: Tol,
    ): ICurvesXInfo2d;

    public static curvesFromOverlap(
        info: ICurvesOverlapInfo,
        curve1: Curve3,
        curve2: Curve3,
        tol: Tol,
    ): ICurvesXInfo3d;

    public static curvesFromOverlap<PointType extends Vec>(
        info: ICurvesOverlapInfo,
        curve1: Curve<PointType>,
        curve2: Curve<PointType>,
        tol: Tol,
    ): ICurvesXInfo<PointType> {
        const param1 = info.range1.getMid();
        const point = curve1.getPtAt(param1);
        const param2 = curve2.getParamAt(point);
        const isOverlap = info.range1.getLength() > tol.numberEps;
        const ret: ICurvesXInfo<PointType> = {
            point,
            param1,
            param2,
            isOverlap,
        };
        if (isOverlap) {
            ret.overlap1 = info.range1;
            ret.overlap2 = info.range2;
            ret.overlapSameDirection = info.isSameDirection;
        }
        return ret;
    }
}