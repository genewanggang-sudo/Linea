import { Curve2 } from '../../geometry/curve2';
import { Ln2 } from '../../geometry/ln2';
import { Arc2 } from '../../geometry/arc2d';
import { types } from '../../type_define/i_types';
import { Tol } from '../../base/tol';
import { IPtCvDistanceInfo2 } from './pt_to_curve_distance_info';
import { CONST } from '../../type_define/const';



/**
 * 点到二维曲线的有向距离
 */
export class PtToCv2Distance {
    /**
     * 点到二维曲线的有向距离
     * 点在直线右侧距离为正，否则为负
     * @param point 任一点
     * @param curve  二维曲线
     */
    public static execute(point: types.IXY, curve: Curve2, signedDistance = false): IPtCvDistanceInfo2 {
        if (curve instanceof Ln2 || (curve instanceof Arc2 && curve.isEqualAB())) {
            return this.simple(point, curve, signedDistance);
        }

        const range = curve.getRange();
        const allFootParams = curve.getAllFootParams(point);
        const allFootParamsInRange = allFootParams.filter(_t => range.containsPt(_t));

        let minParam = range.min;
        let minDist = CONST.MAX_INTEGER;
        for (const t of allFootParamsInRange) {
            const foot = curve.getPtAt(t);
            const dir = curve.getTangentAt(t);
            const dist = -foot.subtracted(point).cross(dir);
            if (Math.abs(dist) < Math.abs(minDist)) {
                minParam = t;
                minDist = signedDistance ? dist : Math.abs(dist);
            }
        }

        if (allFootParamsInRange.length > 0) {
            return {
                param: minParam,
                distance: minDist,
                foot: curve.getPtAt(minParam),
            };
        }

        return this._toCurveEnd(point, curve, minDist > -Tol.PROCESS_LENGTH_EPS, signedDistance);
    }

    public static simple(point: types.IXY, curve: Curve2, signedDistance = false): IPtCvDistanceInfo2 {
        const t = curve.getParamAt(point);
        const foot = curve.getPtAt(t);
        const dir = curve.getTangentAt(t);
        const dist = -foot.subtracted(point).cross(dir);

        if (curve.getRange().containsPt(t)) {
            return {
                param: t,
                distance: signedDistance ? dist : Math.abs(dist),
                foot,
            };
        }
        return this._toCurveEnd(point, curve, dist > -Tol.PROCESS_LENGTH_EPS, signedDistance);
    }

    private static _toCurveEnd(
        point: types.IXY,
        curve: Curve2,
        isOnRight: boolean,
        signedDistance = false,
    ): IPtCvDistanceInfo2 {
        const stPt = curve.getStartPt();
        const edPt = curve.getEndPt();
        const stDist = stPt.distanceTo(point);
        const edDist = edPt.distanceTo(point);
        const range = curve.getRange();

        if (stDist < edDist + Tol.PROCESS_LENGTH_EPS) {
            return {
                param: range.min,
                foot: stPt,
                distance: signedDistance && !isOnRight ? -stDist : stDist,
            };
        }
        return {
            param: range.max,
            foot: edPt,
            distance: signedDistance && !isOnRight ? -edDist : edDist,
        };
    }
}