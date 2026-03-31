import * as numeric from 'numeric';
import { Interval } from '../../base/interval';
import { Tol } from '../../base/tol';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { CircularSurface } from '../../geometry/circular_surface';
import { Curve3 } from '../../geometry/curve3d';
import { Ln3 } from '../../geometry/ln3';
import { Plane } from '../../geometry/plane';
import { Surface } from '../../geometry/surface';
import { CONST } from '../../type_define/const';
import {
    Curve3dSegment,
    CurveSegment,
    ICurveSurfacePair,
    SurfacePatch,
} from '../calculate_util/geometry_subdevide_infos';
import { ICvSurfXInfo, ICurveSurfXPointInfo } from './x_info';
import { types } from '../../type_define/i_types';
import { PeriodInterval } from '../../base/period_inverval';
import { LinearSystem } from '../../solve_equations/linear_system';
import { estimateRootMultiplicity } from '../calculate_util/iterative_method';
import { boxCutLine } from './box_cut_line';
import { Box3 } from '../../base/box3';

export class CurveSurfaceXUtil {
    // 返回是否是重复点：如果不是重复点，返回false；如果是重复点，在此函数内会处理掉重复点，返回true；
    public static dealRedundantIntersect(
        curv: Curve3,
        surf: Surface,
        newInt: ICvSurfXInfo,
        intRes: ICvSurfXInfo[],
        tol = Tol.DEFAULT,
    ) {
        const relaxLengthEps2 = tol.lengthEps2 * 1000000;
        for (let i = 0; i < intRes.length; i++) {
            // 判断是否是同一个点，去重
            const ptsSqrDist = newInt.point.sqDistanceTo(intRes[i].point);
            // 1.正常去重：标准容差内，取计算更精确的（距离更近的一对儿点）交点
            if (ptsSqrDist <= tol.lengthEps2) {
                const iSqrDist = curv.getPtAt(intRes[i].curveT).sqDistanceTo(surf.getPtAt(intRes[i].surfaceUV));
                const tmpSqrDist = curv.getPtAt(newInt.curveT).sqDistanceTo(surf.getPtAt(newInt.surfaceUV));
                if (tmpSqrDist < iSqrDist) {
                    intRes.splice(i, 1, newInt);
                }

                return true;
            }

            // 2.相切情况去重：宽松容差内
            if (ptsSqrDist <= relaxLengthEps2) {
                const iSqrDist = curv.getPtAt(intRes[i].curveT).sqDistanceTo(surf.getPtAt(intRes[i].surfaceUV));
                const tmpSqrDist = curv.getPtAt(newInt.curveT).sqDistanceTo(surf.getPtAt(newInt.surfaceUV));

                // {
                //     const minDist = Math.sqrt(Math.min(iSqrDist, tmpSqrDist));
                //     const eps = Math.min(minDist / 10, Tol.PROCESS_LENGTH_EPS);
                //     const midPt = newInt.point.midTo(intRes[i].point);
                //     const midParam1 = curv.getFootByIterate(midPt, eps);
                //     const midParam2 = surf.getUVAt(midPt); // surface反求参数精度达不到要求，没用
                //     const midSqrDist =
                //         midParam1 !== undefined && midParam2 !== undefined
                //             ? curv.getPtAt(midParam1).sqDistanceTo(surf.getPtAt(midParam2))
                //             : CONST.MODEL_MAX_LENGTH;

                //     // 2.1 宽松容差内，取中间参数点计算最近距离，判断距离是否小于两个已有交点对儿的距离，如果小于，则中点更精确
                //     if (midSqrDist < iSqrDist && midSqrDist < tmpSqrDist) {
                //         const midIntPtInfo = {
                //             point: curv.getPtAt(midParam1!),
                //             curveT: midParam1!,
                //             surfaceUV: midParam2,
                //         };
                //         intRes.splice(i, 1, midIntPtInfo);
                //         return true;
                //     }
                // }
                const midParam1 = (intRes[i].curveT + newInt.curveT) / 2;
                const midParam2 = new Vec2(
                    (intRes[i].surfaceUV.x + newInt.surfaceUV.x) / 2,
                    (intRes[i].surfaceUV.y + newInt.surfaceUV.y) / 2,
                );
                const midSqrDist = curv.getPtAt(midParam1).sqDistanceTo(surf.getPtAt(midParam2));

                // 2.1 宽松容差内，取中间参数点计算最近距离，判断距离是否小于两个已有交点对儿的距离，如果小于，则中点更精确
                if (midSqrDist < iSqrDist && midSqrDist < tmpSqrDist) {
                    const midIntPtInfo = {
                        point: curv.getPtAt(midParam1),
                        curveT: midParam1,
                        surfaceUV: midParam2,
                    };
                    intRes.splice(i, 1, midIntPtInfo);
                    return true;
                }

                if (iSqrDist > Tol.CALCULATE_EPS && tmpSqrDist < iSqrDist) {
                    intRes.splice(i, 1, newInt);
                }
                return true;
            }
        }

        intRes.push(newInt);
        return false;
    }

