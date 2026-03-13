import { Tol } from '../../base/tol';
import { Curve3 } from '../../geometry/curve3d';
import { ICurvesXInfo, ICurvesXInfo2d, ICurvesXInfo3d } from './x_info';
import { Curve2 } from '../../geometry/curve2';
import {
    Curve2dSegment,
    Curve2dSegmentPair,
    Curve3dSegment,
    Curve3dSegmentPair,
    CurveSegment,
    CurveSegmentPair,
} from '../calculate_util/geometry_subdevide_infos';
import { Vec3 } from '../../base/vec3';
import { CONST } from '../../type_define/const';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { OffsetCurve2 } from '../../geometry/offset_curve2';
import { curvesIteration } from '../calculate_util/iterative_method';
import { Curve } from '../../geometry/curve';
import { Vec } from '../../base/vec';
import { Box2 } from '../../base/box2';
import { Box3 } from '../../base/box3';
import { Vec2 } from '../../base/vec2';
import { Ln2 } from '../../geometry/ln2';
import { D } from '../calc_d';
import { PeriodInterval } from '../../base/period_inverval';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';



export class CurvesXUtil {
    public static curve2dCurve2d(
        curve2d1: Curve2,
        curve2d2: Curve2,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d[] {
        if (!curve2d1 || !curve2d2) {
            return [];
        }

        const box1 = curve2d1.getBBox();
        const box2 = curve2d2.getBBox();
        if (!box1.intersectsBox(box2, tol.lengthEps)) {
            return [];
        }

        const segmt1: Curve2dSegment = new Curve2dSegment(curve2d1);
        segmt1.range = curve2d1.getRange();
        segmt1.depth = 0;
        const segmt2: Curve2dSegment = new Curve2dSegment(curve2d2);
        segmt2.range = curve2d2.getRange();
        segmt2.depth = 0;

        const curve2dSegments1: Curve2dSegment[] = [];
        const curve2dSegments2: Curve2dSegment[] = [];
        curve2dSegments1.push(segmt1);
        curve2dSegments2.push(segmt2);

        // 初始化曲线对儿
        const curveSegmentPairs: Curve2dSegmentPair[] = [];
        const segPair: Curve2dSegmentPair = new Curve2dSegmentPair(segmt1, segmt2);
        curveSegmentPairs.push(segPair);

        const intRes = this.getEndPtIntersect<Vec2>(curve2d1, curve2d2, tol);
        this._dealSingularityIntersect<Vec2>(curve2d1, curve2d2, intRes, tol);
        this._calCurve2dSegmentsIntersect(curve2dSegments1, curve2dSegments2, curveSegmentPairs, intRes, tol);
        return intRes;
    }

    public static curve3dCurve3d(
        origCurve3d1: Curve3,
        origCurve3d2: Curve3,
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d[] {
        if (!origCurve3d1 || !origCurve3d2) {
            return [];
        }

        const box1 = origCurve3d1.getBBox();
        const box2 = origCurve3d2.getBBox();
        if (!box1.intersectsBox(box2, tol.lengthEps)) {
            return [];
        }

        // 现对nurbs曲线进行节点细化，这样计算包围盒更准确一点
        let curve3d1: Curve3;
        if (origCurve3d1.isNurbsCurve3d() && origCurve3d1.getControlPoints().length < 10) {
            curve3d1 = origCurve3d1.clone() as NurbsCurve3;
            (curve3d1 as NurbsCurve3).knotRefinement();
        } else {
            curve3d1 = origCurve3d1;
        }
        let curve3d2: Curve3;
        if (origCurve3d2.isNurbsCurve3d() && origCurve3d2.getControlPoints().length < 10) {
            curve3d2 = origCurve3d2.clone();
            (curve3d2 as NurbsCurve3).knotRefinement();
        } else {
            curve3d2 = origCurve3d2;
        }

        const segmt1: Curve3dSegment = new Curve3dSegment(curve3d1);
        segmt1.range = curve3d1.getRange();
        segmt1.depth = 0;
        const segmt2: Curve3dSegment = new Curve3dSegment(curve3d2);
        segmt2.range = curve3d2.getRange();
        segmt2.depth = 0;

        const curve3dSegments1: Curve3dSegment[] = [];
        const curve3dSegments2: Curve3dSegment[] = [];
        curve3dSegments1.push(segmt1);
        curve3dSegments2.push(segmt2);

        // 初始化曲线对儿
        const curveSegmentPairs: Curve3dSegmentPair[] = [];
        const segPair: Curve3dSegmentPair = new Curve3dSegmentPair(segmt1, segmt2);
        curveSegmentPairs.push(segPair);

        const intRes = this.getEndPtIntersect<Vec3>(curve3d1, curve3d2, tol);
        this._dealSingularityIntersect<Vec3>(curve3d1, curve3d2, intRes, tol);
        this._calCurve3dSegmentsIntersect(curve3dSegments1, curve3dSegments2, curveSegmentPairs, intRes, tol);
        return intRes;
    }

    /**
     * 只计算一个交点（或者没有交点）就返回
     * @param curve2d1 曲线1
     * @param curve2d2 曲线2
     * @param ref 参考点或在两曲线上的参数
     */
    public static curve2dsSingleX(
        curve2d1: Curve2,
        curve2d2: Curve2,
        ref: Vec2 | number[],
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo2d | undefined {
        const seg1: Curve2dSegment = new Curve2dSegment(curve2d1);
        const seg2: Curve2dSegment = new Curve2dSegment(curve2d2);
        seg1.range = curve2d1.getRange();
        seg2.range = curve2d2.getRange();
        const segPair: Curve2dSegmentPair = new Curve2dSegmentPair(seg1, seg2);

        const intRes = this._calCurveSegmentPairIntersect<Vec2>(segPair, tol, ref);
        if (intRes) {
            return intRes;
        }

        return this._getNearestSingularityIntersect<Vec2>(curve2d1, curve2d2, ref);
    }

    /**
     * 只计算一个交点（或者没有交点）就返回
     * @param curve3d1 曲线1
     * @param curve3d2 曲线2
     * @param ref 参考点或在两曲线上的参数
     */
    public static curve3dsSingleX(
        curve3d1: Curve3,
        curve3d2: Curve3,
        ref: Vec3 | number[],
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo3d | undefined {
        const seg1: Curve3dSegment = new Curve3dSegment(curve3d1);
        const seg2: Curve3dSegment = new Curve3dSegment(curve3d2);
        seg1.range = curve3d1.getRange();
        seg2.range = curve3d2.getRange();
        const segPair: Curve3dSegmentPair = new Curve3dSegmentPair(seg1, seg2);

        const intRes = this._calCurveSegmentPairIntersect<Vec3>(segPair, tol, ref);
        if (intRes) {
            return intRes;
        }

        return this._getNearestSingularityIntersect<Vec3>(curve3d1, curve3d2, ref);
    }

    // 判断起点终点是否是交点
    public static getEndPtIntersect<VectorType extends Vec>(
        curve1: Curve<VectorType>,
        curve2: Curve<VectorType>,
        tol: Tol,
    ): ICurvesXInfo<VectorType>[] {
        const endPtInts: ICurvesXInfo<VectorType>[] = [];

        const curv1EndPts = [curve1.getStartPt(), curve1.getEndPt()];
        for (let i = 0; i < curv1EndPts.length; i++) {
            if (this._isRedundantPt(curv1EndPts[i], endPtInts, tol)) {
                continue;
            }

            const curve2Para = curve2.getParamAt(curv1EndPts[i]);
            const d = curve2.getPtAt(curve2Para).sqDistanceTo(curv1EndPts[i]);
            if (d < tol.lengthEps2 && curve2.getRange().containsPt(curve2Para, tol.lengthEps)) {
                const xPtInfo: ICurvesXInfo<VectorType> = {
                    point: curv1EndPts[i],
                    param1: i === 0 ? curve1.getStartParam() : curve1.getEndParam(),
                    param2: curve2Para,
                    isOverlap: false,
                };
                endPtInts.push(xPtInfo);
            }
        }

        const curv2EndPts = [curve2.getStartPt(), curve2.getEndPt()];
        for (let i = 0; i < curv2EndPts.length; i++) {
            if (this._isRedundantPt(curv2EndPts[i], endPtInts, tol)) {
                continue;
            }

            const curve1Para = curve1.getParamAt(curv2EndPts[i]);
            const d = curve1.getPtAt(curve1Para).sqDistanceTo(curv2EndPts[i]);
            if (d < tol.lengthEps2 && curve1.getRange().containsPt(curve1Para, tol.lengthEps)) {
                const xPtInfo: ICurvesXInfo<VectorType> = {
                    point: curv2EndPts[i],
                    param1: curve1Para,
                    param2: i === 0 ? curve2.getStartParam() : curve2.getEndParam(),
                    isOverlap: false,
                };
                endPtInts.push(xPtInfo);
            }
        }

        return endPtInts;
    }

    private static _getNearestSingularityIntersect<VectorType extends Vec>(
        curve1: Curve<VectorType>,
        curve2: Curve<VectorType>,
        ref: Vec | number[],
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo<VectorType> | undefined {
        const allSingularInts = this._dealSingularityIntersect(curve1, curve2, [], tol);
        if (allSingularInts.length === 0) {
            return undefined;
        }

        let nearInt = allSingularInts[0];
        if (ref instanceof Vec3) {
            let min = nearInt.point.sqDistanceTo(ref);
            for (let i = 1; i < allSingularInts.length; i++) {
                const d = allSingularInts[i].point.sqDistanceTo(ref);
                if (d < min) {
                    min = d;
                    nearInt = allSingularInts[i];
                }
            }
        } else if (Array.isArray(ref)) {
            const pt0 = curve1.getPtAt(ref[0]);
            const pt1 = curve2.getPtAt(ref[1]);
            let min = pt0.sqDistanceTo(nearInt.point) + pt1.sqDistanceTo(nearInt.point);
            for (let i = 1; i < allSingularInts.length; i++) {
                const pt = allSingularInts[i].point;
                const d = pt.sqDistanceTo(pt0) + pt.sqDistanceTo(pt1);
                if (d < min) {
                    min = d;
                    nearInt = allSingularInts[i];
                }
            }
        } else {
            throw new Error('unexcepted case');
        }

        return nearInt;
    }

    private static _calCurve2dSegmentsIntersect(
        curve2dSegments1: Curve2dSegment[],
        curve2dSegments2: Curve2dSegment[],
        curve2dSegPairs: Curve2dSegmentPair[],
        curIntstRes: ICurvesXInfo2d[],
        tol: Tol = Tol.DEFAULT,
    ) {
        let newCurve2dSegmentPairs: Curve2dSegmentPair[] = [];

        let depth: number = 0;
        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            // 细分生成子曲线段儿
            for (const iCurvSeg1 of curve2dSegments1) {
                const curveSegs: Curve2dSegment[] = [];
                const curSeg1: Curve2dSegment = new Curve2dSegment(iCurvSeg1.curve);
                const curSeg2: Curve2dSegment = new Curve2dSegment(iCurvSeg1.curve);
                curveSegs.push(curSeg1);
                curveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg1, curveSegs);
            }
            for (const iCurvSeg2 of curve2dSegments2) {
                const curveSegs: Curve2dSegment[] = [];
                const curSeg1: Curve2dSegment = new Curve2dSegment(iCurvSeg2.curve);
                const curSeg2: Curve2dSegment = new Curve2dSegment(iCurvSeg2.curve);
                curveSegs.push(curSeg1);
                curveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg2, curveSegs);
            }

            // 细分线段组合成曲线对儿
            const hasNewPair = CurveSegmentPair.combineCurveSegmentPairs<Vec2>(
                curve2dSegPairs,
                newCurve2dSegmentPairs,
            );
            if (!hasNewPair) {
                break; // 曲线不能在细分了,不再计算
            }

            // 筛选更新老的
            this._FilterCurvSegmentPairs<Vec2>(newCurve2dSegmentPairs, tol.lengthEps);
            if (newCurve2dSegmentPairs.length === 0) {
                curve2dSegPairs.splice(0);
                break;
            }

            Curve3dSegmentPair.refreshCurveSegments<Vec2>(
                newCurve2dSegmentPairs,
                curve2dSegments1,
                curve2dSegments2,
            );

            curve2dSegPairs.splice(0);
            curve2dSegPairs.push(...newCurve2dSegmentPairs);
            newCurve2dSegmentPairs = [];

            depth++;
        }

        for (const iPair of curve2dSegPairs) {
            const intInfo = this._calCurveSegmentPairIntersect<Vec2>(iPair, tol); // 计算用过程容差，使结果更精确
            if (intInfo && !this._dealRedundantIntersect<Vec2>(iPair, intInfo, curIntstRes, tol)) {
                curIntstRes.push(intInfo);
            }
        }
    }

    private static _calCurve3dSegmentsIntersect(
        curve3dSegments1: Curve3dSegment[],
        curve3dSegments2: Curve3dSegment[],
        curve3dSegPairs: Curve3dSegmentPair[],
        curIntstRes: ICurvesXInfo3d[],
        tol: Tol = Tol.DEFAULT,
    ) {
        let newCurve3dSegmentPairs: Curve3dSegmentPair[] = [];

        let depth: number = 0;
        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            // 细分生成子曲线段儿
            for (const iCurvSeg1 of curve3dSegments1) {
                const curveSegs: Curve3dSegment[] = [];
                const curSeg1: Curve3dSegment = new Curve3dSegment(iCurvSeg1.curve);
                const curSeg2: Curve3dSegment = new Curve3dSegment(iCurvSeg1.curve);
                curveSegs.push(curSeg1);
                curveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg1, curveSegs);
            }
            for (const iCurvSeg2 of curve3dSegments2) {
                const curveSegs: Curve3dSegment[] = [];
                const curSeg1: Curve3dSegment = new Curve3dSegment(iCurvSeg2.curve);
                const curSeg2: Curve3dSegment = new Curve3dSegment(iCurvSeg2.curve);
                curveSegs.push(curSeg1);
                curveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg2, curveSegs);
            }

            // 细分线段组合成曲线对儿
            const hasNewPair = CurveSegmentPair.combineCurveSegmentPairs<Vec3>(
                curve3dSegPairs,
                newCurve3dSegmentPairs,
            );
            if (!hasNewPair) {
                break; // 曲线不能在细分了,不再计算
            }

            // 筛选更新老的
            this._FilterCurvSegmentPairs<Vec3>(newCurve3dSegmentPairs, tol.lengthEps);
            if (newCurve3dSegmentPairs.length === 0) {
                curve3dSegPairs.splice(0);
                break;
            }

            Curve3dSegmentPair.refreshCurveSegments<Vec3>(
                newCurve3dSegmentPairs,
                curve3dSegments1,
                curve3dSegments2,
            );

            curve3dSegPairs.splice(0);
            curve3dSegPairs.push(...newCurve3dSegmentPairs);
            newCurve3dSegmentPairs = [];

            depth++;
        }

