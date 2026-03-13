import { Vec3 } from '../../../base/vec3';
import { CONST } from '../../../type_define/const';
import { Tol } from '../../../base/tol';
import { Curve3 } from '../../../geometry/curve3d';
import { Ln3 } from '../../../geometry/ln3';
import { Curve3sDistance } from '../curve3s_distance';
import { IPoint3dPair } from './define_of_calculate_distance';
import { Curve3dSegment, Curve3dSegmentPair, CurveSegment } from '../../calculate_util/geometry_subdevide_infos';
import { calcNextCurvesIteration } from '../../calculate_util/iterative_method';
import { D } from '../../calc_d';
import { Curve2 } from '../../../geometry/curve2';
import { Vec2 } from '../../../base/vec2';
import { Util } from '../../../util/util';



/**
 * 曲线集到曲线集的最近距离
 */
export class CurvedDistanceUtil {
    public static minAtEnds2d(curve1: Curve2, curve2: Curve2, point1?: Vec2, point2?: Vec2): number {
        const tmpPt1: Vec2[] = [curve1.getStartPt(), curve1.getEndPt(), new Vec2(), new Vec2()];
        const tmpPt2: Vec2[] = [new Vec2(), new Vec2(), curve2.getStartPt(), curve2.getEndPt()];

        const dists: number[] = new Array<number>(4);
        dists[0] = D.ptToCurve2d(tmpPt1[0], curve2, tmpPt2[0]);
        dists[1] = D.ptToCurve2d(tmpPt1[1], curve2, tmpPt2[1]);
        dists[2] = D.ptToCurve2d(tmpPt2[2], curve1, tmpPt1[2]);
        dists[3] = D.ptToCurve2d(tmpPt2[3], curve1, tmpPt1[3]);

        let minDist: number = dists[0];
        let minI = 0;

        for (let i = 1; i < 4; i++) {
            if (dists[i] < minDist - Tol.PROCESS_LENGTH_EPS) {
                minDist = dists[i];
                minI = i;
            }
        }

        if (point1) {
            point1.copy(tmpPt1[minI]);
        }
        if (point2) {
            point2.copy(tmpPt2[minI]);
        }
        return minDist;
    }

    public static minAtEnds3d(curve1: Curve3, curve2: Curve3, point1?: Vec3, point2?: Vec3): number {
        const tmpPt1: Vec3[] = [curve1.getStartPt(), curve1.getEndPt(), new Vec3(), new Vec3()];
        const tmpPt2: Vec3[] = [new Vec3(), new Vec3(), curve2.getStartPt(), curve2.getEndPt()];

        const dists: number[] = new Array<number>(4);
        dists[0] = D.ptToCurve3d(tmpPt1[0], curve2, tmpPt2[0]);
        dists[1] = D.ptToCurve3d(tmpPt1[1], curve2, tmpPt2[1]);
        dists[2] = D.ptToCurve3d(tmpPt2[2], curve1, tmpPt1[2]);
        dists[3] = D.ptToCurve3d(tmpPt2[3], curve1, tmpPt1[3]);

        let minDist: number = dists[0];
        let minI = 0;

        for (let i = 1; i < 4; i++) {
            if (dists[i] < minDist - Tol.PROCESS_LENGTH_EPS) {
                minDist = dists[i];
                minI = i;
            }
        }

        if (point1) {
            point1.copy(tmpPt1[minI]);
        }
        if (point2) {
            point2.copy(tmpPt2[minI]);
        }

        return minDist;
    }