    private _curve: Curve3;

    private _surface: Surface;

    private _surfaceRangeUV: Interval[]; // 由于surface自带没有range，所以当传入range的时候，需要记录下来

    private _tol: Tol;

    constructor(curve: Curve3, surface: Surface, tol: Tol = new Tol()) {
        this._curve = curve;
        this._surface = surface;
        this._tol = tol;
    }

    public calAllIntersects(surfRanges?: Interval[]): ICvSurfXInfo[] {
        const curveSeg: Curve3dSegment = new Curve3dSegment(this._curve);
        curveSeg.range = this._curve.getRange();
        curveSeg.depth = 0;

        const surfPatch: SurfacePatch = new SurfacePatch(this._surface);
        this._surfaceRangeUV = surfRanges || [this._surface.getDomainU(), this._surface.getDomainV()];
        surfPatch.depth = 0;

        // 除去了解析法求交的（直线和各种曲面），ExtendCurve分解为简单曲线，
        // 剩下的曲线种类（圆弧、offset曲线、nurbs曲线）都是有限长度的，可用包围盒缩小曲面参数域范围
        const hasIntersect = this._shrinkCurveRange(curveSeg, surfPatch);
        if (!hasIntersect) {
            return [];
        }
        this._shrinkSurfacePatchRanges(surfPatch, curveSeg);

        // 与给定的参数域求交集
        if (surfRanges) {
            if (!surfRanges[0].containsInterval(Interval.infinit())) {
                const intersctRangeU = surfPatch.rangeU.intersected(surfRanges[0]);
                if (intersctRangeU.length === 0) {
                    return []; // 参数域没有交集，说明无交
                }
                surfPatch.rangeU = intersctRangeU[0];
            }

            if (!surfRanges[1].containsInterval(Interval.infinit())) {
                const intersctRangeV = surfPatch.rangeV.intersected(surfRanges[1]);
                if (intersctRangeV.length === 0) {
                    return []; // 参数域没有交集，说明无交（譬如sweep分解后，某一段域曲线无交，参数域缩减后求交就会为空）
                }
                surfPatch.rangeV = intersctRangeV[0];
            }
        }

        const curveSegs: Curve3dSegment[] = [curveSeg];
        const surfPatchs: SurfacePatch[] = [surfPatch];

        // 初始化曲线对儿
        const curveSurfPairs: ICurveSurfacePair[] = [];
        const segPair: ICurveSurfacePair = { segment: curveSeg, patch: surfPatch };
        curveSurfPairs.push(segPair);

        const intRes = this._calCurveSurfacePairsIntersect(curveSegs, surfPatchs, curveSurfPairs);
        return intRes;
    }

    public calSingleIntersect(
        referPoint: Vec3 | ICurveSurfXPointInfo,
        surfRanges?: Interval[],
    ): ICvSurfXInfo | undefined {
        const curveSeg: Curve3dSegment = new Curve3dSegment(this._curve);
        curveSeg.range = this._curve.getRange();

        this._surfaceRangeUV = surfRanges || [this._surface.getDomainU(), this._surface.getDomainV()];
        const rangeUV = this._surfaceRangeUV;
        const surfPatch: SurfacePatch = new SurfacePatch(this._surface, rangeUV);
        const curveSurfPair: ICurveSurfacePair = { segment: curveSeg, patch: surfPatch };

        const intersectPt = this._curveSurfacePairIntersect(curveSurfPair, referPoint);
        return intersectPt;
    }

