import { CONST } from '../../../type_define/const';
import { ICurvesXInfo2d, ICurvesXInfo3d } from '../x_info';
import { Ln2 } from '../../../geometry/ln2';
import { Arc2 } from '../../../geometry/arc2d';
import { Ln3 } from '../../../geometry/ln3';
import { Arc3 } from '../../../geometry/arc3d';
import { Plane } from '../../../geometry/plane';
import { Util } from '../../../util/util';
import { Tol } from '../../../base/tol';
import { QuadraticEquation } from '../../../solve_equations/quadratic_equation';
import { Coord2 } from '../../../base/coord2';



/**
 * 直线和圆求交
 */
class LineCircleX {
    /**
     * 求两直线段的交点,若直线重合，则返回某一个交点+重合段
     * > 此接口是求两直线段的交点，直线段是有限长的，若求无限长的直线的交点，可将直线extend至无限长
     * @param line
     * @param arc
     */
    public static line2dAndArc2d(line: Ln2, arc: Arc2, tol = Tol.DEFAULT): ICurvesXInfo2d[] {
        if (!arc.isEqualAB()) {
            return this._line2dAndEllipse2d(line, arc, tol);
        }

        // 判断端点相交
        let isNotTangent = false;
        for (const lineParam of [line.getStartParam(), line.getEndParam()]) {
            for (const arcParam of [arc.getStartParam(), arc.getEndParam()]) {
                if (!line.getPtAt(lineParam).equals(arc.getPtAt(arcParam), tol.lengthEps)) {
                    continue;
                }
                // 判定是否相切
                if (!arc.getTangentAt(arcParam).isParallel(line.getTangentAt(lineParam), tol.angleEps)) {
                    const info = {
                        point: line.getPtAt(lineParam),
                        param1: lineParam,
                        param2: arcParam,
                        isOverlap: false,
                    };
                    return [info];
                }
                // 不相切，需要跳过下面的相切case
                isNotTangent = true;
                break;
            }
        }

        // 圆：几何法求交
        const center = arc.getCenter();
        const footTOnLine = line.getParamAt(center);
        const footPt = line.getPtAt(footTOnLine);
        const dis = center.distanceTo(footPt);
        const sqrDist = dis * dis;
        const radius = (arc.getA() + arc.getB()) / 2;
        const arcParamEps = tol.lengthEps / arc.getRadius();

        // 相切
        if (!isNotTangent && Math.abs(dis - radius) < Tol.LENGTH) {
            const arcT = arc.getParamAt(footPt);
            if (
                line.getRange().containsPt(footTOnLine, tol.lengthEps) &&
                arc.getRange().containsPt(arcT, arcParamEps)
            ) {
                const intInfo: ICurvesXInfo2d = {
                    point: footPt,
                    param1: footTOnLine,
                    param2: arcT,
                    isOverlap: false,
                };
                return [intInfo];
            }
            return [];
        }

        // 相离
        if (dis > radius) {
            return [];
        }

        // 相交
        const calcIntersectPt = (t: number) => {
            const pt = line.getPtAt(t);
            const arcT = arc.getParamAt(pt);
            if (arc.getRange().containsPt(arcT, arcParamEps)) {
                const intRes: ICurvesXInfo2d = {
                    point: pt,
                    param1: t,
                    param2: arcT,
                    isOverlap: false,
                };
                return intRes;
            }
            return undefined;
        };

        const result: ICurvesXInfo2d[] = [];
        const halfChordLength = Math.sqrt(radius * radius - sqrDist);
        const lineT1 = footTOnLine - halfChordLength;
        if (line.getRange().containsPt(lineT1)) {
            const res = calcIntersectPt(lineT1);
            if (res) {
                result.push(res);
            }
        }
        const lineT2 = footTOnLine + halfChordLength;
        if (line.getRange().containsPt(lineT2)) {
            const res = calcIntersectPt(lineT2);
            if (res) {
                result.push(res);
            }
        }

        return result;
    }

    /**
     * 求两直线段的交点,若直线重合，则返回某一个交点+重合段
     * > 此接口是求两直线段的交点，直线段是有限长的，若求无限长的直线的交点，可将直线extend至无限长
     * @param line
     * @param arc
     */
    public static line3dAndArc3d(line: Ln3, arc: Arc3, tol = Tol.DEFAULT): ICurvesXInfo3d[] {
        if (!arc.isEqualAB()) {
            return this._line3dAndEllipse3d(line, arc, tol);
        }

        const circle = arc.clone();
        circle.setRange(0, CONST.PI2);
        const intersectStatus = this.line3dAndCircle3d(line, circle, tol);
        // for (const ret of rets) {
        //     if (!line.getPtAt(ret.param1).equals(ret.point)) {
        //         ret.param1 = line.getParamAt(ret.point);
        //     }
        //     if (!arc.getPtAt(ret.param2).equals(ret.point)) {
        //         ret.param2 = arc.getParamAt(ret.point);
        //     }
        // }
        const arcParamEps = tol.lengthEps / arc.getRadius();
        const rets = intersectStatus.filter(
            it =>
                line.getRange().containsPt(it.param1, tol.lengthEps) &&
                arc.getRange().containsPt(it.param2, arcParamEps),
        );

        for (const info of rets) {
            info.param2 = arc.getRange().getRegularParam(info.param2);
        }
        return rets;
    }

