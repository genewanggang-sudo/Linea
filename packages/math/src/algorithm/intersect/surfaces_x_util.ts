import { ISurfacesXInfo, ISurfaceSurfaceIntersectPointInfo } from './x_info';
import { Surface } from '../../geometry/surface';
import { CONST } from '../../type_define/const';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Interval } from '../../base/interval';
import { Tol } from '../../base/tol';
import { SurfacePatch, ISurfacePatchPair } from '../calculate_util/geometry_subdevide_infos';
import { Vec3 } from '../../base/vec3';
import { types } from '../../type_define/i_types';
import { IntersectCurve3 } from '../../geometry/intersect_curve3';
import { Plane } from '../../geometry/plane';
import { Cylinder } from '../../geometry/cylinder';
import { Ln3 } from '../../geometry/ln3';
import { D } from '../calc_d';
import { surfaceSurfaceIteration } from '../calculate_util/iterative_method';
import { CurveSurfaceX } from './curve_surface_x';
import { Util } from '../../util/util';
import { MathAssert } from '../../util/assert';
import { PeriodInterval } from '../../base/period_inverval';
import { Curve3 } from '../../geometry/curve3d';
import { MathError } from '../../util/math_error';
import { Box3 } from '../../base/box3';



enum ArriveBoundaryType {
    ON_AND_NEXT_OUTBOUNDARY = 0, // 在边界上且下一次迭代出边界
    NEXT_OUT_BOUNDARY = 1,
    NOT_OUT_BOUNDARY = -1, // 下一次迭代不会出边界（在边界上但下一次迭代不会出边界也为-1）
}

interface IArriveBoundStruct {
    arriveBoundary: boolean;
    newStepLength: number;
    isArriveVBound?: boolean;
    boundParam?: number;
}
export class SurfacesXUtil {
    private _surface: Surface[];

    private _surf1BoundaryUVs: { rangeU?: Interval; rangeV?: Interval };

    private _surf2BoundaryUVs: { rangeU?: Interval; rangeV?: Interval };

    private _useHighPrecision: boolean;

    private _tol: Tol;

    constructor(
        surf1: Surface,
        surf2: Surface,
        tol: Tol = new Tol(),
        surf1RangeUV?: Interval[],
        surf2RangeUV?: Interval[],
    ) {
        this._surface = [surf1, surf2];
        this._tol = tol;

        this._initBoudaryUVs(0, surf1RangeUV);
        this._initBoudaryUVs(1, surf2RangeUV);
    }

    /**
     * 标准的surface与surface通用求交的函数，会返回所有的交（交线、交点、重合面（未实现））
     * 数值方法（迭代法）计算得到交线，通用曲面求交
     * @returns 交线可能不止一条，故返回交线的数组
     */
    public calAllIntersects(
        rangeU1?: Interval,
        rangeV1?: Interval,
        rangeU2?: Interval,
        rangeV2?: Interval,
        useHighPrecision = false,
    ): ISurfacesXInfo[] {
        if (this._surface.length < 2) {
            return [];
        }

        const surfPatch1: SurfacePatch = new SurfacePatch(this._surface[0]);
        const surfPatch2: SurfacePatch = new SurfacePatch(this._surface[1]);
        this._initSurfacePatch(this._surface[0], surfPatch1);
        this._initSurfacePatch(this._surface[1], surfPatch2);
        if (!rangeU1 || !rangeV1 || !rangeU2 || !rangeV2) {
            this._shrinkSurfacePatchRanges(this._surface[0], this._surface[1], surfPatch1, surfPatch2);
        } else {
            surfPatch1.rangeU = rangeU1;
            surfPatch1.rangeV = rangeV1;
            surfPatch2.rangeU = rangeU2;
            surfPatch2.rangeV = rangeV2;
        }

        const box1 = surfPatch1.getPatchBox3d();
        const box2 = surfPatch2.getPatchBox3d();
        if (!box1.intersectsBox(box2)) {
            return [];
        }

        const surfacePatchs1: SurfacePatch[] = [];
        const surfacePatchs2: SurfacePatch[] = [];

        surfacePatchs1.push(surfPatch1);
        surfacePatchs2.push(surfPatch2);

        // 初始化曲面片对儿
        const surfPatchPairs: ISurfacePatchPair[] = [];
        const surfacePatchPair: ISurfacePatchPair = {
            patch1: surfPatch1,
            patch2: surfPatch2,
        };
        surfPatchPairs.push(surfacePatchPair);

        const surfInitIntPts = this._surfacePatchsIntersectPoints(surfacePatchs1, surfacePatchs2, surfPatchPairs);

        this._useHighPrecision = useHighPrecision;
        const surfInterstRes: ISurfacesXInfo[] = [];
        for (const intPt of surfInitIntPts) {
            // for (let i = 0; i < surfIntPts.length; i++) {
            //     const intPt = surfIntPts[i];
            const intResInfo = this._calTwoSurfaceSingleIntersect(intPt, surfInitIntPts);

            // for (let j = i + 1; j < surfIntPts.length; j++) {
            //     if (intResInfo.curve) {
            //         if (intResInfo.curve.containsPt(surfIntPts[j])) {
            //             surfIntPts.splice(j, 1);
            //         }
            //     }
            // }
            if (intResInfo) {
                surfInterstRes.push(intResInfo);
            }
        }

        return surfInterstRes;
    }

    // (给定一个推荐点，交点或者相交位置附近的点)，只计算一条交线就返回；如果无交或找不到交线返回undefined
    // 如果给定的点（referPoint）是两条交线的交点（或者说交线在referPoint位置出现了两个或以上的分支），需要给定一个分支方向
    public calSingleIntersect(
        referPoint: Vec3,
        referDir?: Vec3,
        useHighPrecision = false,
    ): ISurfacesXInfo | undefined {
        const intersectPtInfo = this.findSurfaceIntersectPoint(referPoint);
        if (!intersectPtInfo) {
            return undefined;
        }

        this._useHighPrecision = useHighPrecision;
        const intResult = this._calTwoSurfaceSingleIntersect(intersectPtInfo, [], referDir);
        return intResult;
    }