    public hasIntersect(surfRanges?: Interval[], tol = Tol.DEFAULT): boolean {
        const curveSeg: Curve3dSegment = new Curve3dSegment(this._curve);
        curveSeg.range = this._curve.getRange();
        curveSeg.depth = 0;

        const surfPatch: SurfacePatch = new SurfacePatch(this._surface);
        this._surfaceRangeUV = surfRanges || [this._surface.getDomainU(), this._surface.getDomainV()];
        surfPatch.depth = 0;

        // 除去了解析法求交的（直线和各种曲面），ExtendCurve分解为简单曲线，
        // 剩下的曲线种类（圆弧、offset曲线、nurbs曲线）都是有限长度的，可用包围盒缩小曲面参数域范围
        const hasIntersect = this._shrinkCurveRange(curveSeg, surfPatch);
        if (!hasIntersect) {
            return false;
        }
        this._shrinkSurfacePatchRanges(surfPatch, curveSeg);

        // 与给定的参数域求交集
        if (surfRanges) {
            if (!surfRanges[0].containsInterval(Interval.infinit())) {
                const intersctRangeU = surfPatch.rangeU.intersected(surfRanges[0]);
                if (intersctRangeU.length === 0) {
                    return false; // 参数域没有交集，说明无交
                }
                surfPatch.rangeU = intersctRangeU[0];
            }

            if (!surfRanges[1].containsInterval(Interval.infinit())) {
                const intersctRangeV = surfPatch.rangeV.intersected(surfRanges[1]);
                if (intersctRangeV.length === 0) {
                    return false; // 参数域没有交集，说明无交（譬如sweep分解后，某一段域曲线无交，参数域缩减后求交就会为空）
                }
                surfPatch.rangeV = intersctRangeV[0];
            }
        }

        const curveSegs: Curve3dSegment[] = [curveSeg];
        const surfPatchs: SurfacePatch[] = [surfPatch];

        // 初始化曲线对儿
        const curveSurfPairs: ICurveSurfacePair[] = [];
        const segPair: ICurveSurfacePair = { segment: curveSeg, patch: surfPatch };
        curveSurfPairs.push(segPair);

        return this._findCurveSurfacePairsIntersect(curveSegs, surfPatchs, curveSurfPairs);
    }

    /**
     * 返回false表示无交
     * @param curveSeg
     * @param surfPatch
     */
    private _shrinkCurveRange(curveSeg: Curve3dSegment, surfPatch: SurfacePatch): boolean {
        if (!curveSeg.curve.isLine3d()) {
            return true;
        }

        const surf = surfPatch.surface;
        const tiltBox: Box3 | undefined = surf.getBox();

        if (!tiltBox) {
            return true;
        }

        const xRange = boxCutLine(curveSeg.curve, tiltBox);
        if (!xRange) {
            return false;
        }

        curveSeg.range = xRange;
        return true;
    }

    private _shrinkSurfacePatchRanges(surfPatch: SurfacePatch, curveSeg: Curve3dSegment) {
        const curveBox = curveSeg.getSegBox();

        if (surfPatch.surface.isPlane()) {
            const plane = surfPatch.surface;
            const rangeU = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            const rangeV = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            for (const pt of curveBox.getCornerPts()) {
                const para = plane.getUVAt(pt);
                if (para.x > rangeU[1]) {
                    rangeU[1] = para.x;
                }
                if (para.x < rangeU[0]) {
                    rangeU[0] = para.x;
                }

                if (para.y > rangeV[1]) {
                    rangeV[1] = para.y;
                }
                if (para.y < rangeV[0]) {
                    rangeV[0] = para.y;
                }
            }
            surfPatch.rangeU = new Interval(rangeU[0], rangeU[1]);
            surfPatch.rangeV = new Interval(rangeV[0], rangeV[1]);
        } else if (surfPatch.surface.isCylinder()) {
            const cSurf = surfPatch.surface as CircularSurface;
            const coord = cSurf.getCoord();
            const axisLine = new Ln3(coord.getOrigin(), coord.getDz(), Interval.infinitArray());

            const rangeV = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            for (const pt of curveBox.getCornerPts()) {
                const rangePara1 = axisLine.getParamAt(pt);
                if (rangePara1 > rangeV[1]) {
                    rangeV[1] = rangePara1;
                }
                if (rangePara1 < rangeV[0]) {
                    rangeV[0] = rangePara1;
                }
            }
            surfPatch.rangeV = new Interval(rangeV[0], rangeV[1]);
            surfPatch.rangeU = new PeriodInterval(0, CONST.PI2);
        } else {
            throw new Error('暂未支持的曲面类型！');
        }
    }

