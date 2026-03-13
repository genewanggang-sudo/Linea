import { Vec2 } from '../../../base/vec2';
import { Util } from '../../../util/util';
import { Arc2 } from '../../../geometry/arc2d';
import { Arc3 } from '../../../geometry/arc3d';
import { Vec3 } from '../../../base/vec3';
import { Plane } from '../../../geometry/plane';
import { SurfacesX } from '../surfaces_x';
import { LineCircleX } from './linear_circular_x';
import { Ln3 } from '../../../geometry/ln3';
import { Tol } from '../../../base/tol';
import { ICurvesXInfo2d, ICurvesXInfo3d } from '../x_info';
import { CurvesOverlap } from '../../overlap/curves_overlap';
import { CurvesXUtil } from '../curves_x_util';
import { Coord2 } from '../../../base/coord2';
import { Ln2 } from '../../../geometry/ln2';
import { Interval } from '../../../base/interval';
import { XInfoUtil } from '../intersect_info_util';



/**
 * 圆和圆求交
 */
class CircularsX {
    /**
     * 求两圆弧的交点,若圆弧重合，则返回某一个交点+重合段
     * > 此接口是求两有限长圆弧的交点
     * @param arc1
     * @param arc2
     */
    public static arc2dAndArc2d(arc1: Arc2, arc2: Arc2, tol = Tol.DEFAULT): ICurvesXInfo2d[] {
        // 重合判断：不分椭圆和圆
        const overlaps = CurvesOverlap.arcs<Vec2>(arc1, arc2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, arc1, arc2, tol));
            return rets;
        }

        // 椭圆求交
        if (!arc1.isEqualAB() || !arc2.isEqualAB()) {
            return this._ellipse2s(arc1, arc2, tol);
        }

        // 两个圆求交
        return this._circle2dAndCircle2d(arc1, arc2, tol.lengthEps);
    }

    /**
     * 求两圆（椭圆）弧的交点，若圆弧重合，则返回某一个交点+重合段
     * @param arc1
     * @param arc2
     */
    public static arc3dAndArc3d(arc1: Arc3, arc2: Arc3, tol = Tol.DEFAULT): ICurvesXInfo3d[] {
        // 重合判断
        const overlaps = CurvesOverlap.arcs<Vec3>(arc1, arc2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, arc1, arc2, tol));
            return rets;
        }

        // 两个圆（椭圆）相交
        const result: ICurvesXInfo3d[] = [];

        const circlePlane1 = new Plane(arc1.getCenter(), arc1.getCoord().getDx(), arc1.getCoord().getDy());
        const circlePlane2 = new Plane(arc2.getCenter(), arc2.getCoord().getDx(), arc2.getCoord().getDy());
        const bNormalParellel = circlePlane1.getNorm().isParallel(circlePlane2.getNorm(), tol.angleEps);
        if (bNormalParellel) {
            const dotResult = arc1.getCenter().subtract(arc2.getCenter()).dot(circlePlane1.getNorm());
            // 两个圆在同一个平面
            if (Util.isNearly0(dotResult, tol.lengthEps)) {
                // 变换到同一坐标系下二维圆弧求交, 三维圆弧和二维圆弧参数保持一致
                const arc2d1 = new Arc2(Coord2.XOY(), arc1.getA(), arc1.getB(), true, arc1.getRange().toArray());
                const coord3d1 = arc1.getCoord();
                const coord3d2 = arc2.getCoord();
                const coord2 = new Coord2(
                    coord3d1.getLocalPtAt(coord3d2.getOrigin()),
                    coord3d1.getLocalVectorAt(coord3d2.getDx()),
                );
                const sameDz = circlePlane1.getNorm().dot(circlePlane2.getNorm()) > 0;
                const arc2d2 = new Arc2(coord2, arc2.getA(), arc2.getB(), sameDz, arc2.getRange().toArray());
                let arc2dIntRes: ICurvesXInfo2d[];
                if (!arc2d1.isEqualAB() || !arc2d2.isEqualAB()) {
                    arc2dIntRes = this._ellipse2s(arc2d1, arc2d2, tol);
                } else {
                    arc2dIntRes = this._circle2dAndCircle2d(arc2d1, arc2d2, tol.lengthEps);
                }

                // 二维交点转到三维
                for (const it of arc2dIntRes) {
                    // const pt = arc1.getPtAt(it.param1);
                    result.push({
                        point: coord3d1.getWorldPtAt(it.point),
                        param1: it.param1,
                        param2: it.param2,
                        isOverlap: false,
                    });
                }
            } else {
                // 两个圆所在的平面平行，但不共面
                return [];
            }
        } else {
            // 两个圆所在的平面不平行，先求出两个圆所在平面的交线
            const intersectLines = SurfacesX.allIntersections(circlePlane1, circlePlane2);
            if (intersectLines.length < 1 || intersectLines[0].curve === undefined) {
                return [];
            }

            const arc2d = new Arc2(Coord2.XOY(), arc1.getA(), arc1.getB(), true, arc1.getRange().toArray());
            const intLine3d = intersectLines[0].curve as Ln3;
            const intLine2dPos = arc1.getCoord().getLocalPtAt(intLine3d.getOrigin());
            const intLine2dDir = arc1.getCoord().getLocalVectorAt(intLine3d.getDirection());
            const intLine2d = new Ln2(intLine2dPos, intLine2dDir, Interval.infinitArray());
            const intersectStatus = LineCircleX.line2dAndArc2d(intLine2d, arc2d, Tol.DEFAULT);
            const intPt3ds: { intersectPt: Vec3; param: number }[] = [];
            for (const it of intersectStatus) {
                const intPt = arc1.getCoord().getWorldPtAt(it.point);
                intPt3ds.push({ intersectPt: intPt, param: it.param2 });
            }

            for (const it of intPt3ds) {
                const t2 = arc2.getParamAt(it.intersectPt);
                const d = arc2.getPtAt(t2).distanceTo(it.intersectPt);
                if (d > tol.lengthEps) {
                    continue;
                }
                const paramTol = tol.lengthEps / (arc2.getA() + arc2.getB());
                if (arc2.getRange().containsPt(t2, paramTol)) {
                    result.push({
                        point: it.intersectPt,
                        param1: it.param,
                        param2: t2,
                        isOverlap: false,
                    });
                }
            }
        }
        return result;
    }

    /**
     * 求两椭圆弧的交点：两个圆中至少有一个是椭圆
     * @param ellipse1
     * @param ellipse2
     */
    private static _ellipse2s(
        ellipse1: Arc2,
        ellipse2: Arc2,
        tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        // 细分迭代求交
        return CurvesXUtil.curve2dCurve2d(ellipse1, ellipse2, tol);
    }

    /**
     * 求两圆弧的交点
     * @param arc1
     * @param arc2
     */
    private static _circle2dAndCircle2d(
        arc1: Arc2,
        arc2: Arc2,
        distanceTol: number = Tol.LENGTH,
    ): ICurvesXInfo2d[] {
        const c1 = arc1.getCenter();
        const c2 = arc2.getCenter();
        const r1 = (arc1.getA() + arc1.getB()) / 2;
        const r2 = (arc2.getA() + arc2.getB()) / 2;
        const centerDiff = c2.subtracted(c1);
        const centerDiffNormal = centerDiff.clone().normalize();
        const centerDiffLength = centerDiff.getLength();
        const radiusPlus = r1 + r2;
        const radiussubtracted = Math.abs(r1 - r2);

        if (centerDiff.isZero(distanceTol)) {
            // 圆心重合且半径不等的情况
            if (!Util.isNearlyEqual(r1, r2, distanceTol)) {
                return []; // 没有交点.
            }

            // 圆心重合且半径相等的情况
            if (Util.isNearlyEqual(r1, r2, distanceTol)) {
                const t11 = arc1.getParamAt(arc2.getStartPt());
                if (arc1.getRange().containsPt(t11, distanceTol)) {
                    return [
                        {
                            point: arc2.getStartPt(),
                            param1: t11,
                            param2: arc2.getRange().min,
                            isOverlap: false,
                        },
                    ];
                }

                const t12 = arc1.getParamAt(arc2.getEndPt());
                if (arc1.getRange().containsPt(t12, distanceTol)) {
                    return [
                        {
                            point: arc2.getEndPt(),
                            param1: t12,
                            param2: arc2.getRange().max,
                            isOverlap: false,
                        },
                    ];
                }

                const t21 = arc2.getParamAt(arc1.getStartPt());
                if (arc2.getRange().containsPt(t21, distanceTol)) {
                    return [
                        {
                            point: arc1.getStartPt(),
                            param1: arc1.getRange().min,
                            param2: t21,
                            isOverlap: false,
                        },
                    ];
                }

                const t22 = arc2.getParamAt(arc1.getEndPt());
                if (arc2.getRange().containsPt(t22, distanceTol)) {
                    return [
                        {
                            point: arc1.getEndPt(),
                            param1: arc1.getRange().max,
                            param2: t22,
                            isOverlap: false,
                        },
                    ];
                }

                return []; // 没有交点.
            }
        }

        if (centerDiffLength > radiusPlus + distanceTol || centerDiffLength < radiussubtracted - distanceTol) {
            return []; // 相离，没有交点
        }

        // 判断外切时，使用一个小的容差
        const result: ICurvesXInfo2d[] = [];
        const eps = Math.min(Tol.LENGTH, distanceTol);
        if (
            Util.isNearlyBiggerOrEqual(centerDiffLength, radiusPlus, eps) &&
            Util.isNearlyEqual(centerDiffLength, radiusPlus, distanceTol)
        ) {
            // 外切，得到一个交点
            const intersectPoint = c1.clone().add(centerDiffNormal.multiply(r1));
            const t1 = arc1.getParamAt(intersectPoint);
            const t2 = arc2.getParamAt(intersectPoint);
            result.push({
                point: intersectPoint,
                param1: t1,
                param2: t2,
                isOverlap: false,
            });
        } else if (
            Util.isNearlySmallerOrEqual(centerDiffLength, radiussubtracted, eps) &&
            Util.isNearlyEqual(centerDiffLength, radiussubtracted, distanceTol)
        ) {
            // 内切，得到一个交点
            let intersectPoint: Vec2;
            if (r2 >= r1) {
                intersectPoint = c1.add(centerDiffNormal.multiply(-r1));
            } else {
                intersectPoint = c2.add(centerDiffNormal.multiply(r2));
            }

            const t1 = arc1.getParamAt(intersectPoint);
            const t2 = arc2.getParamAt(intersectPoint);
            result.push({
                point: intersectPoint,
                param1: t1,
                param2: t2,
                isOverlap: false,
            });
        } else {
            // 一般情况，两个交点
            const perpenVec = new Vec2(-centerDiffNormal.y, centerDiffNormal.x);
            const q = centerDiffLength * centerDiffLength + r1 * r1 - r2 * r2;
            const dx = (0.5 * q) / centerDiffLength;
            const dy = (0.5 * Math.sqrt(4 * centerDiffLength * centerDiffLength * r1 * r1 - q * q)) / centerDiffLength;

            const intersectPoint1 = c1.clone().add(centerDiffNormal.multiplied(dx)).add(perpenVec.multiplied(dy));
            const intersectPoint2 = c1.clone().add(centerDiffNormal.multiplied(dx)).add(perpenVec.multiplied(-dy));

            // 判断两个交点是否在容差范围内，若是则合并成一个
            if (intersectPoint1.equals(intersectPoint2, distanceTol)) {
                const intersectPoint = intersectPoint1.interpolate(intersectPoint2, 0.5);
                result.push({
                    point: intersectPoint,
                    param1: arc1.getParamAt(intersectPoint),
                    param2: arc2.getParamAt(intersectPoint),
                    isOverlap: false,
                });
            } else {
                let t1 = arc1.getParamAt(intersectPoint1);
                let t2 = arc2.getParamAt(intersectPoint1);
                result.push({
                    point: intersectPoint1,
                    param1: t1,
                    param2: t2,
                    isOverlap: false,
                });

                t1 = arc1.getParamAt(intersectPoint2);
                t2 = arc2.getParamAt(intersectPoint2);
                result.push({
                    point: intersectPoint2,
                    param1: t1,
                    param2: t2,
                    isOverlap: false,
                });
            }
        }

        // 筛选：判断交点是否在两个圆弧参数域内
        const paramTol1 = distanceTol / arc1.getA();
        const paramTol2 = distanceTol / arc2.getA();
        return result.filter(
            res =>
                arc1.getRange().containsPt(res.param1, paramTol1) &&
                arc2.getRange().containsPt(res.param2, paramTol2),
        );
    }
}

export { CircularsX };