    // public curvePair: [Curve3, Curve3];
    /**
     * 曲线集到曲线集的最近距离
     * oldMinDis 用于包围盒加速计算，传入一个已知的距离，如果没有已知距离，就不用传入该参数，用默认值就行。譬如说，前面
     *           已经计算了曲线顶点之间的最近距离为2.015，就可以跳过很多包围盒最小距离都大于此距离的曲线，提高效率。
     */
    public static execute(
        curve3dSegments1: Curve3dSegment[],
        curve3dSegments2: Curve3dSegment[],
        curve3dSegPairs: Curve3dSegmentPair[],
        minDisPt1: Vec3,
        minDisPt2: Vec3,
        oldMinDis: number = CONST.MAX_INTEGER,
    ): number {
        // let newCurveSegments1: Curve3dSegment[] = [];
        // let newCurveSegments2: Curve3dSegment[] = [];
        let newCurvSegmPairs: Curve3dSegmentPair[] = [];

        let minDist = oldMinDis + 1.0;
        const ptPairs: IPoint3dPair[] = [];
        let depth: number = 0;
        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            if (minDist < Tol.LENGTH) {
                return minDist;
            }

            // 细分线段, true表示计算子线段的切向锥
            // newCurveSegments1 = Curve3dSegment.subdivideCurveSegments(curve3dSegments1);
            // newCurveSegments2 = Curve3dSegment.subdivideCurveSegments(curve3dSegments2);
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
            const hasNewPair = Curve3dSegmentPair.combineCurveSegmentPairs(curve3dSegPairs, newCurvSegmPairs);
            if (depth > 0 && !hasNewPair) {
                break; // 曲线不能在细分了,不再计算.(如果是第一次就不再细分了，也要计算一次)
            }

            const newMinDist = this._calCurvSegmentPairsDist(newCurvSegmPairs, ptPairs, minDisPt1, minDisPt2, minDist);
            newCurvSegmPairs = newCurvSegmPairs.filter(pair => pair.getTwoBoxsMinDistance() <= newMinDist);
            if (newCurvSegmPairs.length === 0 || (depth > 3 && ptPairs.length === 0)) {
                break;
            }

            // 后续加入计算法向锥判断是否细分
            // const bigAngle = this._IsBigAngle(newCurveSegments1) || this._IsBigAngle(newCurveSegments2);
            // if (bigAngle) {
            if (Math.abs(newMinDist - minDist) < Tol.LENGTH * 100 && ptPairs.length !== 0) {
                break; // pointPairs.length !== 0，防止没有计算到极小值点两次之后也会返回
            }
            // }

            // 筛选线段对儿
            Curve3dSegmentPair.refreshCurveSegments(newCurvSegmPairs, curve3dSegments1, curve3dSegments2);

            curve3dSegPairs.splice(0);
            curve3dSegPairs.push(...newCurvSegmPairs);
            minDist = newMinDist;

            newCurvSegmPairs = [];

            depth++;
        }