        for (const iPair of curve3dSegPairs) {
            const intInfo = this._calCurveSegmentPairIntersect<Vec3>(iPair, tol); // 计算用过程容差，使结果更精确
            if (intInfo && !this._dealRedundantIntersect<Vec3>(iPair, intInfo, curIntstRes, tol)) {
                curIntstRes.push(intInfo);
            }
        }
    }

    // 对于奇异点，直接判断是否是交点
    private static _dealSingularityIntersect<VectorType extends Vec>(
        curve1: Curve<VectorType>,
        curve2: Curve<VectorType>,
        intRes: ICurvesXInfo<VectorType>[],
        tol: Tol = Tol.DEFAULT,
    ): ICurvesXInfo<VectorType>[] {
        const sqrTol = tol.lengthEps * tol.lengthEps * 1e-2;
        const allSingularInts: ICurvesXInfo<VectorType>[] = [];

        const isSingularityIntersct = (
            offCurv: Curve<VectorType>,
            isCurve1OffsetType: boolean,
            curv: Curve<VectorType>,
        ) => {
            let singulParas: number[] = [];
            if (offCurv instanceof OffsetCurve3 || offCurv instanceof OffsetCurve2) {
                singulParas = offCurv.getSingularities();
            }
            // 对于extendCurve3d是否也需要处理？？暂未处理

            for (const ipara of singulParas) {
                const singularPt = offCurv.getPtAt(ipara);
                if (this._isRedundantPt(singularPt, intRes, tol)) {
                    continue;
                }

                const curvePara = curv.getParamAt(singularPt);
                const d = curv.getPtAt(curvePara).sqDistanceTo(singularPt);
                if (d < sqrTol && curv.getRange().containsPt(curvePara, tol.lengthEps)) {
                    if (isCurve1OffsetType) {
                        allSingularInts.push({
                            point: singularPt,
                            param1: ipara,
                            param2: curvePara,
                            isOverlap: false,
                        });
                    } else {
                        allSingularInts.push({
                            point: singularPt,
                            param1: curvePara,
                            param2: ipara,
                            isOverlap: false,
                        });
                    }
                }
            }
        };

        isSingularityIntersct(curve1, true, curve2);
        isSingularityIntersct(curve2, false, curve1);

        return allSingularInts;
    }

    private static _isRedundantPt<VectorType extends Vec>(
        pt: VectorType,
        intRes: ICurvesXInfo<VectorType>[],
        tol: Tol,
    ): boolean {
        for (const it of intRes) {
            if (pt.equals(it.point, tol.lengthEps)) {
                return true;
            }
        }
        return false;
    }

    // 返回是否是重复点：如果不是重复点，返回false；如果是重复点，在此函数内会处理掉重复点，返回true；
    private static _dealRedundantIntersect<VectorType extends Vec>(
        curvePairs: CurveSegmentPair<VectorType>,
        newInt: ICurvesXInfo<VectorType>,
        intRes: ICurvesXInfo<VectorType>[],
        tol: Tol = Tol.DEFAULT,
    ) {
        const angleEps = tol.angleEps * 100;
        for (let i = 0; i < intRes.length; i++) {
            // 判断是否是同一个点，去重
            const curve1 = curvePairs.segment1.curve;
            const curve2 = curvePairs.segment2.curve;
            const ptsSqrDist = newInt.point.sqDistanceTo(intRes[i].point);
            // 1.正常去重：标准容差内，取计算更精确的（距离更近的一对儿点）交点
            if (ptsSqrDist <= tol.lengthEps2) {
                const iSqrDist = curve1.getPtAt(intRes[i].param1).sqDistanceTo(curve2.getPtAt(intRes[i].param2));
                const tmpSqrDist = curve1.getPtAt(newInt.param1).sqDistanceTo(curve2.getPtAt(newInt.param2));
                if (tmpSqrDist < iSqrDist) {
                    intRes.splice(i, 1, newInt);
                }

                return true;
            }

            // 2.相切情况去重：宽松容差内
            if (ptsSqrDist <= tol.edgeLengthEps2) {
                const iSqrDist = curve1.getPtAt(intRes[i].param1).sqDistanceTo(curve2.getPtAt(intRes[i].param2));
                const tmpSqrDist = curve1.getPtAt(newInt.param1).sqDistanceTo(curve2.getPtAt(newInt.param2));
                const minDist = Math.sqrt(Math.min(iSqrDist, tmpSqrDist));

                if (minDist > Tol.PROCESS_LENGTH_EPS / 100) {
                    const eps = Math.min(minDist / 10, Tol.PROCESS_LENGTH_EPS);

                    const midPt = newInt.point.midTo(intRes[i].point) as VectorType;
                    const midParam1 = curve1.getFootByIterate(midPt, newInt.param1, eps);
                    const midParam2 = curve2.getFootByIterate(midPt, newInt.param2, eps);
                    const midSqrDist =
                        midParam1 !== undefined && midParam2 !== undefined
                            ? curve1.getPtAt(midParam1).sqDistanceTo(curve2.getPtAt(midParam2))
                            : CONST.MODEL_MAX_LENGTH;

                    // 2.1 宽松容差内，取中间参数点计算最近距离，判断距离是否小于两个已有交点对儿的距离，如果小于，则中点更精确
                    if (midSqrDist < iSqrDist && midSqrDist < tmpSqrDist) {
                        const midIntPtInfo = {
                            point: curve1.getPtAt(midParam1!),
                            param1: midParam1!,
                            param2: midParam2!,
                            isOverlap: false,
                        };
                        intRes.splice(i, 1, midIntPtInfo);
                        return true;
                    }
                }

                // 2.2 宽松容差内，如果有一个点计算很精确，取计算精确的点判断相切
                // 2.2 宽松容差内，取中间参数点计算最近距离，判断距离是否小于两个已有交点对儿的距离，如果大于，可能是有一个是很精确的点，判断是否相切
                const isIntersectParallel = (info: ICurvesXInfo<VectorType>) => {
                    const t1a = curve1.getTangentAt(info.param1, true);
                    const t1b = curve1.getTangentAt(info.param1, false);
                    const t2a = curve2.getTangentAt(info.param2, true);
                    const t2b = curve2.getTangentAt(info.param2, false);
                    //
                    return (
                        t1a.isParallel(t2a, angleEps) ||
                        t1a.isParallel(t2b, angleEps) ||
                        t1b.isParallel(t2a, angleEps) ||
                        t1b.isParallel(t2b, angleEps)
                    );
                };

                // 如果距离小于1e-24，已经差不多达到计算精度的极限，再比较大小已经意义不大。所以如果小于1e-24，就用之前的点，不更新
                if (iSqrDist > Tol.CALCULATE_EPS2 && tmpSqrDist < iSqrDist) {
                    if (isIntersectParallel(newInt)) {
                        intRes.splice(i, 1, newInt);
                        return true;
                    }
                } else {

                    if (isIntersectParallel(intRes[i])) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private static _FilterCurvSegmentPairs<VectorType extends Vec>(
        curveSegPairs: CurveSegmentPair<VectorType>[],
        lengthEps: number = Tol.LENGTH,
    ) {
        for (let i = 0; i < curveSegPairs.length; i++) {
            const curSegPair = curveSegPairs[i];
            const curSeg1 = curSegPair.segment1;
            const curSeg2 = curSegPair.segment2;

            const box1 = curSeg1.getSegBox();
            const box2 = curSeg2.getSegBox();

            if (box1 instanceof Box2 && box2 instanceof Box2) {
                if (!box1.intersectsBox(box2, lengthEps)) {
                    curveSegPairs.splice(i, 1);
                    i--;
                }
            } else if (box1 instanceof Box3 && box2 instanceof Box3) {
                if (!box1.intersectsBox(box2, lengthEps)) {
                    curveSegPairs.splice(i, 1);
                    i--;
                }
            } else {
                throw new Error('curve求交：curve3d和curve2d混合搭配!');
            }
        }
    }

    // 采用迭代求交点，一次只能计算一个交点（或者没有交点）
    private static _calCurveSegmentPairIntersect<VectorType extends Vec>(
        curveSegPair: CurveSegmentPair<VectorType>,
        tol: Tol = Tol.DEFAULT,
        ref?: Vec | number[],
    ): ICurvesXInfo<VectorType> | undefined {
        const seg1 = curveSegPair.segment1;
        const seg2 = curveSegPair.segment2;
        const curv1 = seg1.curve;
        const curv2 = seg2.curve;

        // 利用改进的牛顿迭代法求交点
        let params: number[];
        if (!ref) {
            if (curv1 instanceof Curve2 && curv2 instanceof Curve2) {
                const seg1StartPt = curv1.getPtAt(seg1.range.min);
                const seg1EndPt = curv1.getPtAt(seg1.range.max);
                const seg2StartPt = curv2.getPtAt(seg2.range.min);
                const seg2EndPt = curv2.getPtAt(seg2.range.max);
                const line1 = new Ln2(seg1StartPt, seg1EndPt);
                const line2 = new Ln2(seg2StartPt, seg2EndPt);
                const point1: Vec2 = new Vec2();
                const point2: Vec2 = new Vec2();
                const lineDis = D.curve2s(line1, line2, point1, point2);
                if (lineDis < tol.lengthEps * 100) {
                    const intT1 = curv1.getParamAt(point1);
                    const intT2 = curv2.getParamAt(point2);
                    params = [intT1, intT2];
                    params[0] = curv1.getDomain().clamp(params[0]);
                    params[1] = curv2.getDomain().clamp(params[1]);
                } else {
                    params = [seg1.range.getMid(), seg2.range.getMid()];
                    if (curv1.isLine2d()) {
                        params[0] = curv1.getParamAt(seg2.getSegBox().getCenter());
                    }
                    if (curv2.isLine2d()) {
                        params[1] = curv2.getParamAt(seg1.getSegBox().getCenter());
                    }
                }
            } else {
                params = [seg1.range.getMid(), seg2.range.getMid()];
                if (curv1.isLine3d()) {
                    params[0] = curv1.getParamAt(seg2.getSegBox().getCenter());
                }
                if (curv2.isLine3d()) {
                    params[1] = curv2.getParamAt(seg1.getSegBox().getCenter());
                }
            }
        } else if (ref instanceof Vec) {
            params = [curv1.getParamAt(ref), curv2.getParamAt(ref)];
            params[0] = curv1.getDomain().clamp(params[0]);
            params[1] = curv2.getDomain().clamp(params[1]);
        } else {
            // if (ref instanceof Array)
            params = ref;
        }

        const iterationValidity = curvesIteration(seg1.curve, seg2.curve, params, tol);
        if (!iterationValidity) return undefined;

        // 用原curve的参数域，不能用seg的参数域：遇到offset2d中的一个case，当前参数域总会迭代到相邻参数域的位置交点，而判断不在当前segment参数域内
        // if (seg1.range.containsPt(params[0]) && seg2.range.containsPt(params[1])) {
        if (
            seg1.curve.getRange().containsPt(params[0], tol.lengthEps) &&
            seg2.curve.getRange().containsPt(params[1], tol.lengthEps)
        ) {
            const iterResPt1 = seg1.curve.getPtAt(params[0]);
            const range1 = seg1.curve.getRange();
            if (range1 instanceof PeriodInterval) {
                params[0] = range1.getRegularParam(params[0], tol.lengthEps);
            }
            const range2 = seg2.curve.getRange();
            if (range2 instanceof PeriodInterval) {
                params[1] = range2.getRegularParam(params[1], tol.lengthEps);
            }
            const curCurIntInfo = {
                point: iterResPt1,
                param1: params[0],
                param2: params[1],
                isOverlap: false,
            };

            return curCurIntInfo;
        }

        // 若平行，尝试端点吸附
        const dir1 = seg1.curve.getDerivatives(params[0], 1)[1];
        const dir2 = seg2.curve.getDerivatives(params[1], 1)[1];

        if (!dir1.isParallel(dir2, tol.angleEps * 100)) return undefined;

        const dirLen1 = dir1.getLength();
        const dirLen2 = dir2.getLength();
        const sameDirSign = Math.sign(dir1.dot(dir2));

        function tryMoveParams(param1Target: number, swap: boolean): ICurvesXInfo<VectorType> | undefined {
            let _seg1: CurveSegment<VectorType>;
            let _seg2: CurveSegment<VectorType>;
            let _param1: number;
            let _param2: number;
            let _ratio21: number;

            if (swap) {
                _seg1 = seg2;
                _seg2 = seg1;
                _param1 = params[1];
                _param2 = params[0];
                _ratio21 = (dirLen2 / dirLen1) * sameDirSign;
            } else {
                _seg1 = seg1;
                _seg2 = seg2;
                _param1 = params[0];
                _param2 = params[1];
                _ratio21 = (dirLen1 / dirLen2) * sameDirSign;
            }

            const dt1 = param1Target - _param1;
            const _newParam2 = _param2 + dt1 * _ratio21;

            if (!_seg2.range.containsPt(_newParam2)) return undefined;

            const pt1 = _seg1.curve.getPtAt(param1Target);
            const pt2 = _seg2.curve.getPtAt(_newParam2);

            if (pt1.sqDistanceTo(pt2) < tol.lengthEps * tol.lengthEps) {
                return {
                    point: pt1.add(pt2).multiply(0.5),
                    param1: swap ? _newParam2 : param1Target,
                    param2: swap ? param1Target : _newParam2,
                    isOverlap: false,
                };
            }

            return undefined;
        }

        if (params[0] < seg1.range.min) {
            return tryMoveParams(seg1.range.min, false);
        }
        if (params[0] > seg1.range.max) {
            return tryMoveParams(seg1.range.max, false);
        }

        if (params[1] < seg2.range.min) {
            return tryMoveParams(seg2.range.min, true);
        }
        if (params[1] > seg1.range.max) {
            return tryMoveParams(seg2.range.max, true);
        }
        return undefined; // never reach here
    }
}