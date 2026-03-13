import { Ln3 } from '../../geometry/ln3';
import { Curve3 } from '../../geometry/curve3d';
import { Circle3d } from '../../geometry/circle3d';
import { Arc3 } from '../../geometry/arc3d';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { ICurve3dPtInfo } from '../calculate_util/iterative_method';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { types } from '../../type_define/i_types';
import { Tol } from '../../base/tol';
import { IPtCvDistanceInfo3 } from './pt_to_curve_distance_info';
import { PeriodInterval } from '../../base/period_inverval';
import { CONST } from '../../type_define/const';



/**
 * 点到三维曲线的距离
 */
export class PtToCurve3Distance {
    /**
     * 点到三维曲线的距离，直线支持传入有限长和无限长
     * @param point 任一点
     * @param curve  三维曲线
     * @param minDistPoint [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(point: types.IXYZ, curve: Curve3): IPtCvDistanceInfo3 {
        if (curve instanceof Ln3 || curve instanceof Circle3d || (curve instanceof Arc3 && curve.isEqualAB())) {
            return this.simple(point, curve);
        }

        return this.general(point, curve);
    }

    /**
     * 点到三维简单曲线的距离，可传入无限长直线，返回值为正
     * @param point
     * @param line
     */
    public static simple(point: types.IXYZ, curve: Curve3): IPtCvDistanceInfo3 {
        let param = curve.getParamAt(point);
        const range = curve.getRange();
        if (range.containsPt(param)) {
            const foot = curve.getPtAt(param);
            if (PeriodInterval.isPeriod(range) && !range.containsPt(param, 0)) {
                // 使参数回到 [ min, max]
                param -= Math.round((param - range.min) / range.period) * range.period;
            }
            return {
                param,
                foot,
                distance: foot.distanceTo(point),
            };
        }

        const ret = PtToCurve3Distance._sqDistanceToCurveEndAndSingularities(point, curve);
        ret.distance = Math.sqrt(ret.distance);
        return ret;
    }

    public static general(point: types.IXYZ, curve: Curve3): IPtCvDistanceInfo3 {
        const minSqRet = PtToCurve3Distance._sqDistanceToCurveEndAndSingularities(point, curve);

        // footPoint
        const footParam = this._getMinDistFootParamInRange(point, curve);
        if (footParam !== undefined) {
            const footPt = curve.getPtAt(footParam);
            const footSqrDis = footPt.sqDistanceTo(point);

            if (footSqrDis < minSqRet.distance) {
                return {
                    param: footParam,
                    foot: footPt,
                    distance: Math.sqrt(footSqrDis),
                };
            }
        }

        minSqRet.distance = Math.sqrt(minSqRet.distance);
        return minSqRet;
    }

    public static curves(
        point: types.IXYZ,
        curves: Curve3[],
        eps = Tol.LENGTH,
    ): IPtCvDistanceInfo3[] {
        let minDist = CONST.MODEL_MAX_LENGTH;
        const ret: IPtCvDistanceInfo3[] = [];
        for (const crv of curves) {
            const dist = PtToCurve3Distance.execute(point, crv);
            if (dist.distance < minDist - eps) {
                ret.length = 0;
                ret.push(dist);
                minDist = dist.distance;
            } else if (dist.distance < minDist + eps) {
                ret.push(dist);
                if (dist.distance < minDist) minDist = dist.distance;
            }
        }
        return ret;
    }

    private static _sqDistanceToCurveEndAndSingularities(point: types.IXYZ, curve: Curve3): IPtCvDistanceInfo3 {
        const pt0 = curve.getStartPt();
        const ret: IPtCvDistanceInfo3 = {
            param: curve.getStartParam(),
            foot: pt0,
            distance: pt0.sqDistanceTo(point),
        };
        const params = [curve.getRange().max].concat(curve.getSingularities());

        const eps = Tol.PROCESS_LENGTH_EPS;

        for (const t of params) {
            const pt = curve.getPtAt(t);
            const d = pt.sqDistanceTo(point);

            if (d < ret.distance + eps) {
                ret.param = t;
                ret.foot = pt;
                ret.distance = d;
            }
        }
        return ret;
    }

    // 找到参数域内的、距离最小的垂足点
    private static _getMinDistFootParamInRange(pt: types.IXYZ, curve: Curve3): number | undefined {
        if (curve instanceof Arc3) {
            const footParamAlls = curve.getAllFootParams(pt);
            const footParams = footParamAlls.filter(p => curve.getRange().containsPt(p));
            if (footParams.length < 1) {
                return undefined;
            }

            const minPt0 = curve.getPtAt(footParams[0]);
            const footPtInfo: ICurve3dPtInfo = { t: footParams[0], pt: minPt0 };
            let minDist = minPt0.sqDistanceTo(pt);
            for (let i = 1; i < footParams.length; i++) {
                const minPti = curve.getPtAt(footParams[i]);
                const dist = minPti.sqDistanceTo(pt);
                if (dist < minDist) {
                    minDist = dist;
                    footPtInfo.pt = minPti;
                    footPtInfo.t = footParams[i];
                }
            }
            return PeriodInterval.RegularizeParam(footPtInfo.t, CONST.PI2, curve.getRange().min);
        }

        if (curve instanceof NurbsCurve3) {
            return curve.getParamAt(pt);
        }

        if (curve instanceof OffsetCurve3) {
            const rangeMapper = curve.getParamMapper();
            const range = curve.getRange();
            const baseMin = rangeMapper.getBaseParam(range.min, false);
            const baseMax = rangeMapper.getBaseParam(range.max, true);
            const baseRange = PeriodInterval.make(baseMin, baseMax, rangeMapper.getBasePeriod());
            const baseCurve = curve.getBaseCurve();
            const oldRange = baseCurve.getRange().clone();
            baseCurve.setRange(baseRange);
            const dPeriod = baseMin - baseCurve.getRange().min;
            const baseMinT = this._getMinDistFootParamInRange(pt, baseCurve);
            baseCurve.setRange(oldRange);

            if (baseMinT === undefined) {
                return undefined;
            }

            const t = rangeMapper.getParam(baseMinT + dPeriod);
            return t;
        }

        return undefined;
    }
}