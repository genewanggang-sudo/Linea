import { Vec3 } from '../../base/vec3';
import { CONST } from '../../type_define/const';
import { Tol } from '../../base/tol';
import { Curve3 } from '../../geometry/curve3d';
import { Ln3 } from '../../geometry/ln3';
import { PtsToPtsDistance } from './pts_to_pts_distance';
import { PtsToCurvesDistance } from './pts_to_curves_distance';
import { CurvedDistanceUtil } from './base_calc_distance/curves_distance_util';
import { Curve3dSegment, Curve3dSegmentPair } from '../calculate_util/geometry_subdevide_infos';
import { Line3dToLine3dDistanceParamed } from './curve3ds_distance/line3d_to_line3d_distance_paramed';



/**
 * 三维曲线到三维曲线的最近距离
 */
export class Curve3sDistance {
    /**
     * 三维曲线到三维曲线的距离
     * @param curve  三维曲线
     * @param curve  三维曲线
     * @param minDisPoint1 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     * @param minDisPoint2 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     */
    public static execute(curve1: Curve3, curve2: Curve3, minDisPoint1?: Vec3, minDisPoint2?: Vec3): number {
        if (curve1.isLine3d() && curve2.isLine3d()) {
            return this._Line3dToLine3dDistance(curve1 as Ln3, curve2 as Ln3, minDisPoint1, minDisPoint2);
        }
        // else if (curve1.getType() === EN_GEO_TYPE.EN_ARC_3D && curve2.getType() === EN_GEO_TYPE.EN_ARC_3D) {
        // return Arc2sDistance.execute(curve1 as Arc2, curve2 as Arc2, minDisPoint1, minDisPoint2);
        // }
        // else if (){
        //
        // }
        return this._Curve3dToCurve3dDistance(curve1, curve2, minDisPoint1, minDisPoint2);
        // throw new Error(`请实现点到曲线距离${curve1.getType()}${curve2.getType()}`);
    }

    /**
     * 空间中两三维直线间的距离
     * @param line1
     * @param line2
     * @param point1 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     * @param point2 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     */
    private static _Line3dToLine3dDistance(line1: Ln3, line2: Ln3, point1?: Vec3, point2?: Vec3): number {
        // 1.相交和异面直线的垂足都在参数域内的情况
        if (!line1.isParallelTo(line2)) {
            // 求两异面直线的最近距离点参数
            const t = Line3dToLine3dDistanceParamed.execute(
                line1.getOrigin(),
                line2.getOrigin(),
                line1.getDirection(),
                line2.getDirection(),
            );

            if (line1.getRange().containsPt(t[0]) && line2.getRange().containsPt(t[1])) {
                const resPt1: Vec3 = line1.getPtAt(t[0]);
                const resPt2: Vec3 = line2.getPtAt(t[1]);
                if (point1) {
                    point1.copy(resPt1);
                }
                if (point2) {
                    point2.copy(resPt2);
                }

                return resPt1.distanceTo(resPt2);
            }
        }

        // 2.否则，最小距离一定在直线端点处取得
        return CurvedDistanceUtil.minAtEnds3d(line1, line2, point1, point2);
    }

    /**
     * 空间中两三维曲线间的距离
     * @param curve3d1
     * @param curve3d2
     * @param point1 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     * @param point2 [out] 输出参数(可选)，若用户想要获取最近距离点，则传入该参数
     */
    private static _Curve3dToCurve3dDistance(
        curve3d1: Curve3,
        curve3d2: Curve3,
        point1?: Vec3,
        point2?: Vec3,
    ): number {
        let minDis: number = CONST.MAX_INTEGER;
        const curve3dSegments1: Curve3dSegment[] = [];
        const curve3dSegments2: Curve3dSegment[] = [];

        const segmt1: Curve3dSegment = new Curve3dSegment(curve3d1);
        segmt1.range = curve3d1.getRange();
        segmt1.depth = 0;
        const segmt2: Curve3dSegment = new Curve3dSegment(curve3d2);
        segmt2.range = curve3d2.getRange();
        segmt2.depth = 0;

        curve3dSegments1.push(segmt1);
        curve3dSegments2.push(segmt2);

        // 获得曲线的顶点集
        const pts1: Vec3[] = Curve3dSegment.getEndPoints<Vec3>(curve3dSegments1);
        const pts2: Vec3[] = Curve3dSegment.getEndPoints<Vec3>(curve3dSegments2);

        // 计算曲线端点之间的最近距离
        const tmpMinDisPt1: Vec3 = new Vec3();
        const tmpMinDisPt2: Vec3 = new Vec3();
        let tmpMinDis: number = PtsToPtsDistance.execute(pts1, pts2, tmpMinDisPt1, tmpMinDisPt2);
        if (tmpMinDis < minDis) {
            minDis = tmpMinDis;
            if (point1) {
                point1.copy(tmpMinDisPt1);
            }
            if (point2) {
                point2.copy(tmpMinDisPt2);
            }

            if (minDis < Tol.LENGTH) {
                return minDis;
            }
        }

        // 计算点线之间的最近距离
        const curve3ds2: Curve3[] = [curve3d2];
        tmpMinDis = PtsToCurvesDistance.execute(pts1, curve3ds2, tmpMinDisPt1, tmpMinDisPt2, minDis);
        if (tmpMinDis < minDis) {
            minDis = tmpMinDis;
            if (point1) {
                point1.copy(tmpMinDisPt1);
            }
            if (point2) {
                point2.copy(tmpMinDisPt2);
            }

            if (minDis < Tol.LENGTH) {
                return minDis;
            }
        }

        const curve3ds1: Curve3[] = [curve3d1];
        tmpMinDis = PtsToCurvesDistance.execute(pts2, curve3ds1, tmpMinDisPt2, tmpMinDisPt1, minDis);
        if (tmpMinDis < minDis) {
            minDis = tmpMinDis;
            if (point1) {
                point1.copy(tmpMinDisPt1);
            }
            if (point2) {
                point2.copy(tmpMinDisPt2);
            }

            if (minDis < Tol.LENGTH) {
                return minDis;
            }
        }

        // 初始化曲线对儿
        const curveSegmentPairs: Curve3dSegmentPair[] = [];
        const segPair = new Curve3dSegmentPair(segmt1, segmt2);
        curveSegmentPairs.push(segPair);

        // 计算线线之间的最近距离
        tmpMinDis = CurvedDistanceUtil.execute(
            curve3dSegments1,
            curve3dSegments2,
            curveSegmentPairs,
            tmpMinDisPt1,
            tmpMinDisPt2,
            minDis,
        );
        if (tmpMinDis < minDis) {
            minDis = tmpMinDis;
            if (point1) {
                point1.copy(tmpMinDisPt1);
            }
            if (point2) {
                point2.copy(tmpMinDisPt2);
            }
        }

        return minDis;
    }
}