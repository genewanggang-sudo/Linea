import { Util } from '../../../util/util';
import { Tol } from '../../../base/tol';
import { Ln2 } from '../../../geometry/ln2';
import { Arc2 } from '../../../geometry/arc2d';
import { Vec2 } from '../../../base/vec2';
import { CurvedDistanceUtil } from '../base_calc_distance/curves_distance_util';



/**
 * 二维线段到二维圆弧的最近距离
 */
export class Line2dToArc2dDistance {
    /**
     * 二维线段到二维圆弧的距离
     * @param line  二维线段
     * @param arc  二维圆弧
     * @param point1 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     * @param point2 [out] 输出参数(可选)，若用户想要获取垂足点，则传入该参数
     */
    public static execute(line: Ln2, arc: Arc2, point1?: Vec2, point2?: Vec2): number {
        const center = arc.getCenter();
        const radius: number = arc.getRadius();
        const lineDir = line.getDirection();

        const lineNormal: Vec2 = new Vec2(lineDir.y, -lineDir.x);
        const lineStartPt: Vec2 = line.getStartPt().subtract(center);
        const minDis: number = Math.abs(lineStartPt.dot(lineNormal)); // 圆心到直线最近距离

        const footLineT = line.getParamAt(center);
        const footPt: Vec2 = line.getPtAt(footLineT);
        const footArcT = arc.getParamAt(footPt);

        // 1.Line2d和Arc2d相交
        if (Util.isNearlySmallerOrEqual(minDis, arc.getRadius(), Tol.LENGTH)) {
            const halfChordLength: number = Math.sqrt(radius * radius - minDis * minDis); // 相切与相交并在一起，在近似相切时，利用弦长计算切点，浮点数运算可能会引起问题，但出浮点数运算问题概率很小
            const lineT1: number = footLineT - halfChordLength;
            const lineT2: number = footLineT + halfChordLength;
            const intPt: Vec2 = new Vec2();
            if (this._IsIntPtInRange(line, arc, lineT1, intPt) || this._IsIntPtInRange(line, arc, lineT2, intPt)) {
                if (point1) {
                    point1.copy(intPt);
                }
                if (point2) {
                    point2.copy(intPt);
                }
                return 0.0;
            }
        }

        // 2.若圆心与垂足的连线，同时与arc和line相交，则最小距离为圆心到直线的垂直距离减去半径
        if (
            minDis > arc.getRadius() &&
            line.getRange().containsPt(footLineT) &&
            arc.getRange().containsPt(footArcT)
        ) {
            const realMinDist: number = minDis - radius;
            if (point1) {
                point1.copy(line.getPtAt(footLineT));
            }
            if (point2) {
                point2.copy(arc.getPtAt(footArcT));
            }
            // point1T = footLineT;
            // point2T = footArcT;
            return realMinDist;
        }

        // 3.否则，最小距离一定在直线端点或者圆弧端点处取得
        return CurvedDistanceUtil.minAtEnds2d(line, arc, point1, point2);
    }

    // 判断交点是否在line和arc的曲线上
    private static _IsIntPtInRange(line: Ln2, arc: Arc2, lineT: number, intPoint: Vec2): boolean {
        if (line.getRange().containsPt(lineT)) {
            const intersectPt: Vec2 = line.getPtAt(lineT);
            const intersectArcT: number = arc.getParamAt(intersectPt);
            if (arc.getRange().containsPt(intersectArcT)) {
                intPoint.copy(intersectPt);
                // intT1 = lineT;
                // intT2 = intersectArcT;
                return true;
            }
            return false;
        }
        return false;
    }
}