        return minDist;
    }

    // 采用细分+牛顿迭代，计算曲线对儿的最近距离
    private static _calCurvSegmentPairsDist(
        curve3dSegPairs: Curve3dSegmentPair[],
        extremeDisPointPairs: IPoint3dPair[],
        minDisPt1: Vec3,
        minDisPt2: Vec3,
        oldMinDis: number = CONST.MAX_INTEGER,
    ): number {
        let minDist: number = oldMinDis;
        const newCurveSegPairs: Curve3dSegmentPair[] = [];

        for (const curveSegPair of curve3dSegPairs) {
            if (curveSegPair.getTwoBoxsMinDistance() > minDist) {
                continue;
            }

            const curve3dSeg1 = curveSegPair.segment1;
            const curve3dSeg2 = curveSegPair.segment2;
            const curv1 = curve3dSeg1.curve;
            const curv2 = curve3dSeg2.curve;

            // 如果有直线段对儿，挑出来直接结算最近距离
            if (curv1.isLine3d() && curv2.isLine3d()) {
                const tmpDisPt1 = new Vec3();
                const tmpDisPt2 = new Vec3();
                const lineDist: number = Curve3sDistance.execute(
                    curv1 as Ln3,
                    curv2 as Ln3,
                    tmpDisPt1,
                    tmpDisPt2,
                );
                if (lineDist < minDist) {
                    minDist = lineDist;
                    minDisPt1.copy(tmpDisPt1);
                    minDisPt2.copy(tmpDisPt2);
                }

                continue;
            }

            // 利用牛顿迭代法求距离极值点
            const initial: number[] = [curve3dSeg1.range.getMid(), curve3dSeg2.range.getMid()]; // 迭代初始值
            const iterativeValidity = this._calcCurvCurvIteration(curv1, curv2, initial, minDist);
            if (iterativeValidity) {
                if (curve3dSeg1.range.containsPt(initial[0]) && curve3dSeg2.range.containsPt(initial[1])) {
                    const initPt1 = curv1.getPtAt(initial[0]);
                    const initPt2 = curv2.getPtAt(initial[1]);
                    const tmpSqrDist: number = initPt1.sqDistanceTo(initPt2);
                    if (tmpSqrDist < minDist * minDist - Tol.LENGTH_2) {
                        const pt3dPair: IPoint3dPair = {
                            point1: initPt1,
                            point2: initPt2,
                            sqrDistance: tmpSqrDist,
                        };
                        extremeDisPointPairs.push(pt3dPair);

                        minDist = Math.sqrt(tmpSqrDist);
                        minDisPt1.copy(pt3dPair.point1);
                        minDisPt2.copy(pt3dPair.point2);
                    }
                }
            }

            newCurveSegPairs.push(curveSegPair);
        }

        curve3dSegPairs.splice(0);
        curve3dSegPairs.push(...newCurveSegPairs);
        return minDist;
    }

    // 计算线线迭代点
    private static _calcCurvCurvIteration(
        curve1: Curve3,
        curve2: Curve3,
        iteration: number[],
        minDist: number,
    ): boolean {
        const sqrEps = Tol.LENGTH_2;
        const sSqrEps = sqrEps * 1e-4;

        let point1 = curve1.getPtAt(iteration[0]);
        let point2 = curve2.getPtAt(iteration[1]);
        let sqrDist = CONST.MAX_INTEGER;
        let newSqDist = point2.sqDistanceTo(point2);
        if (sqrDist < sSqrEps) {
            return true;
        }

        let iterNewton = 0;
        let bIsDecrease: boolean = true;
        for (; iterNewton < CONST.NORMAL_ITER_NUM || bIsDecrease; iterNewton++) {
            if (iterNewton > CONST.MAX_ITER_NUM) {
                break;
            }

            sqrDist = newSqDist;

            const deltaParams: number[] = calcNextCurvesIteration(curve1, curve2, iteration);
            if (deltaParams.length === 0) {
                return true; // 雅各比矩阵为0时，是局部极小值
            }
            const newIteration = [iteration[0] - deltaParams[0], iteration[1] - deltaParams[1]];

            iteration[0] = curve1.getRange().clamp(newIteration[0]);
            iteration[1] = curve2.getRange().clamp(newIteration[1]);

            const newPoint1 = curve1.getPtAt(iteration[0]);
            const newPoint2 = curve2.getPtAt(iteration[1]);
            newSqDist = newPoint1.sqDistanceTo(newPoint2);

            if (point1.sqDistanceTo(newPoint1) < sqrEps && point2.sqDistanceTo(newPoint2) < sqrEps) {
                if (
                    Util.isNearlyEqual(newIteration[0], curve1.getStartParam()) ||
                    Util.isNearlyEqual(newIteration[0], curve1.getEndParam()) ||
                    Util.isNearlyEqual(newIteration[1], curve2.getStartParam()) ||
                    Util.isNearlyEqual(newIteration[1], curve1.getEndParam())
                ) {
                    return false; // 检验极值点是否在原curve端点处
                }

                return true;
            }

            if (iterNewton >= CONST.NORMAL_ITER_NUM) {
                bIsDecrease = newSqDist < sqrDist; // 如果迭代趋势收敛，继续迭代
            }

            point1 = newPoint1;
            point2 = newPoint2;
        }

        return Math.abs(newSqDist - sqrDist) < sqrEps && Math.sqrt(newSqDist) < minDist; // 有两个圆切向相同但不共面相切的情况，距离很几乎不再变化，但是两个点还没达到收敛
    }

    // private static _IsBigAngle(newCurveSegments: Curve3dSegment[]): boolean
    // {
    //     for (const segment of newCurveSegments) {
    //         const bigAngle = segment.cone.Angle > M_PI_12 || segment.range.getLength() > 1e4;
    //         return bigAngle;
    //     }
    //     return false;
    // };
}