    /**
     * 求三维直线和整圆的交点
     * > 此接口中直线段是无限长的，圆也是一整圈
     * @param line
     * @param circle
     */
    public static line3dAndCircle3d(line: Ln3, arc3: Arc3, tol = Tol.DEFAULT): ICurvesXInfo3d[] {
        const circlePlane = new Plane(arc3.getCoord());
        const dotResult = arc3.getNormal().dot(line.getDirection());
        const closeDis = circlePlane.getProjectedPtBy(line.getOrigin()).distanceTo(line.getOrigin());

        if (Util.isNearly0(dotResult, tol.lengthEps) && !Util.isNearly0(closeDis, tol.lengthEps)) {
            // 直线平行，且不在圆弧所在的平面上
            return [];
        }
        if (!Util.isNearly0(dotResult, tol.lengthEps)) {
            // 求出直线和平面的交点，再判断
            const sign = line.getOrigin().subtracted(circlePlane.getOrigin()).dot(circlePlane.getNorm()) < 0 ? 1 : -1;
            const t1 = (sign * closeDis) / dotResult;
            const intersectPoint = line.getPtAt(t1);
            if (arc3.containsPt(intersectPoint, tol.lengthEps)) {
                const t2 = arc3.getParamAt(intersectPoint);
                return [
                    {
                        point: intersectPoint,
                        param1: t1,
                        param2: t2,
                        isOverlap: false,
                    },
                ];
            }
            return [];
        }

        // 直线和圆共平面，求出交点
        // assume p1 is the intersection point, p1 = p0 + tv, p0 is point in line and v is line direction
        // O is the origin of circle and R is the radius
        // then ||p0 + tv - O||^2 = R^2
        // ||v||^2*t^2 + 2 * v dot (p0 - O) + ||p0 - O||^2 - R^2 = 0
        // A * t^2 + B * t + C = 0
        // A = ||v||^2, B = 2 * v dot (p0 - O) and C = ||p0 - O||^2 - R^2
        // solve the equation

        const result: ICurvesXInfo3d[] = [];
        const A = line.getDirection().dot(line.getDirection());
        const pO = line.getOrigin().subtracted(arc3.getCenter());
        const B = 2 * line.getDirection().dot(pO);
        const C = pO.dot(pO) - arc3.getRadius() * arc3.getRadius();

        const delta = B * B - 4 * A * C;
        if (Util.isNearly0(delta)) {
            const u = (-1 * B) / (2 * A);
            const intersectPoint = line.getPtAt(u);

            const t = arc3.getParamAt(intersectPoint);
            result.push({
                point: intersectPoint,
                param1: u,
                param2: t,
                isOverlap: false,
            });
        } else if (delta < 0) {
            return result;
        } else {
            let u = (-1 * B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
            const intersectPoint1 = line.getPtAt(u);
            let t = arc3.getParamAt(intersectPoint1);
            result.push({
                point: intersectPoint1,
                param1: u,
                param2: t,
                isOverlap: false,
            });

            u = (-1 * B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);
            const intersectPoint2 = line.getPtAt(u);
            t = arc3.getParamAt(intersectPoint2);
            result.push({
                point: intersectPoint2,
                param1: u,
                param2: t,
                isOverlap: false,
            });
        }
        return result;
    }

    /**
     * 求二维直线和椭圆弧的交点
     * @param line
     * @param ellipse
     */
    private static _line2dAndEllipse2d(line: Ln2, ellipse: Arc2, tol: Tol): ICurvesXInfo2d[] {
        // 如果直线过椭圆圆心
        const arcCenter = ellipse.getCenter();
        if (line.containsPt(arcCenter)) {
            const calcIntersectPt = (p: number) => {
                const pt = ellipse.getPtAt(p);
                const t = line.getParamAt(pt);
                if (line.getRange().containsPt(t)) {
                    const intRes: ICurvesXInfo2d = {
                        point: pt,
                        param1: t,
                        param2: p,
                        isOverlap: false,
                    };
                    return intRes;
                }
                return undefined;
            };

            const angle = ellipse.getCoord().getDx().angleTo(line.getDirection());
            const arcT0 = Math.atan2(Math.sin(angle) / ellipse.getB(), Math.cos(angle) / ellipse.getA());
            let arcT = ellipse.isCCW() ? arcT0 : CONST.PI2 - arcT0;
            arcT = ellipse.getRange().getRegularParam(arcT);
            const intRes: ICurvesXInfo2d[] = [];
            if (ellipse.getRange().containsPt(arcT)) {
                const res = calcIntersectPt(arcT);
                if (res) {
                    intRes.push(res);
                }
            }
            const arcT2 = arcT + CONST.PI;
            if (ellipse.getRange().containsPt(arcT2)) {
                const res = calcIntersectPt(arcT2);
                if (res) {
                    intRes.push(res);
                }
            }
            return intRes;
        }

        // 直接解二次方程得到结果：Ax^2 + Bx + C = 0
        const arcCoord = ellipse.getCoord();
        const origPt = line.getOrigin();
        const lineDir = line.getDirection();
        const localLine = new Ln2(
            arcCoord.getLocalPtAt(origPt),
            arcCoord.getLocalVectorAt(lineDir),
            line.getRange().toArray(),
        );
        const pos = localLine.getOrigin();
        const dir = localLine.getDirection();

        const a2 = ellipse.getA() * ellipse.getA();
        const b2 = ellipse.getB() * ellipse.getB();
        const A = dir.x * dir.x * b2 + dir.y * dir.y * a2;
        const B = 2 * dir.x * pos.x * b2 + 2 * dir.y * pos.y * a2;
        const C = pos.x * pos.x * b2 + pos.y * pos.y * a2 - a2 * b2;

        let params = QuadraticEquation.solve(A, B, C);
        if (params.length < 1) {
            return [];
        }
        params = params.filter(p => localLine.getRange().containsPt(p));
        if (params.length < 1) {
            return [];
        }

        const intRes: ICurvesXInfo2d[] = [];
        for (const it of params) {
            const localPt = localLine.getPtAt(it);
            const pt = arcCoord.getWorldPtAt(localPt);
            const arcT = ellipse.getParamAt(pt);
            if (!ellipse.getRange().containsPt(arcT)) {
                continue;
            }

            const intInfo: ICurvesXInfo2d = {
                point: pt,
                param1: it,
                param2: arcT,
                isOverlap: false,
            };
            intRes.push(intInfo);
        }

        if (intRes.length > 1) {
            const xPt1 = intRes[0];
            const pt1 = line.getPtAt(xPt1.param1);
            const xPt2 = intRes[1];
            const pt2 = line.getPtAt(xPt2.param1);
            if (pt2.sqDistanceTo(pt1) < tol.lengthEps * tol.lengthEps) {
                const tangent0 = ellipse.getTangentAt(xPt1.param2);
                const tangent1 = ellipse.getTangentAt(xPt2.param2);

                // 处理相切的两个点，合并
                if (tangent0.isSameDirection(tangent1, tol.angleEps)) {
                    const paramMid = (xPt1.param2 + xPt2.param2) / 2;
                    const midPt = pt2.midTo(pt1);
                    const midPtInfo: ICurvesXInfo2d = {
                        point: midPt,
                        param1: line.getParamAt(midPt),
                        param2: paramMid,
                        isOverlap: false,
                    };
                    return [midPtInfo];
                }
            }
        }

        return intRes;
    }

    private static _line3dAndEllipse3d(line: Ln3, ellipse: Arc3, tol: Tol): ICurvesXInfo3d[] {
        const arcCoord = ellipse.getCoord();
        const localLine = new Ln2(
            arcCoord.getLocalPtAt(line.getOrigin()),
            arcCoord.getLocalVectorAt(line.getDirection()),
            line.getRange().toArray(),
        );

        const xRes: ICurvesXInfo3d[] = [];
        const arc2d = new Arc2(Coord2.XOY(), ellipse.getA(), ellipse.getB(), true, ellipse.getRange().toArray());
        const xRes2ds = this._line2dAndEllipse2d(localLine, arc2d, tol);
        for (const xInfo of xRes2ds) {
            const pt3d = arcCoord.getWorldPtAt(xInfo.point);
            if (line.containsPt(pt3d, tol.lengthEps)) {
                xRes.push({ point: pt3d, param1: line.getParamAt(pt3d), param2: xInfo.param2, isOverlap: false });
            }
        }

        for (const info of xRes) {
            info.param2 = ellipse.getRange().getRegularParam(info.param2);
        }
        return xRes;
    }
}

export { LineCircleX };