    private _calCurveSurfacePairsIntersect(
        curveSegs: Curve3dSegment[],
        surfPatchs: SurfacePatch[],
        curveSurfPairs: ICurveSurfacePair[],
    ): ICvSurfXInfo[] {
        let newCurveSurfPairs: ICurveSurfacePair[] = [];

        let depth: number = 0;
        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            // 细分生成子曲线段儿曲面片
            for (const iCurvSeg of curveSegs) {
                const newCurveSegs: Curve3dSegment[] = [];
                const curSeg1: Curve3dSegment = new Curve3dSegment(iCurvSeg.curve);
                const curSeg2: Curve3dSegment = new Curve3dSegment(iCurvSeg.curve);
                newCurveSegs.push(curSeg1);
                newCurveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg, newCurveSegs);
            }
            surfPatchs.map(sp => SurfacePatch.subdivideSurfacePatch(sp, 8));

            // 细分线段组合成曲线对儿
            const hasNewPair = this._combineCurveSurfacePairs(curveSurfPairs, newCurveSurfPairs);
            if (!hasNewPair) {
                break; // 曲线不能在细分了,不再计算
            }

            // 筛选更新老的
            const filterCurveSurfPairs = this._FilterCurveSurfacePairs(newCurveSurfPairs);
            if (filterCurveSurfPairs.length === 0) {
                curveSurfPairs.splice(0);
                break;
            }

            this._refreshSegmentPatchs(filterCurveSurfPairs, curveSegs, surfPatchs);

            curveSurfPairs.splice(0);
            curveSurfPairs.push(...filterCurveSurfPairs);
            newCurveSurfPairs = [];

