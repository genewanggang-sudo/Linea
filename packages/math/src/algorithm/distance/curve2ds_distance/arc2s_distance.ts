import { Util } from '../../../util/util';
import { CONST } from '../../../type_define/const';
import { Tol } from '../../../base/tol';
import { Arc2 } from '../../../geometry/arc2d';
import { Vec2 } from '../../../base/vec2';
import { CurvedDistanceUtil } from '../base_calc_distance/curves_distance_util';



/**
 * 二维圆弧到二维圆弧的最近距离
 */
export class Arc2sDistance {
    /**
     * 二维圆弧到二维圆弧的距离
     * @param arc1  二维圆弧
     * @param arc2  二维圆弧
     * @param footPoint1 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     * @param footPoint2 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(arc1: Arc2, arc2: Arc2, minDisPoint1?: Vec2, minDisPoint2?: Vec2): number {
        const arc1Center: Vec2 = arc1.getCenter();
        const arc2Center: Vec2 = arc2.getCenter();
        const arc1Radius: number = arc1.getRadius();
        const arc2Radius: number = arc2.getRadius();
        const disArcCenter: number = arc1Center.distanceTo(arc2Center);

        // 同心圆,无法用getNearestT()计算T,直接在端点处取最近距离
        if (disArcCenter < Tol.LENGTH) {
            return CurvedDistanceUtil.minAtEnds2d(arc1, arc2, minDisPoint1, minDisPoint2);
        }

        // 求一个圆心在另一个圆上的NearestT，分情况：两个圆心在公共弦的一边和两边
        let nearestArc1T: number;
        let nearestArc2T: number;
        if (arc1Radius > arc2Radius) {
            nearestArc1T = arc1.getParamAt(arc2Center);
            if (arc1Radius * arc1Radius - arc2Radius * arc2Radius > disArcCenter * disArcCenter) {
                nearestArc2T = arc2.getParamAt(arc1.getPtAt(nearestArc1T));
            } else {
                nearestArc2T = arc2.getParamAt(arc1Center);
            }
        } else {
            nearestArc2T = arc2.getParamAt(arc1Center);
            if (arc2Radius * arc2Radius - arc1Radius * arc1Radius > disArcCenter * disArcCenter) {
                nearestArc1T = arc1.getParamAt(arc2.getPtAt(nearestArc2T));
            } else {
                nearestArc1T = arc1.getParamAt(arc2Center);
            }
        }

        // 1.相交、相切，则距离为0
        const intPt: Vec2 = new Vec2();
        if (this._IsIntsectTwoArc2d(arc1, arc2, nearestArc1T, nearestArc2T, intPt)) {
            if (minDisPoint1) {
                minDisPoint1.copy(intPt);
            }
            if (minDisPoint2) {
                minDisPoint2.copy(intPt);
            }

            return 0.0;
        }

        // 2.1相离，且圆心连线交点在参数域内，在非端点取极值
        if (disArcCenter > arc1Radius + arc2Radius) {
            if (arc1.getRange().containsPt(nearestArc1T) && arc2.getRange().containsPt(nearestArc2T)) {
                const minDis: number = Math.abs(disArcCenter - (arc1Radius + arc2Radius));
                if (minDisPoint1) {
                    minDisPoint1.copy(arc1.getPtAt(nearestArc1T));
                }
                if (minDisPoint2) {
                    minDisPoint2.copy(arc2.getPtAt(nearestArc2T));
                }

                return minDis;
            }
        } else if (Math.abs(arc1Radius - arc2Radius) > disArcCenter) {
            // 2.2内含(考虑如果一个圆是否把另一个圆包含在内),且圆心连线延长线的交点在参数域内，在非端点取极值
            if (arc1.getRange().containsPt(nearestArc1T) && arc2.getRange().containsPt(nearestArc2T)) {
                const minDis: number = Math.abs(arc1Radius - arc2Radius) - disArcCenter;
                if (minDisPoint1) {
                    minDisPoint1.copy(arc1.getPtAt(nearestArc1T));
                }
                if (minDisPoint2) {
                    minDisPoint2.copy(arc2.getPtAt(nearestArc2T));
                }

                return minDis;
            }
        }

        // 3.否则，必然在其中一圆弧的端点处取得
        return CurvedDistanceUtil.minAtEnds2d(arc1, arc2, minDisPoint1, minDisPoint2);
    }

    // 简单判断圆弧是否相交
    private static _IsIntsectTwoArc2d(
        arc1: Arc2,
        arc2: Arc2,
        nearestArc1T: number,
        nearestArc2T: number,
        intPoint: Vec2,
    ): boolean {
        const arc1Center: Vec2 = arc1.getCenter();
        const arc2Center: Vec2 = arc2.getCenter();
        const arc1Radius: number = arc1.getRadius();
        const arc2Radius: number = arc2.getRadius();
        const disArcCenter: number = arc1Center.distanceTo(arc2Center);
        if (
            Util.isNearlySmallerOrEqual(disArcCenter, arc1Radius + arc2Radius, Tol.LENGTH) &&
            Util.isNearlyBiggerOrEqual(disArcCenter, Math.abs(arc1Radius - arc2Radius), Tol.LENGTH)
        ) {
            if (
                Util.isNearlyEqual(disArcCenter, arc1Radius + arc2Radius, Tol.LENGTH) ||
                Util.isNearlyEqual(disArcCenter, Math.abs(arc1Radius - arc2Radius), Tol.LENGTH)
            ) {
                // 外切内切
                if (arc1.getRange().containsPt(nearestArc1T) && arc2.getRange().containsPt(nearestArc2T)) {
                    intPoint.copy(arc1.getPtAt(nearestArc1T));
                    return true;
                }
            } else {
                // 相交
                const arc1CToChordLen: number =
                    Math.abs(arc1Radius * arc1Radius - arc2Radius * arc2Radius + disArcCenter * disArcCenter) /
                    (2 * disArcCenter);
                const angleHalfChord1: number = Math.acos(arc1CToChordLen / arc1Radius);
                const int1T: number = nearestArc1T - angleHalfChord1;
                const int2T: number = nearestArc1T + angleHalfChord1;
                const intPt: Vec2 = new Vec2();
                if (this._IsIntPtInRange(arc1, arc2, int1T, intPt) || this._IsIntPtInRange(arc1, arc2, int2T, intPt)) {
                    intPoint.copy(intPt);
                    return true;
                }
            }
        }
        return false;
    }

    private static _IsIntPtInRange(arc1: Arc2, arc2: Arc2, arc1T: number, intPoint: Vec2): boolean {
        let intersectArc1T: number = arc1T; // 调整到参数域内
        while (Util.isNearlySmaller(intersectArc1T, arc1.getRange().min, Tol.LENGTH)) {
            intersectArc1T += CONST.PI2;
        }
        while (Util.isNearlyBigger(intersectArc1T, arc1.getRange().max, Tol.LENGTH)) {
            intersectArc1T -= CONST.PI2;
        }

        const intPt: Vec2 = arc1.getPtAt(intersectArc1T);
        const intersectArc2T: number = arc2.getParamAt(intPt);

        if (arc1.getRange().containsPt(intersectArc1T) && arc2.getRange().containsPt(intersectArc2T)) {
            intPoint.copy(intPt);
            return true;
        }
        return false;
    }
}

