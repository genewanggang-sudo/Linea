import { Curve } from '../../geometry/curve';
import { CurvesPJType } from './pj_type';
import { Vec } from '../../base/vec';
import { Util } from '../../util/util';
import { Tol } from '../../base/tol';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { CurvesOverlap } from '../overlap/curves_overlap';
import { Interval } from '../../base/interval';
import { ICurvesOverlapInfo } from '../overlap/i_overlap';



export interface ISimpleXInfo {
    // 交点在第一条曲线上的参数
    param1: number;
    // 交点在第二条曲线上的参数
    param2: number;

    // 是否是重合
    isOverlap: boolean;
    // 若是重合，重合段在第一条曲线上的参数
    overlap1?: Interval;
    // 若是重合，重合段在第二条曲线上的参数
    overlap2?: Interval;
    // 若是重合，两重合段同向时为 true
    overlapDirection?: boolean;
}

/**
 *
 * 两曲线间的重叠关系判断：不重叠、重叠、完全重叠
 */
export class CurvesOverlapJudge {
    public static execute<PointType extends Vec>(
        curve1: Curve<PointType>,
        curve2: Curve<PointType>,
        distanceTol = Tol.LENGTH,
        angleTol = Tol.ANGLE,
    ): CurvesPJType {
        let xInfos: ICurvesOverlapInfo[];
        const tol = new Tol(distanceTol, angleTol);

        if (curve1 instanceof Curve2 && curve2 instanceof Curve2) {
            xInfos = CurvesOverlap.curve2ds(curve1, curve2, tol);
        } else if (curve1 instanceof Curve3 && curve2 instanceof Curve3) {
            xInfos = CurvesOverlap.curve3ds(curve1, curve2, tol);
        } else {
            throw new Error('Unknown curve types');
        }

        const overlaps = xInfos.filter(xInfo => xInfo.range1.getLength() > Tol.NUMBER);

        if (xInfos.length === 0) return CurvesPJType.NOT_INTERSECT;
        if (overlaps.length === 0) return CurvesPJType.INTERSECT_ON;
        if (xInfos.length > 1) return CurvesPJType.OVERLAP;

        const overlap = overlaps[0];
        return Util.isNearlyEqual(overlap.range1.getLength(), curve1.getRange().getLength(), distanceTol) &&
            Util.isNearlyEqual(overlap.range2!.getLength(), curve2.getRange().getLength(), distanceTol)
            ? CurvesPJType.TOTALLY_OVERLAP
            : CurvesPJType.OVERLAP;
    }
}