            depth++;
        }

        const curSurfIntersctRets: ICvSurfXInfo[] = [];
        for (const iPair of curveSurfPairs) {
            const intInfo = this._curveSurfacePairIntersect(iPair); // 计算用过程容差，使结果更精确
            if (intInfo) {
                CurveSurfaceXUtil.dealRedundantIntersect(
                    iPair.segment.curve,
                    iPair.patch.surface,
                    intInfo,
                    curSurfIntersctRets,
                );
            }
        }

        return curSurfIntersctRets;
    }

    private _findCurveSurfacePairsIntersect(
        curveSegs: Curve3dSegment[],
        surfPatchs: SurfacePatch[],
        curveSurfPairs: ICurveSurfacePair[],
    ): boolean {
        let newCurveSurfPairs: ICurveSurfacePair[] = [];

        let depth: number = 0;
        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            // 细分生成子曲线段儿曲面片
            for (const iCurvSeg of curveSegs) {
                const newCurveSegs: Curve3dSegment[] = [];
                const curSeg1: Curve3dSegment = new Curve3dSegment(iCurvSeg.curve);
                const curSeg2: Curve3dSegment = new Curve3dSegment(iCurvSeg.curve);
                newCurveSegs.push(curSeg1);
                newCurveSegs.push(curSeg2);
                CurveSegment.subdivideCurveSegment(iCurvSeg, newCurveSegs);
            }
            surfPatchs.map(sp => SurfacePatch.subdivideSurfacePatch(sp, 8));

            // 细分线段组合成曲线对儿
            const hasNewPair = this._combineCurveSurfacePairs(curveSurfPairs, newCurveSurfPairs);
            if (!hasNewPair) {
                break; // 曲线不能在细分了,不再计算
            }

            // 筛选更新老的
            const filterCurveSurfPairs = this._FilterCurveSurfacePairs(newCurveSurfPairs);
            if (filterCurveSurfPairs.length === 0) {
                curveSurfPairs.splice(0);
                break;
            }

            this._refreshSegmentPatchs(filterCurveSurfPairs, curveSegs, surfPatchs);

            curveSurfPairs.splice(0);
            curveSurfPairs.push(...filterCurveSurfPairs);
            newCurveSurfPairs = [];

            depth++;
        }

        for (const iPair of curveSurfPairs) {
            const intInfo = this._curveSurfacePairIntersect(iPair); // 计算用过程容差，使结果更精确
            if (intInfo) {
                return true;
            }
        }

        return false;
    }

    private _curveSurfacePairIntersect(
        curveSurfPair: ICurveSurfacePair,
        referPoint?: Vec3 | ICurveSurfXPointInfo,
    ): ICvSurfXInfo | undefined {
        const curveSeg = curveSurfPair.segment;
        const surfPatch = curveSurfPair.patch;

        let params: number[] = [];
        if (referPoint) {
            let refT: number;
            let refUV: types.IXY;
            if (referPoint instanceof Vec3) {
                refT = this._curve.getParamAt(referPoint);
                refUV = this._surface.getUVAt(referPoint);
            } else {
                refT = referPoint.curveT;
                refUV = referPoint.uvPara;
            }
            refT = curveSeg.curve.getRange().clamp(refT);
            surfPatch.surface.clampInDomain(refUV);
            params.push(refT, refUV.x, refUV.y);
        } else {
            params = [curveSeg.range.getMid(), surfPatch.rangeU.getMid(), surfPatch.rangeV.getMid()];
            if (curveSeg.curve.isLine3d()) {
                params[0] = curveSeg.curve.getParamAt(surfPatch.getPatchBox3d().getCenter());
            }
        }

        const adjustInRange = (range: Interval, param: number) => {
            if (range instanceof PeriodInterval) {
                const newParam = PeriodInterval.RegularizeParam(param, range.period); // 在0 ~ period之间
                if (newParam < range.min - this._tol.numberEps) {
                    return newParam + range.period;
                }
                if (newParam > range.max + this._tol.numberEps) {
                    return newParam + range.period;
                }
                return newParam;
            }
            return param;
        };

        const iter = this._curveSurfaceIteration(curveSeg.curve, surfPatch.surface, params, this._tol.lengthEps);
        if (iter) {
            if (
                curveSeg.curve.getRange().containsPt(params[0]) &&
                this._surfaceRangeUV[0].containsPt(params[1]) &&
                this._surfaceRangeUV[1].containsPt(params[2])
            ) {
                const iterResPt = curveSeg.curve.getPtAt(params[0]);

                params[0] = adjustInRange(curveSeg.curve.getRange(), params[0]);
                params[1] = adjustInRange(this._surfaceRangeUV[0], params[1]);
                params[2] = adjustInRange(this._surfaceRangeUV[1], params[2]);
                return { point: iterResPt, curveT: params[0], surfaceUV: { x: params[1], y: params[2] } };
            }
        }

        return undefined;
    }

    // multiplicity表示根的重数，例如相交是一重根，相切是二重根
    private _calcCurveSurfaceDeltaParams(
        curve: Curve3,
        surf: Surface,
        params: number[],
        rootMultiplicity: number,
    ): number[] {
        const pts1: Vec3[] = curve.getDerivatives(params[0], 1);
        const pts2: Vec3[] = surf.getDerivatives(new Vec2(params[1], params[2]), 1);

        const fx: types.numberArr3 = [pts1[0].x - pts2[0].x, pts1[0].y - pts2[0].y, pts1[0].z - pts2[0].z];

        const df1: types.numberArr3 = [pts1[1].x, -pts2[1].x, -pts2[2].x];
        const df2: types.numberArr3 = [pts1[1].y, -pts2[1].y, -pts2[2].y];
        const df3: types.numberArr3 = [pts1[1].z, -pts2[1].z, -pts2[2].z];

        // case1. 满秩矩阵解方程
        const det = numeric.det([df1, df2, df3]);
        if (Math.abs(det) > Tol.CALCULATE_EPS) {
            const deltaParams = LinearSystem.execute([df1, df2, df3], fx);
            if (deltaParams === undefined) {
                return [];
            }

            deltaParams[0] *= rootMultiplicity;
            deltaParams[1] *= rootMultiplicity;
            deltaParams[2] *= rootMultiplicity;
            return deltaParams;
        }

        // 如果Math.abs(det) === 0，但是fx的都不为0，方程无解.// 迭代到锥顶位置出现了此情况
        if (
            Math.abs(fx[0]) > Tol.CALCULATE_EPS &&
            Math.abs(fx[1]) > Tol.CALCULATE_EPS &&
            Math.abs(fx[2]) > Tol.CALCULATE_EPS
        ) {
            return [];
        }

        // 也有可能出现不满秩的情况，譬如说curve和surfacez轴分量都为0，则第三项参数都为0
        // case2. 不满秩矩阵解方程：特殊处理方法，待改进。为了避免用svd解方程组
        const jacobA = [df1, df2, df3];
        const b = [...fx];
        for (let i = 0; i < jacobA.length; i++) {
            if (Math.abs(jacobA[i][0]) + Math.abs(jacobA[i][1]) + Math.abs(jacobA[i][2]) < Tol.CALCULATE_EPS) {
                jacobA.splice(i, 1);
                b.splice(i, 1);
                i--;
            }
        }

        if (jacobA.length === 2) {
            // 如果有两个方程为0，即xyz中有两个分量为0，可能吗？不可能。一个分量z为0是因为z轴垂直曲面，两个分量为0，除非曲面退化成直线？
            let minColIndex = 0; // 找到范数最小的列
            let maxColSum = Math.abs(jacobA[0][0]) + Math.abs(jacobA[1][0]);
            for (let j = 1; j < jacobA[0].length; j++) {
                const colSum = Math.abs(jacobA[0][j]) + Math.abs(jacobA[1][j]);
                if (colSum > maxColSum) {
                    maxColSum = colSum;
                    minColIndex = j;
                }
            }

            for (const arr of jacobA) {
                arr.splice(minColIndex, 1);
            }

            const deltaParams = LinearSystem.execute(jacobA, b);
            if (deltaParams === undefined) {
                return [];
            }

            deltaParams.splice(minColIndex, 0, 0);
            deltaParams[0] *= rootMultiplicity;
            deltaParams[1] *= rootMultiplicity;
            deltaParams[2] *= rootMultiplicity;
            return deltaParams;
        }

        // case3. 不满秩矩阵svd解方程
        // 矩阵不满秩，有多解，用svd分解解方程的结果会最小化结果，导致参数变化值大小其实不对。因此，需要将一阶导弧长参数化，解出来的参数结果也是弧长参数化的结果
        if (
            pts1[1].getSqLength() < Tol.CALCULATE_EPS2 ||
            pts2[1].getSqLength() < Tol.CALCULATE_EPS2 ||
            pts2[2].getSqLength() < Tol.CALCULATE_EPS2
        ) {
            return [];
        }

        const d1Length = 1 / pts1[1].getLength();
        const du2Length = 1 / pts2[1].getLength();
        const dv2Length = 1 / pts2[2].getLength();
        pts1[1] = pts1[1].multiply(d1Length);
        pts2[1] = pts2[1].multiply(du2Length);
        pts2[2] = pts2[2].multiply(dv2Length);

        const df1s: types.numberArr3 = [pts1[1].x, -pts2[1].x, -pts2[2].x];
        const df2s: types.numberArr3 = [pts1[1].y, -pts2[1].y, -pts2[2].y];
        const df3s: types.numberArr3 = [pts1[1].z, -pts2[1].z, -pts2[2].z];
        const deltaParams = LinearSystem.execute([df1s, df2s, df3s], fx);
        if (deltaParams === undefined) {
            return [];
        }

        deltaParams[0] *= d1Length * rootMultiplicity;
        deltaParams[1] *= du2Length * rootMultiplicity;
        deltaParams[2] *= dv2Length * rootMultiplicity;

        return deltaParams;
    }

    private _curveSurfaceIteration(
        curve: Curve3,
        surf: Surface,
        params: number[],
        eps = Tol.LENGTH,
    ): boolean {
        const processEps2 = eps * eps * 1e-2;
        let point1 = curve.getPtAt(params[0]);
        let point2 = surf.getPtAt(new Vec2(params[1], params[2]));
        let sqrDist = point1.sqDistanceTo(point2);
        if (sqrDist < processEps2) {
            return true; // 有可能一开始的初始点选取就是相交点
        }

        let iter = 0;
        let rootMultiplicity = 1;
        const sqrDistProportions: number[] = [];
        let bIsDecrease: boolean = true;
        for (; iter < CONST.NORMAL_ITER_NUM || bIsDecrease; iter++) {
            rootMultiplicity = rootMultiplicity > 1 ? rootMultiplicity : estimateRootMultiplicity(sqrDistProportions);
            const deltaParams = this._calcCurveSurfaceDeltaParams(curve, surf, params, rootMultiplicity);
            if (deltaParams.length === 0) {
                return sqrDist < processEps2;
            }

            const newParams: number[] = [
                params[0] - deltaParams[0],
                params[1] - deltaParams[1],
                params[2] - deltaParams[2],
            ];
            newParams[0] = curve.getRange().clamp(newParams[0]);
            const surfUV = new Vec2(newParams[1], newParams[2]);
            surf.clampInDomain(surfUV);
            newParams[1] = surfUV.x;
            newParams[2] = surfUV.y;

            let newPoint1 = curve.getPtAt(newParams[0]);
            let newPoint2 = surf.getPtAt(surfUV);
            let newSqDist = newPoint1.sqDistanceTo(newPoint2);
            let sqrDistProportion = newSqDist / sqrDist;
            if (sqrDistProportion > 1 - 0.1) {
                // 回溯，缩减步长，重新计算
                newParams[0] = params[0] - 0.5 * deltaParams[0];
                newParams[1] = params[1] - 0.5 * deltaParams[1];
                newParams[2] = params[2] - 0.5 * deltaParams[2];

                newParams[0] = curve.getRange().clamp(newParams[0]);
                const surfUV2 = new Vec2(newParams[1], newParams[2]);
                surf.clampInDomain(surfUV2);
                newParams[1] = surfUV2.x;
                newParams[2] = surfUV2.y;

                newPoint1 = curve.getPtAt(newParams[0]);
                newPoint2 = surf.getPtAt(surfUV2);
                newSqDist = newPoint1.sqDistanceTo(newPoint2);
                sqrDistProportion = newSqDist / sqrDist;
            }

            if (sqrDistProportion > 1 && newSqDist < Tol.CALCULATE_EPS2) {
                return true; // 快到计算精度极限了，下一次计算不如上次，使用上次的结果
            }

            params[0] = newParams[0];
            params[1] = newParams[1];
            params[2] = newParams[2];
            if (newSqDist < Tol.ZERO_JUDGE_EPS2) {
                return true;
            }

            if (
                (point1.sqDistanceTo(newPoint1) < processEps2 && point2.sqDistanceTo(newPoint2) < processEps2) ||
                iter > CONST.MAX_ITER_NUM
            ) {
                return newSqDist < processEps2;
            }

            if (iter >= CONST.NORMAL_ITER_NUM) {
                bIsDecrease = newSqDist < sqrDist - Tol.CALCULATE_EPS2; // 如果迭代趋势收敛，继续迭代
            }

            point1 = newPoint1;
            point2 = newPoint2;
            sqrDist = newSqDist;

            sqrDistProportions.push(sqrDistProportion);
        }

        return sqrDist < eps;
    }

    private _combineCurveSurfacePairs(
        curveSurfPairs: ICurveSurfacePair[],
        newCurveSurfPairs: ICurveSurfacePair[],
    ): boolean {
        let hasNewSubPair = false;
        for (const iPair of curveSurfPairs) {
            if (iPair.segment.child.length === 0 && iPair.patch.child.length === 0) {
                newCurveSurfPairs.push(iPair); // 没有细分新的片段，老的作为叶子结点一样需要存起来
                continue;
            }

            const segs = iPair.segment.child.length > 1 ? iPair.segment.child : [iPair.segment];
            const patchs = iPair.patch.child.length > 1 ? iPair.patch.child : [iPair.patch];
            for (const iSeg of segs) {
                for (const iPatch of patchs) {
                    const newPatchPair: ICurveSurfacePair = { segment: iSeg, patch: iPatch };
                    newCurveSurfPairs.push(newPatchPair);
                }
            }

            hasNewSubPair = true;
        }

        return hasNewSubPair;
    }

    private _FilterCurveSurfacePairs(curveSurfPairs: ICurveSurfacePair[]): ICurveSurfacePair[] {
        const filterCurveSurfPairs: ICurveSurfacePair[] = [];
        for (const iPair of curveSurfPairs) {
            const curveSeg1 = iPair.segment;
            const surfPatch2 = iPair.patch;

            const box1 = curveSeg1.getSegBox();
            const box2 = surfPatch2.getPatchBox3d();
            if (box1.intersectsBox(box2)) {
                filterCurveSurfPairs.push(iPair);
            }
        }
        return filterCurveSurfPairs;
    }

    private _refreshSegmentPatchs(
        curveSurfPairs: ICurveSurfacePair[],
        curveSegs: Curve3dSegment[],
        surfPatchs: SurfacePatch[],
    ) {
        const newCurveSegs: Set<Curve3dSegment> = new Set();
        const newSurfPatchs: Set<SurfacePatch> = new Set();
        for (const iPair of curveSurfPairs) {
            newCurveSegs.add(iPair.segment);
            newSurfPatchs.add(iPair.patch);
        }

        curveSegs.splice(0);
        curveSegs.push(...newCurveSegs);
        surfPatchs.splice(0);
        surfPatchs.push(...newSurfPatchs);
    }
}