    public findSurfaceIntersectPoint(referPoint: Vec3): ISurfaceSurfaceIntersectPointInfo | undefined {
        const surfPatch1: SurfacePatch = new SurfacePatch(this._surface[0]);
        surfPatch1.rangeU = this._surf1BoundaryUVs.rangeU
            ? this._surf1BoundaryUVs.rangeU
            : this._surface[0].getDomainU();
        surfPatch1.rangeV = this._surf1BoundaryUVs.rangeV
            ? this._surf1BoundaryUVs.rangeV
            : this._surface[0].getDomainV();

        const surfPatch2: SurfacePatch = new SurfacePatch(this._surface[1]);
        surfPatch2.rangeU = this._surf2BoundaryUVs.rangeU
            ? this._surf2BoundaryUVs.rangeU
            : this._surface[1].getDomainU();
        surfPatch2.rangeV = this._surf2BoundaryUVs.rangeV
            ? this._surf2BoundaryUVs.rangeV
            : this._surface[1].getDomainV();

        const surfacePatchPair: ISurfacePatchPair = {
            patch1: surfPatch1,
            patch2: surfPatch2,
        };

        const refUV1 = this._surface[0].getUVAt(referPoint);
        const refUV2 = this._surface[1].getUVAt(referPoint);
        const refParams = { uvPara1: refUV1, uvPara2: refUV2 };
        let intersectPt = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams);
        if (intersectPt === undefined) {
            intersectPt = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams, false);
        }
        return intersectPt;
    }

    public calSingleSelfIntersect(
        refUV1: types.IXY,
        refUV2: types.IXY,
        referDir?: Vec3,
        useHighPrecision = false,
    ): ISurfacesXInfo | undefined {
        const surfPatch1: SurfacePatch = new SurfacePatch(this._surface[0]);
        surfPatch1.rangeU = this._surf1BoundaryUVs.rangeU
            ? this._surf1BoundaryUVs.rangeU
            : this._surface[0].getDomainU();
        surfPatch1.rangeV = this._surf1BoundaryUVs.rangeV
            ? this._surf1BoundaryUVs.rangeV
            : this._surface[0].getDomainV();

        const surfPatch2: SurfacePatch = new SurfacePatch(this._surface[1]);
        surfPatch2.rangeU = this._surf2BoundaryUVs.rangeU
            ? this._surf2BoundaryUVs.rangeU
            : this._surface[1].getDomainU();
        surfPatch2.rangeV = this._surf2BoundaryUVs.rangeV
            ? this._surf2BoundaryUVs.rangeV
            : this._surface[1].getDomainV();

        const surfacePatchPair: ISurfacePatchPair = {
            patch1: surfPatch1,
            patch2: surfPatch2,
        };

        const refParams = { uvPara1: refUV1, uvPara2: refUV2 };
        let firstXPtInfo = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams);
        if (firstXPtInfo === undefined) {
            firstXPtInfo = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams, false);
        }
        if (!firstXPtInfo) {
            return undefined;
        }

        this._useHighPrecision = useHighPrecision;
        const intResult = this._calTwoSurfaceSingleIntersect(firstXPtInfo, [], referDir);
        return intResult;
    }

    private _initBoudaryUVs(surfIndex: number, rangeUV?: Interval[]) {
        const surface = this._surface[surfIndex];

        const isPeriodFullRange = (range: Interval) => {
            if (range instanceof PeriodInterval && Util.isNearlyEqual(range.getLength(), range.period)) {
                return true;
            }
            return false;
        };

        // 曲面分为封闭的和不封闭的，封闭的(周期的)不需要记录参数域，能走一圈；非周期的需要记录参数域边界，因为求交可能到达边界
        let boudnU: Interval | undefined;
        let boundV: Interval | undefined;
        if (surface instanceof Plane) {
            boudnU = surface.getDomainU();
            boundV = surface.getDomainV();
        }

        // 再与给定的参数域求交集: 有domain的，与range求交集；没有domain的，判断是否是无穷参数域，如果是无穷，不算作边界，不加入boundaryUV
        const getIntersectRange = (domain?: Interval, range?: Interval) => {
            if (domain === undefined && range === undefined) {
                return undefined;
            }

            if (domain !== undefined && range !== undefined) {
                const res = domain.intersected(range);
                if (res.length === 0) {
                    MathAssert.warn(false, 'Interval intersected result is empty');
                    return undefined;
                }
                return res[0];
            }

            const ret = domain || range;
            return ret;
        };

        if (rangeUV && rangeUV.length > 1) {
            if (!isPeriodFullRange(rangeUV[0])) {
                boudnU = getIntersectRange(boudnU, rangeUV[0]);
            }
            if (!isPeriodFullRange(rangeUV[1])) {
                boundV = getIntersectRange(boundV, rangeUV[1]);
            }
        }

        if (surfIndex === 0) {
            this._surf1BoundaryUVs = { rangeU: boudnU, rangeV: boundV };
        } else if (surfIndex === 1) {
            this._surf2BoundaryUVs = { rangeU: boudnU, rangeV: boundV };
        }
    }

    private _initSurfacePatch(surface: Surface, surfPatch: SurfacePatch) {
        surfPatch.depth = 0;
    }

    private _shrinkSurfacePatchRangesByAnotherSurfaceBox(surf1Box: Box3, surf2Patch: SurfacePatch) {
        // 根据nurbs的包围盒调整其他无穷参数域曲面的参数域
        const surface2 = surf2Patch.surface;
        if (surface2.getType() === EN_GEO_TYPE.PLANE) {
            const plane = surface2 as Plane;
            const rangeU = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            const rangeV = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            for (const pt of surf1Box.getCornerPts()) {
                const rangePara1 = plane.getUVAt(pt);
                if (rangePara1.x > rangeU[1]) {
                    rangeU[1] = rangePara1.x;
                }
                if (rangePara1.x < rangeU[0]) {
                    rangeU[0] = rangePara1.x;
                }

                if (rangePara1.y > rangeV[1]) {
                    rangeV[1] = rangePara1.y;
                }
                if (rangePara1.y < rangeV[0]) {
                    rangeV[0] = rangePara1.y;
                }
            }
            surf2Patch.rangeU = new Interval(rangeU[0], rangeU[1]);
            surf2Patch.rangeV = new Interval(rangeV[0], rangeV[1]);
        } else {
            surf2Patch.rangeU = new Interval(0, CONST.PI2);
            let axisLine: Ln3;
            if (surface2.getType() === EN_GEO_TYPE.CYLINDER) {
                const cyl2 = surface2 as Cylinder;
                const axis2 = cyl2.getCoord().getDz();
                axisLine = new Ln3(cyl2.getCoord().getOrigin(), axis2, Interval.infinitArray());
            }

            const rangeV = [CONST.MODEL_MAX_LENGTH, -CONST.MODEL_MAX_LENGTH];
            for (const pt of surf1Box.getCornerPts()) {
                const rangePara1 = axisLine!.getParamAt(pt);
                if (rangePara1 > rangeV[1]) {
                    rangeV[1] = rangePara1;
                }
                if (rangePara1 < rangeV[0]) {
                    rangeV[0] = rangePara1;
                }
            }
            surf2Patch.rangeV = new Interval(rangeV[0], rangeV[1]);
        }
    }

    // 判断是否是优先参数域的曲面
    private _isSurfaceRangeUVFinite(surf: Surface): boolean {
        const isSimpleSurfaceRangeUVFinite = (theSurf: Surface) => {
            if (theSurf.isPlane() || theSurf.isCylinder()) {
                return false;
            }

            return false;
        };

        return isSimpleSurfaceRangeUVFinite(surf);
    }

    private _shrinkSurfacePatchRanges(
        surf1: Surface,
        surf2: Surface,
        surfPatch1: SurfacePatch,
        surfPatch2: SurfacePatch,
    ) {
        if (this._isSurfaceRangeUVFinite(surf1) && this._isSurfaceRangeUVFinite(surf2)) {
            surfPatch1.rangeU = surf1.getDomainU();
            surfPatch1.rangeV = surf1.getDomainV();

            surfPatch2.rangeU = surf2.getDomainU();
            surfPatch2.rangeV = surf2.getDomainV();
        } else if (
            (this._isSurfaceRangeUVFinite(surf1) && !this._isSurfaceRangeUVFinite(surf2)) ||
            (!this._isSurfaceRangeUVFinite(surf1) && this._isSurfaceRangeUVFinite(surf2))
        ) {
            if (this._isSurfaceRangeUVFinite(surf1)) {
                surfPatch1.rangeU = surf1.getDomainU();
                surfPatch1.rangeV = surf1.getDomainV();

                // 根据nurbs的包围盒调整其他无穷参数域曲面的参数域
                const intBox = surf1.getBox();
                this._shrinkSurfacePatchRangesByAnotherSurfaceBox(intBox, surfPatch2);
            } else {
                surfPatch2.rangeU = surf2.getDomainU();
                surfPatch2.rangeV = surf2.getDomainV();

                // 根据nurbs的包围盒调整其他无穷参数域曲面的参数域
                const intBox = surf2.getBox();
                this._shrinkSurfacePatchRangesByAnotherSurfaceBox(intBox, surfPatch1);
            }
        } else if (surf1.isCylinder() && surf2.isCylinder()) {
            const cyl1 = surf1 as Cylinder;
            const cyl2 = surf2 as Cylinder;
            const axis1 = cyl1.getCoord().getDz();
            const axis2 = cyl2.getCoord().getDz();

            const line1 = new Ln3(cyl1.getCoord().getOrigin(), axis1, Interval.infinitArray());
            const line2 = new Ln3(cyl2.getCoord().getOrigin(), axis2, Interval.infinitArray());
            const minDisPt1: Vec3 = new Vec3();
            const minDisPt2: Vec3 = new Vec3();
            D.curve3s(line1, line2, minDisPt1, minDisPt2);
            const minPtPara1 = line1.getParamAt(minDisPt1);
            const minPtPara2 = line2.getParamAt(minDisPt2);

            const cosAngle = axis1.dot(axis2);
            const sinAngle = Math.sqrt(1 - cosAngle * cosAngle);
            const maxRadius1 = cyl1.getA() > cyl1.getB() ? cyl1.getA() : cyl1.getB();
            const maxRadius2 = cyl2.getA() > cyl2.getB() ? cyl2.getA() : cyl2.getB();
            const rangeLength = (maxRadius1 + maxRadius2) / sinAngle;

            surfPatch1.rangeU = new Interval(0, CONST.PI2);
            surfPatch1.rangeV = new Interval(minPtPara1 - rangeLength, minPtPara1 + rangeLength);
            surfPatch2.rangeU = new Interval(0, CONST.PI2);
            surfPatch2.rangeV = new Interval(minPtPara2 - rangeLength, minPtPara2 + rangeLength);
        } else {
            throw new Error('unexpected surface type');
        }
    }

    private _surfacePatchsIntersectPoints(
        surfPatchs1: SurfacePatch[],
        surfPatchs2: SurfacePatch[],
        surfPatchPairs: ISurfacePatchPair[],
    ): ISurfaceSurfaceIntersectPointInfo[] {
        let newSurfPatchsPairs: ISurfacePatchPair[] = [];

        let depth: number = 0;

        while (depth < CONST.MAX_SUBDEVIDE_DEPTH) {
            // 细分曲面片
            surfPatchs1.map(sp1 => SurfacePatch.subdivideSurfacePatch(sp1));
            surfPatchs2.map(sp2 => SurfacePatch.subdivideSurfacePatch(sp2));

            // 曲面片组合成曲面片对儿
            const hasNewPair = this._combineSurfacePatchPairs(surfPatchPairs, newSurfPatchsPairs);
            if (!hasNewPair) {
                break; // 曲面不再细分了
            }

            // 筛选更新老的
            this._FilterSurfacePatchPairs(newSurfPatchsPairs);

            this._refreshSurfacePatchs(newSurfPatchsPairs, surfPatchs1, surfPatchs2);

            surfPatchPairs.splice(0);
            surfPatchPairs.push(...newSurfPatchsPairs);
            newSurfPatchsPairs = [];

            depth++;
        }

        const surfIntPts: ISurfaceSurfaceIntersectPointInfo[] = [];
        for (const iPair of surfPatchPairs) {
            const intersectPt = this._calcSurfacePatchPairIntersectPoint(iPair);
            if (intersectPt) {
                let hasInSet = false;
                for (const iter of surfIntPts) {
                    if (iter.point.equals(intersectPt.point)) {
                        hasInSet = true;
                        break;
                    }
                }
                if (!hasInSet) {
                    surfIntPts.push(intersectPt);
                }
            }
        }

        return surfIntPts;
    }

    private _combineSurfacePatchPairs(
        surfacePatchPairs: ISurfacePatchPair[],
        newSurfacePatchPairs: ISurfacePatchPair[],
    ): boolean {
        let hasNewSubPair = false;
        for (const surfPair of surfacePatchPairs) {
            if (surfPair.patch1.child.length === 0 && surfPair.patch2.child.length === 0) {
                newSurfacePatchPairs.push(surfPair); // 没有细分新的片段，老的作为叶子结点一样需要存起来
                continue;
            }

            const patchs1 = surfPair.patch1.child.length > 1 ? surfPair.patch1.child : [surfPair.patch1];
            const patchs2 = surfPair.patch2.child.length > 1 ? surfPair.patch2.child : [surfPair.patch2];
            for (const p1 of patchs1) {
                for (const p2 of patchs2) {
                    const newPatchPair: ISurfacePatchPair = { patch1: p1, patch2: p2 };
                    newSurfacePatchPairs.push(newPatchPair);
                }
            }

            hasNewSubPair = true;
        }

        return hasNewSubPair;
    }

    private _FilterSurfacePatchPairs(surfacePatchPairs: ISurfacePatchPair[]) {
        for (let i = 0; i < surfacePatchPairs.length; i++) {
            const surfacePatchPair = surfacePatchPairs[i];
            const surfacePatch1 = surfacePatchPair.patch1;
            const surfacePatch2 = surfacePatchPair.patch2;

            const box1 = surfacePatch1.getPatchBox3d();
            const box2 = surfacePatch2.getPatchBox3d();

            if (!box1.intersectsBox(box2)) {
                surfacePatchPairs.splice(i, 1);
                i--;
            }
        }
    }

    private _refreshSurfacePatchs(
        surfacePatchPairs: ISurfacePatchPair[],
        surfacePatchs1: SurfacePatch[],
        surfacePatchs2: SurfacePatch[],
    ) {
        const newSurfPatchs1: Set<SurfacePatch> = new Set();
        const newSurfPatchs2: Set<SurfacePatch> = new Set();
        for (const tmpSurfPatchPair of surfacePatchPairs) {
            newSurfPatchs1.add(tmpSurfPatchPair.patch1);
            newSurfPatchs2.add(tmpSurfPatchPair.patch2);
        }

        surfacePatchs1.splice(0);
        surfacePatchs1.push(...newSurfPatchs1);
        surfacePatchs2.splice(0);
        surfacePatchs2.push(...newSurfPatchs2);
    }

    private _calcSurfacePatchPairIntersectPoint(
        surfPatchPair: ISurfacePatchPair,
        initialParams?: { uvPara1: types.IXY; uvPara2: types.IXY },
        useNormalIterFunc = true,
    ): ISurfaceSurfaceIntersectPointInfo | undefined {
        const patch1 = surfPatchPair.patch1;
        const patch2 = surfPatchPair.patch2;
        const surf1 = patch1.surface;
        const surf2 = patch2.surface;

        let initial: types.IXY[];
        if (initialParams) {
            initial = [initialParams.uvPara1, initialParams.uvPara2];
            surf1.clampInDomain(initial[0]);
            surf2.clampInDomain(initial[1]);
        } else {
            const uvPara1: types.IXY = { x: patch1.rangeU.getMid(), y: patch1.rangeV.getMid() };
            const uvPara2: types.IXY = { x: patch2.rangeU.getMid(), y: patch2.rangeV.getMid() };
            initial = [uvPara1, uvPara2]; // 迭代初始值 //可优化，是否离散线段计算交点作为初始值
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

        const iterResValidity = surfaceSurfaceIteration(surf1, surf2, initial, this._tol.lengthEps, useNormalIterFunc);
        if (iterResValidity) {
            if (
                patch1.rangeU.containsPt(initial[0].x, this._tol.numberEps) &&
                patch1.rangeV.containsPt(initial[0].y, this._tol.numberEps) &&
                patch2.rangeU.containsPt(initial[1].x, this._tol.numberEps) &&
                patch2.rangeV.containsPt(initial[1].y, this._tol.numberEps)
            ) {
                const iterResPt1 = patch1.surface.getPtAt(initial[0]);
                const iterResPt2 = patch2.surface.getPtAt(initial[1]);

                initial[0].x = adjustInRange(patch1.rangeU, initial[0].x);
                initial[0].y = adjustInRange(patch1.rangeV, initial[0].y);
                initial[1].x = adjustInRange(patch2.rangeU, initial[1].x);
                initial[1].y = adjustInRange(patch2.rangeV, initial[1].y);
                return { point: iterResPt1.midTo(iterResPt2), uvPara1: initial[0], uvPara2: initial[1] };
            }
        }

        // 如果交点在边界附近，并且很容易迭代出边界然后导致计算不到结果，处理：利用边界线与曲面求交
        const pt1 = surf1.getPtAt(initial[0]);
        const pt2 = surf2.getPtAt(initial[1]);
        const sqrDist = pt1.sqDistanceTo(pt2);
        const coarseEps = 1e-2;
        if (sqrDist < coarseEps * coarseEps) {
            let boundCurv1: Curve3 | undefined;
            const boundUV1 = this._surf1BoundaryUVs;
            if (boundUV1.rangeU) {
                if (Util.isNearlyEqual(boundUV1.rangeU.min, initial[0].x, coarseEps)) {
                    boundCurv1 = this._surface[0].getIsoCurve(boundUV1.rangeU.min, false);
                } else if (Util.isNearlyEqual(boundUV1.rangeU.max, initial[0].x, coarseEps)) {
                    boundCurv1 = this._surface[0].getIsoCurve(boundUV1.rangeU.max, false);
                }
            }
            if (boundUV1.rangeV) {
                if (Util.isNearlyEqual(boundUV1.rangeV.min, initial[0].y, coarseEps)) {
                    boundCurv1 = this._surface[0].getIsoCurve(boundUV1.rangeV.min, false);
                } else if (Util.isNearlyEqual(boundUV1.rangeV.max, initial[0].y, coarseEps)) {
                    boundCurv1 = this._surface[0].getIsoCurve(boundUV1.rangeV.max, false);
                }
            }
            if (boundCurv1) {
                const boundPts1 = CurveSurfaceX.nearPoint(boundCurv1, surf2, pt1);
                if (boundPts1 && boundPts1.point.sqDistanceTo(pt1) < coarseEps * coarseEps) {
                    const uv1 = surf1.getUVAt(boundPts1.point);
                    return { point: boundPts1.point, uvPara1: uv1, uvPara2: boundPts1.surfaceUV };
                }
            }

            let boundCurv2: Curve3 | undefined;
            const boundUV2 = this._surf2BoundaryUVs;
            if (boundUV2.rangeU) {
                if (Util.isNearlyEqual(boundUV2.rangeU.min, initial[1].x, coarseEps)) {
                    boundCurv2 = this._surface[1].getIsoCurve(boundUV2.rangeU.min, false);
                } else if (Util.isNearlyEqual(boundUV2.rangeU.max, initial[1].x, coarseEps)) {
                    boundCurv2 = this._surface[1].getIsoCurve(boundUV2.rangeU.max, false);
                }
            }
            if (boundUV2.rangeV) {
                if (Util.isNearlyEqual(boundUV2.rangeV.min, initial[1].y, coarseEps)) {
                    boundCurv2 = this._surface[1].getIsoCurve(boundUV2.rangeV.min, false);
                } else if (Util.isNearlyEqual(boundUV2.rangeV.max, initial[1].y, coarseEps)) {
                    boundCurv2 = this._surface[1].getIsoCurve(boundUV2.rangeV.max, false);
                }
            }
            if (boundCurv2) {
                const boundPts2 = CurveSurfaceX.nearPoint(boundCurv2, surf1, pt1);
                if (boundPts2 && boundPts2.point.sqDistanceTo(pt1) < coarseEps * coarseEps) {
                    const uv2 = surf2.getUVAt(boundPts2.point);
                    return { point: boundPts2.point, uvPara1: boundPts2.surfaceUV, uvPara2: uv2 };
                }
            }
        }

        return undefined;
    }

    private _removeInitialIntersectPts(
        tmpIntCurvePt: ISurfaceSurfaceIntersectPointInfo,
        initialPts: ISurfaceSurfaceIntersectPointInfo[],
        sqrDis: number,
    ) {
        for (let i = 0; i < initialPts.length; i++) {
            // 后续如果曲线取点密集时，改成判断点在曲线上来去多余的点
            if (tmpIntCurvePt.point.sqDistanceTo(initialPts[i].point) < sqrDis) {
                initialPts.splice(i, 1);
                i--;
            }
        }
    }

    private _calTwoSurfaceSingleIntersect(
        intersectPt: ISurfaceSurfaceIntersectPointInfo,
        initialIntesctPts: ISurfaceSurfaceIntersectPointInfo[],
        refDir?: Vec3,
    ): ISurfacesXInfo | undefined {
        const intersectCurve = new IntersectCurve3(this._surface);
        const curvePts = intersectCurve.getIntersectPtsChart();
        curvePts.push(intersectPt);

        let forwardSign = 1;
        let tmpIntPt = intersectPt;
        let firstPtStepSqrDis = 0;
        // 循环找到一条交线的离散点集
        while (curvePts.length < CONST.MAX_INTERSECTION_NUM) {
            const nextPtOnCurve = this._calcNextInterscetPointInfo(tmpIntPt, intersectCurve, forwardSign, refDir);
            if (nextPtOnCurve.isArriveBoundary === ArriveBoundaryType.ON_AND_NEXT_OUTBOUNDARY) {
                break;
            }
            const nextPtInfo = nextPtOnCurve.newIntCurvPt;
            if (!nextPtInfo) {
                return undefined; // 计算不到下一个交点
            }

            // 计算第一个点和第二个点的间距，记录下来作为周期曲线判断结束的依据
            let ptsSqrDis: number;
            if (curvePts.length === 1) {
                firstPtStepSqrDis = intersectPt.point.sqDistanceTo(nextPtInfo.point);
                ptsSqrDis = firstPtStepSqrDis;
            } else {
                ptsSqrDis = tmpIntPt.point.sqDistanceTo(nextPtInfo.point);
            }

            if (initialIntesctPts.length > 0) {
                this._removeInitialIntersectPts(nextPtInfo, initialIntesctPts, ptsSqrDis);
            }

            if (ptsSqrDis < this._tol.lengthEps * this._tol.lengthEps) {
                // 前后两个点计算没移动？怎么处理？返回当前段？？接着计算？
                break;
            }

            curvePts.push(nextPtInfo);
            tmpIntPt = nextPtInfo;

            // 交线既是闭合曲线，又包含一段直线的情况，可能会出问题，停不下来
            // 或者起始段特别短，终止段特别长，直接跑到第二、三个点中间去了
            // 或者起始段特别长，终止段特别弯曲，判断结果会提前结束。// todo
            if (nextPtInfo.point.sqDistanceTo(intersectPt.point) < firstPtStepSqrDis) {
                curvePts.push(intersectPt);
                intersectCurve.updateKonts();
                const surfSurfIntInfo: ISurfacesXInfo = { curve: intersectCurve };
                return surfSurfIntInfo; // 交线周期回到迭代初始点
            }

            if (nextPtOnCurve.isArriveBoundary === ArriveBoundaryType.NEXT_OUT_BOUNDARY) {
                break;
            }
        }

        // 反向计算交点
        forwardSign = -1;
        curvePts.reverse();
        tmpIntPt = intersectPt;
        while (curvePts.length < CONST.MAX_INTERSECTION_NUM) {
            const prevPtOnCurve = this._calcNextInterscetPointInfo(tmpIntPt, intersectCurve, forwardSign, refDir);
            if (prevPtOnCurve.isArriveBoundary === ArriveBoundaryType.ON_AND_NEXT_OUTBOUNDARY) {
                break;
            }
            const prevCurvPt = prevPtOnCurve.newIntCurvPt;
            if (!prevCurvPt) {
                return undefined; // 计算不到下一个交点
            }

            const ptsSqrDis = tmpIntPt.point.sqDistanceTo(prevCurvPt.point);
            if (initialIntesctPts.length > 0) {
                this._removeInitialIntersectPts(prevCurvPt, initialIntesctPts, ptsSqrDis);
            }

            if (ptsSqrDis < this._tol.lengthEps * this._tol.lengthEps) {
                // 前后两个点计算没移动？怎么处理？返回当前段？？接着计算？
                break;
            }

            curvePts.push(prevCurvPt);
            tmpIntPt = prevCurvPt;

            if (prevPtOnCurve.isArriveBoundary === ArriveBoundaryType.NEXT_OUT_BOUNDARY) {
                break;
            }
        }

        curvePts.reverse();
        intersectCurve.updateKonts();
        const surfSurfIntInfo: ISurfacesXInfo = { curve: intersectCurve };
        return surfSurfIntInfo;
    }

    private _estimateNewIntersectPt(
        intersectPtInfo: ISurfaceSurfaceIntersectPointInfo,
        intCurvDvts: Vec3[],
        forwardSign: number = 1,
    ): Vec3 {
        let newNearPt: Vec3;
        const maxStepLength = CONST.MODEL_MAX_LENGTH * 10;
        const stepFactor = this._useHighPrecision ? 2 : 1;
        const origStepLength = 1 / (6 * stepFactor * intCurvDvts[2].getLength()); // 最好还是需要结合三阶导数，估算步长更合理
        if (origStepLength > maxStepLength) {
            const stepLength = maxStepLength; // 防止计算出来的point不合法，又保证出边界
            newNearPt = intersectPtInfo.point.added(intCurvDvts[1].multiplied(forwardSign * stepLength));
        } else {
            // todo：想办法缩短最大步长，因为有些情况步长直接8000多了，飞太远了
            let stepLength = origStepLength;
            if (origStepLength > 50) {
                stepLength = Math.sqrt(origStepLength - 50) + 50; // 步长不要突变，否则拟合效果差 // 且为单调函数，否则步长突然变短会出问题
            }
            newNearPt = intersectPtInfo.point
                .added(intCurvDvts[1].multiplied(forwardSign * stepLength))
                .add(intCurvDvts[2].multiplied((stepLength * stepLength) / 2));
        }
        return newNearPt;
    }

    // 返回值是否到达边界：如果该点正好已经在边界，并且估算的下一个点超出边界，不迭代求精下一个点；如果下一个点超出边界，用线面求交精确计算边界点；如果下一个点没超出边界，计算下一个点，正常循环
    private _calcNextInterscetPointInfo(
        tmpIntPt: ISurfaceSurfaceIntersectPointInfo,
        intersectCurve: IntersectCurve3,
        forwardSign: number,
        refDir?: Vec3,
    ): { isArriveBoundary: ArriveBoundaryType; newIntCurvPt: ISurfaceSurfaceIntersectPointInfo | undefined } {
        let tangentRefDir: Vec3 | undefined; // 让曲线的切向保持一致，防止由于两个曲面原因，叉乘计算的切向突然变向，给定切向的保持方向
        const curvePtInfos = intersectCurve.getIntersectPtsChart();
        if (curvePtInfos.length < 2) {
            if (refDir) {
                tangentRefDir = refDir.normalized();
            }
        } else {
            const prevIntPt = curvePtInfos[curvePtInfos.length - 2].point;
            tangentRefDir = tmpIntPt.point.subtracted(prevIntPt).normalize();
            tangentRefDir.multiply(forwardSign); // 如果forwardSign为-1，整个交线的交点表暂时倒序了，计算的切向的参考方向与原来的相反，需要反一下
        }
        const curvDvts = intersectCurve.getDerivativesAtPt(tmpIntPt, 2, forwardSign > 0, tangentRefDir);

        let estimateNewIntPt: Vec3; // 估算下一个交点
        if (curvDvts.length === 3) {
            estimateNewIntPt = this._estimateNewIntersectPt(tmpIntPt, curvDvts, forwardSign);
        } else {
            // 基本上只有两个曲面相切法相平行时计算会失败。针对法相平行，计算交线切向和二阶导失败的问题做处理：用stepDir和曲面法向粗略估计切向
            if (curvDvts.length < 2) {
                curvDvts[0] = tmpIntPt.point;
                const surfNormal1 = this._surface[0].getNormAt(tmpIntPt.uvPara1);
                const surfNormal2 = this._surface[1].getNormAt(tmpIntPt.uvPara2);
                let commonNormal: Vec3;
                if (surfNormal1.equals(surfNormal2)) {
                    commonNormal = surfNormal1.added(surfNormal2).multiply(0.5);
                } else {
                    commonNormal = surfNormal1.subtracted(surfNormal2).multiply(0.5);
                }

                if (!tangentRefDir) {
                    throw new Error('防御了这么多层，还出问题，简直绝了！'); // ->查查是不是曲面重合了
                }
                // 估计一个切向继续计算
                const refvect = tangentRefDir.cross(commonNormal);
                if (refvect.getSqLength() < Tol.LENGTH_2) {
                    curvDvts[1] = tangentRefDir;
                } else {
                    curvDvts[1] = commonNormal.cross(refvect).normalize();
                }
            }

            if (curvePtInfos.length < 2) {
                MathError.warn('可能是曲面重合了！');
                const surf1Dvts = this._surface[0].getDerivatives(tmpIntPt.uvPara1, 2);
                const surf2Dvts = this._surface[1].getDerivatives(tmpIntPt.uvPara2, 2);
                let minDvt2SqrLength = CONST.MAX_INTEGER; // 取曲率最小的，估算出一个最小的步长
                const dvts2 = [surf1Dvts[3], surf1Dvts[4], surf1Dvts[5], surf2Dvts[3], surf2Dvts[4], surf2Dvts[5]];
                for (const dvt of dvts2) {
                    const sqrLength = dvt.getSqLength();
                    if (sqrLength < Tol.EDGE_LENGTH_EPS) {
                        continue; // 去掉为0的情况
                    }

                    if (sqrLength < minDvt2SqrLength) {
                        minDvt2SqrLength = sqrLength;
                    }
                }
                const origStepLength = Math.sqrt(minDvt2SqrLength) / 10; // 用曲面的二阶偏微分估算一个长度
                const stepLength = Math.min(origStepLength, 50);
                estimateNewIntPt = tmpIntPt.point.added(curvDvts[1].multiplied(forwardSign * stepLength));
            } else {
                const prevIntPt = curvePtInfos[curvePtInfos.length - 2].point;
                const stepLength = tmpIntPt.point.subtracted(prevIntPt).getLength();
                estimateNewIntPt = tmpIntPt.point.added(curvDvts[1].multiplied(forwardSign * stepLength));
            }
        }

        const sqrTol = this._tol.lengthEps * this._tol.lengthEps * 10000;
        const arriveBoundPt = this._adjustEstimatedPtByBoundary(tmpIntPt, curvDvts, estimateNewIntPt, forwardSign);
        if (arriveBoundPt) {
            // 不为undefined，说明下一个点会出边界或者会到达边界
            let nextOutBound = ArriveBoundaryType.NEXT_OUT_BOUNDARY;
            if (arriveBoundPt.point.sqDistanceTo(tmpIntPt.point) < sqrTol) {
                nextOutBound = ArriveBoundaryType.ON_AND_NEXT_OUTBOUNDARY; // 如果当前点已经是边界(如果第一个点就是边界点，就不会经历下一个点到达边界的情况，就会来到这儿)
            }
            return { isArriveBoundary: nextOutBound, newIntCurvPt: arriveBoundPt };
        }

        // 未到达边界，估算新的参数uv，继续迭代计算一个精确交点
        const calcNewUV = (surf: Surface, lastPtUV: types.IXY, estimatePt: Vec3) => {
            const dvts: Vec3[] = surf.getDerivatives(lastPtUV, 1);
            const stepVect = estimatePt.subtracted(dvts[0]);
            const duLength = dvts[1].getLength();
            const dvLength = dvts[2].getLength();

            const uStep = stepVect.dot(dvts[1].normalized());
            const estimatePtU = lastPtUV.x + uStep / duLength;
            const vStep = stepVect.dot(dvts[2].normalized());
            const estimatePtV = lastPtUV.y + vStep / dvLength;
            const estimatePtUV = { x: estimatePtU, y: estimatePtV };
            return estimatePtUV;
        };

        const newUV1 = calcNewUV(this._surface[0], tmpIntPt.uvPara1, estimateNewIntPt);
        const newUV2 = calcNewUV(this._surface[1], tmpIntPt.uvPara2, estimateNewIntPt);
        const estimateNewPtInfo = { pt: estimateNewIntPt, uv1: newUV1, uv2: newUV2 };
        const newCurvPt = this._refineNewIntersectPtIteratively(estimateNewPtInfo, tmpIntPt.point);
        return { isArriveBoundary: ArriveBoundaryType.NOT_OUT_BOUNDARY, newIntCurvPt: newCurvPt };
    }

    // private _isOnboundAndNextOutBoundary(
    //     tmpIntPt: ISurfaceSurfaceIntersectPointInfo,
    //     newStepDir: Vec3,
    //     surfIndex: number,
    // ): boolean {
    //     let uvParam: types.IXY;
    //     let surfDvts: Vec3[];
    //     if (surfIndex === 0) {
    //         uvParam = tmpIntPt.uvPara1;
    //         surfDvts = this._surface[0].getDerivatives(uvParam, 1);
    //     } else {
    //         uvParam = tmpIntPt.uvPara2;
    //         surfDvts = this._surface[1].getDerivatives(uvParam, 1);
    //     }

    //     const bigEps = this._tol.lengthEps * 100;
    //     const surfBound = surfIndex === 0 ? this._surf1BoundaryUVs : this._surf2BoundaryUVs;
    //     if (surfBound[0].length > 0) {
    //         // 如果tmpPt是在rangeU的左边界上，step方向与曲面du反向，下一个点就会出参数域
    //         // 如果tmpPt是在rangeU的右边界上，step方向与曲面du相同，下一个点就会出参数域
    //         const duDotStep = surfDvts[1].dot(newStepDir);
    //         if (
    //             (Util.isNearlyEqual(uvParam.x, surfBound[0][0], bigEps) && duDotStep < 0) ||
    //             (Util.isNearlyEqual(uvParam.x, surfBound[0][1], bigEps) && duDotStep > 0)
    //         ) {
    //             return true;
    //         }
    //     }
    //     if (surfBound[1].length > 0) {
    //         // 如果tmpPt是在rangeV的左边界上，step方向与曲面dv反向，下一个点就会出参数域
    //         // 如果tmpPt是在rangeV的右边界上，step方向与曲面dv相同，下一个点就会出参数域
    //         const dvDotStep = surfDvts[2].dot(newStepDir);
    //         if (
    //             (Util.isNearlyEqual(uvParam.y, surfBound[1][0], bigEps) && dvDotStep < 0) ||
    //             (Util.isNearlyEqual(uvParam.y, surfBound[1][1], bigEps) && dvDotStep > 0)
    //         ) {
    //             return true;
    //         }
    //     }
    //     return false;
    // }

    // 有些情况，譬如说圆弧的扫掠面，path反求参数有四个解，取其中一个最近的，但是由于估计点不在曲面上，取的最近点的uv可能不对，离得很远。
    // 此时，采用粗略计算估计点的uv：优点在于，对于nurbs曲面，计算的uv也会基本正确，不会拉回到边界，并且效率高。缺点：粗略计算的uv
    private _estimateSurfaceUV(surfDvts: Vec3[], estimatePt: Vec3, lastPtUV: types.IXY): types.IXY {
        const stepVect = estimatePt.subtracted(surfDvts[0]);
        const duLength = surfDvts[1].getLength();
        const dvLength = surfDvts[2].getLength();

        const uStep = stepVect.dot(surfDvts[1].normalized());
        const estimatePtU = lastPtUV.x + uStep / duLength;
        const vStep = stepVect.dot(surfDvts[2].normalized());
        const estimatePtV = lastPtUV.y + vStep / dvLength;
        const estimatePtUV = { x: estimatePtU, y: estimatePtV };
        return estimatePtUV;
    }

    private _estimateCurveT(curve: Curve3, estimatePt: Vec3, lastPtT: number): number {
        const cvDvts = curve.getDerivatives(lastPtT, 1);
        const stepVect = estimatePt.subtracted(cvDvts[0]);
        const dtLength = cvDvts[1].getLength();
        const tStep = stepVect.dot(cvDvts[1].normalized());
        const estimateT = lastPtT + tStep / dtLength;
        return estimateT;
    }

    // 判断估计的交点是否出边界：如果点超出边界，调整步长重新计算估计的交点，使估计点在边界附近
    private _adjustEstimatedPtByBoundary(
        intPtInfo: ISurfaceSurfaceIntersectPointInfo,
        curvDvtsAtPt: Vec3[],
        estimateIntPt: Vec3,
        forwardSign: number = 1,
    ): ISurfaceSurfaceIntersectPointInfo | undefined {
        const stepVect = estimateIntPt.subtracted(intPtInfo.point);
        const stepDir = stepVect.normalized();
        const stepLength = stepVect.getLength();

        const coarseEps = this._tol.lengthEps * 100;
        const adjustStepLength = (ithSurf: number, xPtUV: types.IXY, surfDvts: Vec3[]) => {
            const boundInfo: IArriveBoundStruct = { arriveBoundary: false, newStepLength: CONST.MAX_INTEGER };
            const surfUVBound = ithSurf === 0 ? this._surf1BoundaryUVs : this._surf2BoundaryUVs;
            if (!surfUVBound.rangeU && !surfUVBound.rangeV) {
                return boundInfo; // 没有边界的surface：如平面、柱面等
            }

            const judgeOutBoundEps = coarseEps * 100; // 判断出边界，可以用较宽松的容差，因为判断出边界后会用线面求交
            const estimatePtUV = this._estimateSurfaceUV(surfDvts, estimateIntPt, xPtUV);
            if (surfUVBound.rangeU) {
                const cosDuTangent = stepDir.dot(surfDvts[1].normalized());
                // 如果交线为边界线，交点也可以一直沿着u边界走，只要stepLength * cosDuTangent < judgeOutBoundEps，就不会出u边界
                if (Math.abs(cosDuTangent) > judgeOutBoundEps / stepLength) {
                    const uCoarseEps = judgeOutBoundEps / surfDvts[1].getLength();
                    if (Util.isNearlyBiggerOrEqual(estimatePtUV.x, surfUVBound.rangeU.max, uCoarseEps)) {
                        // 如果估的点就在边界，也是下一个点要到达边界了。并且，对于nurbs反求参数一定会拉回到边界。所以要用isNearlyBiggerOrEqual，不能只用isNearlyBigger
                        boundInfo.newStepLength =
                            Math.abs((surfUVBound.rangeU.max - xPtUV.x) / (estimatePtUV.x - xPtUV.x)) * stepLength;
                        boundInfo.arriveBoundary = true;
                        boundInfo.isArriveVBound = false;
                        boundInfo.boundParam = surfUVBound.rangeU.max;
                    } else if (Util.isNearlySmallerOrEqual(estimatePtUV.x, surfUVBound.rangeU.min, uCoarseEps)) {
                        boundInfo.newStepLength =
                            Math.abs((xPtUV.x - surfUVBound.rangeU.min) / (xPtUV.x - estimatePtUV.x)) * stepLength;
                        boundInfo.arriveBoundary = true;
                        boundInfo.isArriveVBound = false;
                        boundInfo.boundParam = surfUVBound.rangeU.min;
                    }
                }
            }

            if (surfUVBound.rangeV) {
                const cosDvTangent = stepDir.dot(surfDvts[2].normalized());
                // 如果交线为边界线，交点也可以一直沿着v边界走，只要stepLength * cosDvTangent < judgeOutBoundEps，就不会出v边界
                if (Math.abs(cosDvTangent) > judgeOutBoundEps / stepLength) {
                    const vCoarseEps = judgeOutBoundEps / surfDvts[2].getLength();
                    if (Util.isNearlyBiggerOrEqual(estimatePtUV.y, surfUVBound.rangeV.max, vCoarseEps)) {
                        const tmpStepLength =
                            Math.abs((surfUVBound.rangeV.max - xPtUV.y) / (estimatePtUV.y - xPtUV.y)) * stepLength;
                        if (tmpStepLength < boundInfo.newStepLength) {
                            boundInfo.newStepLength = tmpStepLength;
                            boundInfo.isArriveVBound = true;
                            boundInfo.boundParam = surfUVBound.rangeV.max;
                        }
                        boundInfo.arriveBoundary = true;
                    } else if (Util.isNearlySmallerOrEqual(estimatePtUV.y, surfUVBound.rangeV.min, vCoarseEps)) {
                        const tmpStepLength =
                            Math.abs((xPtUV.y - surfUVBound.rangeV.min) / (xPtUV.y - estimatePtUV.y)) * stepLength;
                        if (tmpStepLength < boundInfo.newStepLength) {
                            boundInfo.newStepLength = tmpStepLength;
                            boundInfo.isArriveVBound = true;
                            boundInfo.boundParam = surfUVBound.rangeV.min;
                        }
                        boundInfo.arriveBoundary = true;
                    }
                }
            }

            return boundInfo;
        };

        const dvts1 = this._surface[0].getDerivatives(intPtInfo.uvPara1, 1);
        const dvts2 = this._surface[1].getDerivatives(intPtInfo.uvPara2, 1);
        const boundInfo1 = adjustStepLength(0, intPtInfo.uvPara1, dvts1);
        const boundInfo2 = adjustStepLength(1, intPtInfo.uvPara2, dvts2);
        if (!boundInfo1.arriveBoundary && !boundInfo2.arriveBoundary) {
            return undefined;
        }

        // 如果调整了步长，则同时调整estimateNewIntPt。
        const minStepLength = Math.min(boundInfo1.newStepLength, boundInfo2.newStepLength);
        if (minStepLength < coarseEps) {
            return intPtInfo; // 如果步长为0，下一个点出边界，并且已经到边界，就不需要计算边界点，因为当前就是边界点
        }

        if (curvDvtsAtPt.length < 3 || curvDvtsAtPt[2].getLength() < this._tol.lengthEps) {
            // 如果计算二阶导失败；或者，为了区分处理直线的情况，计算曲率有误差接近0但不是0，但步长特别长，步长平方之后二阶项不为0
            estimateIntPt.copy(intPtInfo.point.added(stepDir.multiplied(minStepLength)));
        } else {
            const newEstimateNewIntPt = intPtInfo.point
                .added(curvDvtsAtPt[1].multiplied(forwardSign * minStepLength))
                .add(curvDvtsAtPt[2].multiplied((minStepLength * minStepLength) / 2));
            estimateIntPt.copy(newEstimateNewIntPt);
        }

        if (boundInfo1.newStepLength <= boundInfo2.newStepLength) {
            const boundCurve = this._surface[0].getIsoCurve(boundInfo1.boundParam!, boundInfo1.isArriveVBound!);
            const refT0 = boundInfo1.isArriveVBound ? intPtInfo.uvPara1.x : intPtInfo.uvPara1.y;
            const refT = this._estimateCurveT(boundCurve, estimateIntPt, refT0);
            const refUV = this._estimateSurfaceUV(dvts2, estimateIntPt, intPtInfo.uvPara2);
            const boundPtInfo = CurveSurfaceX.nearParam(boundCurve, this._surface[1], refT, refUV, this._tol);
            if (boundPtInfo) {
                const uv1 = this._estimateSurfaceUV(dvts1, boundPtInfo.point, intPtInfo.uvPara1);
                return { point: boundPtInfo.point, uvPara1: uv1, uvPara2: boundPtInfo.surfaceUV };
            }
        } else {
            const boundCurve = this._surface[1].getIsoCurve(boundInfo2.boundParam!, boundInfo2.isArriveVBound!);
            const refT0 = boundInfo2.isArriveVBound ? intPtInfo.uvPara2.x : intPtInfo.uvPara2.y;
            const refT = this._estimateCurveT(boundCurve, estimateIntPt, refT0);
            const refUV = this._estimateSurfaceUV(dvts1, estimateIntPt, intPtInfo.uvPara1);
            const boundPtInfo = CurveSurfaceX.nearParam(boundCurve, this._surface[0], refT, refUV, this._tol);
            if (boundPtInfo) {
                const uv2 = this._estimateSurfaceUV(dvts2, boundPtInfo.point, intPtInfo.uvPara2);
                return { point: boundPtInfo.point, uvPara1: boundPtInfo.surfaceUV, uvPara2: uv2 };
            }
        }

        return undefined;
    }

    private _refineNewIntersectPtIteratively(
        newNearPtInfo: { pt: Vec3; uv1: types.IXY; uv2: types.IXY },
        prevIntersctPt: Vec3,
    ): ISurfaceSurfaceIntersectPointInfo | undefined {
        const surf1 = this._surface[0];
        const surf2 = this._surface[1];
        if (
            surf1.getPtAt(newNearPtInfo.uv1).equals(newNearPtInfo.pt) &&
            surf2.getPtAt(newNearPtInfo.uv2).equals(newNearPtInfo.pt)
        ) {
            const newCurvPt: ISurfaceSurfaceIntersectPointInfo = {
                point: newNearPtInfo.pt,
                uvPara1: newNearPtInfo.uv1,
                uvPara2: newNearPtInfo.uv2,
            };
            return newCurvPt;
        }

        // 如果近似点不在交线上，重新迭代求精
        const surfPatch1: SurfacePatch = new SurfacePatch(surf1, [surf1.getDomainU(), surf1.getDomainV()]);
        const surfPatch2: SurfacePatch = new SurfacePatch(surf2, [surf2.getDomainU(), surf2.getDomainV()]);
        const refParams = {
            uvPara1: newNearPtInfo.uv1,
            uvPara2: newNearPtInfo.uv2,
        };
        const surfacePatchPair: ISurfacePatchPair = { patch1: surfPatch1, patch2: surfPatch2 };
        let newIterResult = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams);
        // 如果迭代求精失败或者结果不好，采用1阶迭代求精
        if (newIterResult === undefined) {
            newIterResult = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams, false);
            if (newIterResult === undefined) {
                return undefined; // 求点失败
            }
        } else if (
            newIterResult.point.sqDistanceTo(newNearPtInfo.pt) >
            prevIntersctPt.sqDistanceTo(newNearPtInfo.pt) * 0.81
        ) {
            // 迭代求精确点结果距离估计点的距离比0.9 * 估计的步长（估计点与上一精确交点的距离）的还远，说明迭代求精的结果不好
            const newCurvPt2 = this._calcSurfacePatchPairIntersectPoint(surfacePatchPair, refParams, false);
            if (
                newCurvPt2 !== undefined &&
                newIterResult.point.sqDistanceTo(newNearPtInfo.pt) > newCurvPt2.point.sqDistanceTo(newNearPtInfo.pt)
            ) {
                newIterResult = newCurvPt2; // 如果1阶迭代求精的结果也不好，且两个都不为undefined，比较取一个更近的
            }
        }

        return newIterResult;
    }
}