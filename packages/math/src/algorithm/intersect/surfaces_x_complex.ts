import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { MathAssert } from '../../util/assert';
import { X } from '../calc_x';
import { Util } from '../../util/util';
import { PtToCurve3Distance } from '../distance/pt_to_curve3_distance';
import { SurfacesCoplaner } from '../overlap/surfaces_coplaner';
import { Surface } from '../../geometry/surface';
import { Interval } from '../../base/interval';
import { Vec3 } from '../../base/vec3';
import { Tol } from '../../base/tol';
import { ISurfacesXInfo } from './x_info';
import { SurfacesXUtil } from './surfaces_x_util';
import { SurfacesXSpecial } from './surfaces_x_special';
import { Curve3 } from '../../geometry/curve3d';
import { IntersectCurve3 } from '../../geometry/intersect_curve3';



interface ISurfacePatchSimple {
    surface: Surface;

    rangeUV?: Interval[];
}

interface IIntersectPatchPairs {
    patch1: ISurfacePatchSimple;

    patch2: ISurfacePatchSimple;

    points: Vec3[];

    dir: Vec3 | undefined;

    isUsed: boolean;
}

interface ISingularCurvePatchs {
    curve: Curve3; // 奇异曲线

    surfPatchs: ISurfacePatchSimple[]; // 奇异曲线关联的两个SurfacePatch
}

export class SurfacesXComplex {
    private _surface1: Surface;

    private _surface2: Surface;

    private _surfacePatchs1: ISurfacePatchSimple[] = [];

    private _surfacePatchs2: ISurfacePatchSimple[] = [];

    private _singularCurvePatchs1: ISingularCurvePatchs[] = [];

    private _singularCurvePatchs2: ISingularCurvePatchs[] = [];

    private _tol: Tol;

    constructor(surf1: Surface, surf2: Surface, tol: Tol = new Tol()) {
        this._surface1 = surf1;
        this._surface2 = surf2;
        this._tol = tol;

        this._splitSurface(surf1, surf2);
    }

    public allIntersects(): ISurfacesXInfo[] {
        const surfInterstRets: ISurfacesXInfo[] = [];
        for (const subSurf1 of this._surfacePatchs1) {
            for (const subSurf2 of this._surfacePatchs2) {
                const intResult = SurfacesXSpecial.execute(subSurf1.surface, subSurf2.surface, this._tol);
                if (intResult !== undefined) {
                    surfInterstRets.push(...intResult);
                    continue;
                }

                const surfIntUtil = new SurfacesXUtil(
                    subSurf1.surface,
                    subSurf2.surface,
                    this._tol,
                    subSurf1.rangeUV,
                    subSurf2.rangeUV,
                );
                surfInterstRets.push(...surfIntUtil.calAllIntersects());
            }
        }

        // 需要合并多段相连接的交线，去掉重复的交线
        // Todo

        return surfInterstRets;
    }

    public singleIntersectCurve(
        refPoint: Vec3,
        refDir?: Vec3,
        useHighPrecision = false,
        convertToNurbs = true,
    ): Curve3 | undefined {
        // 精确计算参考点的位置
        const surfIntUtil = new SurfacesXUtil(this._surface1, this._surface2, this._tol);
        const firstPtInfo = surfIntUtil.findSurfaceIntersectPoint(refPoint);
        if (firstPtInfo === undefined) {
            return undefined;
        }

        // 先判断处理面重合情况
        const coincideCurve = this._getOverlapSurfaceIntersection(firstPtInfo.point);
        if (coincideCurve) {
            return coincideCurve;
        }

        // 找到第一组用于求交的surfPatch
        let surfPatch1: ISurfacePatchSimple;
        let surfPatch2: ISurfacePatchSimple;

        surfPatch1 = this._surfacePatchs1[0];
        surfPatch2 = this._surfacePatchs2[0];

        const firstPair: IIntersectPatchPairs = {
            patch1: surfPatch1,
            patch2: surfPatch2,
            points: [firstPtInfo.point],
            dir: refDir,
            isUsed: false,
        };
        const connectPairs: IIntersectPatchPairs[] = [];
        connectPairs.push(firstPair);

        // 多段曲面求交，可能需要拼接交线
        const surfInterstRets: IntersectCurve3[] = [];
        const usedEndPts: Vec3[] = [];
        const coarseEps = this._tol.lengthEps * 1000;
        for (const cp of connectPairs) {
            if (cp.isUsed) {
                continue;
            }
            cp.isUsed = true;

            const surfUtil = new SurfacesXUtil(
                cp.patch1.surface,
                cp.patch2.surface,
                this._tol,
                cp.patch1.rangeUV,
                cp.patch2.rangeUV,
            );
            const ret = surfUtil.calSingleIntersect(cp.points[0], cp.dir, useHighPrecision);
            if (ret === undefined) {
                MathAssert.warn(true, '谨慎核查：一段交线计算失败！！');
                continue;
            }
            const xCurve = ret.curve as IntersectCurve3;
            const ptsChart = xCurve.getIntersectPtsChart();
            if (ptsChart.length === 2) {
                const success = xCurve.insertPt(0, 0.5); // 如果只有两个交点，再插入一个交点
                MathAssert.warn(success, '交线插点失败！！');
            }

            let sumSqrDist = 0; // 交点的距离的平方长度和，用于判断交线是不是很短，在一个点附近
            for (let j = 1; j < ptsChart.length; j++) {
                const sqrDist = ptsChart[j].point.sqDistanceTo(ptsChart[j - 1].point);
                sumSqrDist += sqrDist;
            }
            if (Math.sqrt(sumSqrDist) < coarseEps * 10) {
                // 计算了一条曲线所有点的距离都很近，可以直接忽略这种曲线,当做一个点处理
                this._getNextPatchPairForOnePtCurve(cp, xCurve, cp.dir, usedEndPts, connectPairs, coarseEps);
                continue;
            }

            surfInterstRets.push(xCurve);
            cp.points = [ptsChart[0].point, ptsChart[ptsChart.length - 1].point];

            this._updateConnectPatchPairs(cp, xCurve, connectPairs, coarseEps);
            this._getNextPatchPair(cp, xCurve, usedEndPts, connectPairs, coarseEps);
        }

        const degree = useHighPrecision ? 3 : 2;
        if (surfInterstRets.length < 2) {
            if (surfInterstRets.length === 0) {
                return undefined;
            }
            if (!convertToNurbs) {
                return surfInterstRets[0];
            }
            const xCurve = surfInterstRets[0] as IntersectCurve3;
            const intNurbs = xCurve.toSimpleCurve3d(degree);
            return intNurbs;
        }

        // 注意：convertToNurbs参数在这里面没用
        if (!convertToNurbs) {
            //
            console.warn('复合曲线求交：convertToNurbs失效！！！');
        }
        const retNurbs = this._spliceIntersectCurves(surfInterstRets, firstPtInfo.point, degree, coarseEps);
        return retNurbs;
    }

    private _splitSurface(surface1: Surface, surface2: Surface) {
        // 当前只考虑v向是ExtendCurve的复合曲面，未考虑u向分段问题
        this._surfacePatchs1 = [{ surface: surface1 }]; // 不能分解的曲面
        this._surfacePatchs2 = [{ surface: surface2 }];
    }

    private _getNextPatchPairForOnePtCurve(
        thePair: IIntersectPatchPairs,
        xCurve: IntersectCurve3,
        refDir: Vec3 | undefined,
        usedEndPts: Vec3[],
        connectPairs: IIntersectPatchPairs[],
        coarseEps: number,
    ) {
        const ept = xCurve.getIntersectPtsChart()[0];
        let isUsed = false;
        for (const spt of usedEndPts) {
            if (spt.equals(ept.point, coarseEps)) {
                isUsed = true; // 如果交线curve在奇异点位置自交，曲线在此封闭，不会继续求下一段，以后若需要再修改
                break;
            }
        }
        if (isUsed) {
            return;
        }
        usedEndPts.push(ept.point);

        // 如果交点在奇异曲线上 =>  找到交点关联的两个patchs。
        const ptConnectPatchs1: ISurfacePatchSimple[] = [];
        for (const cs1 of this._singularCurvePatchs1) {
            if (cs1.curve.containsPt(ept.point, coarseEps)) {
                ptConnectPatchs1.push(...cs1.surfPatchs);
            }
        }
        const ptConnectPatchs2: ISurfacePatchSimple[] = [];
        for (const cs2 of this._singularCurvePatchs2) {
            if (cs2.curve.containsPt(ept.point, coarseEps)) {
                ptConnectPatchs2.push(...cs2.surfPatchs);
            }
        }

        if (ptConnectPatchs1.length === 2 && ptConnectPatchs2.length === 0) {
            const nextPatch1 = thePair.patch1 === ptConnectPatchs1[0] ? ptConnectPatchs1[1] : ptConnectPatchs1[0];
            connectPairs.push({
                patch1: nextPatch1,
                patch2: thePair.patch2,
                points: [ept.point],
                dir: refDir,
                isUsed: false,
            });
        } else if (ptConnectPatchs1.length === 0 && ptConnectPatchs2.length === 2) {
            const nextPatch2 = thePair.patch2 === ptConnectPatchs2[0] ? ptConnectPatchs2[1] : ptConnectPatchs2[0];
            connectPairs.push({
                patch1: thePair.patch1,
                patch2: nextPatch2,
                points: [ept.point],
                dir: refDir,
                isUsed: false,
            });
        } else if (ptConnectPatchs1.length === 2 && ptConnectPatchs2.length === 2) {
            const isInPatchsPair = (pat1: ISurfacePatchSimple, pat2: ISurfacePatchSimple, thePt: Vec3) => {
                for (const it of connectPairs) {
                    if (it.patch1 === pat1 && it.patch2 === pat2) {
                        for (const pt of it.points) {
                            if (pt.equals(thePt, coarseEps)) {
                                return true;
                            }
                        }
                        return false;
                    }
                }
                return false;
            };

            for (const p1 of ptConnectPatchs1) {
                for (const p2 of ptConnectPatchs2) {
                    if (!isInPatchsPair(p1, p2, ept.point)) {
                        connectPairs.push({ patch1: p1, patch2: p2, points: [ept.point], dir: refDir, isUsed: false });
                    }
                }
            }
        }
    }

    // 更新需要求交的patch对儿
    private _updateConnectPatchPairs(
        thePair: IIntersectPatchPairs,
        xCurve: IntersectCurve3,
        connectPairs: IIntersectPatchPairs[],
        tol: number,
    ) {
        const ptsChart = xCurve.getIntersectPtsChart();
        const endPts: Vec3[] = [ptsChart[0].point, ptsChart[ptsChart.length - 1].point];
        for (const ip of connectPairs) {
            if (ip.isUsed) {
                continue;
            }

            if (
                ip.patch1 === thePair.patch1 &&
                ip.patch2 === thePair.patch2 &&
                (ip.points[0].equals(endPts[0], tol) || ip.points[0].equals(endPts[1], tol))
            ) {
                ip.isUsed = true;
            }
        }
    }

    // 如果计算的curve的起点或终点在奇异曲线上，找到下一个patch组成surfacePatchPair
    private _getNextPatchPair(
        thePair: IIntersectPatchPairs,
        xCurve: IntersectCurve3,
        usedEndPts: Vec3[],
        connectPairs: IIntersectPatchPairs[],
        coarseEps: number,
    ) {
        const ptsChart = xCurve.getIntersectPtsChart();
        const curveEndPts = [ptsChart[0], ptsChart[ptsChart.length - 1]];
        for (let i = 0; i < curveEndPts.length; i++) {
            const ept = curveEndPts[i];
            let isUsed = false;
            for (const spt of usedEndPts) {
                if (spt.equals(ept.point, coarseEps)) {
                    isUsed = true; // 如果交线curve在奇异点位置自交，曲线在此封闭，不会继续求下一段，以后若需要再修改
                    break;
                }
            }
            if (isUsed) {
                continue;
            }
            usedEndPts.push(ept.point);

            // 如果交点在奇异曲线上 =>  找到交点关联的两个patchs。
            const ptConnectPatchs1: ISurfacePatchSimple[] = [];
            for (const cs1 of this._singularCurvePatchs1) {
                if (cs1.curve.containsPt(ept.point, coarseEps)) {
                    // 判断整条交线的交点是不是都在奇异曲线上，如果是，则交线是奇异曲线，不用（也不能）再在相邻的曲面上求交，因为会求出一条相同的交线
                    let isXCurveOnIsoparamVCurve = true;
                    const surfPatch1 = thePair.patch1 === cs1.surfPatchs[0] ? cs1.surfPatchs[0] : cs1.surfPatchs[1];
                    // 先找到奇异曲线对应当前曲面的参数，再判断是不是交线所有的点的参数是否和他相等
                    const singularParam1 = surfPatch1.surface.getUVAt(cs1.curve.getStartPt()); // 有可能曲面简化之后uv互换了，所以也不能直接使用参数的v值
                    const singularParam2 = surfPatch1.surface.getUVAt(cs1.curve.getMidPt());
                    const sameU = Util.isNearlyEqual(singularParam1.x, singularParam2.x);
                    const sameV = Util.isNearlyEqual(singularParam1.y, singularParam2.y);
                    const dvts = surfPatch1.surface.getDerivatives(singularParam1, 1);
                    if (sameU && sameV) {
                        // v向和u向都很近？？
                        throw new Error('');
                    } else if (sameU) {
                        const singularUParam = singularParam1.x;
                        const paramEps = coarseEps / dvts[1].getLength();
                        for (const it of ptsChart) {
                            // 交线是奇异曲线，所有的参数u都相等
                            if (!Util.isNearlyEqual(it.uvPara1.x, singularUParam, paramEps)) {
                                isXCurveOnIsoparamVCurve = false;
                                break;
                            }
                        }
                    } else if (sameV) {
                        const singularVParam = singularParam1.y;
                        const paramEps = coarseEps / dvts[2].getLength();
                        for (const it of ptsChart) {
                            // 交线是奇异曲线，所有的参数v都相等
                            if (!Util.isNearlyEqual(it.uvPara1.y, singularVParam, paramEps)) {
                                isXCurveOnIsoparamVCurve = false;
                                break;
                            }
                        }
                    }

                    if (isXCurveOnIsoparamVCurve) {
                        return; // 如果交线是奇异曲线，不用（也不能）再在相邻的曲面上求交，因此不用再继续找下一个曲面pair
                    }

                    ptConnectPatchs1.push(...cs1.surfPatchs);
                }
            }
            const ptConnectPatchs2: ISurfacePatchSimple[] = [];
            for (const cs2 of this._singularCurvePatchs2) {
                if (cs2.curve.containsPt(ept.point, coarseEps)) {
                    // 判断整条交线的交点是不是都在奇异曲线上，如果是，则交线是奇异曲线，不用（也不能）再在相邻的曲面上求交，因为会求出一条相同的交线
                    let isXCurveOnIsoparamVCurve = true;
                    const surfPatch2 = thePair.patch2 === cs2.surfPatchs[0] ? cs2.surfPatchs[0] : cs2.surfPatchs[1];
                    // 先找到奇异曲线对应当前曲面的参数，再判断是不是交线所有的点的参数是否和他相等
                    const singularParam1 = surfPatch2.surface.getUVAt(cs2.curve.getStartPt()); // 有可能曲面简化之后uv互换了，所以也不能直接使用参数的v值
                    const singularParam2 = surfPatch2.surface.getUVAt(cs2.curve.getMidPt());
                    const sameU = Util.isNearlyEqual(singularParam1.x, singularParam2.x);
                    const sameV = Util.isNearlyEqual(singularParam1.y, singularParam2.y);
                    const dvts = surfPatch2.surface.getDerivatives(singularParam1, 1);
                    if (sameU && sameV) {
                        // v向和u向都很近？？
                        throw new Error('');
                    } else if (sameU) {
                        const singularUParam = singularParam1.x;
                        const paramEps = coarseEps / dvts[1].getLength();
                        for (const it of ptsChart) {
                            // 交线是奇异曲线，所有的参数u都相等
                            if (!Util.isNearlyEqual(it.uvPara2.x, singularUParam, paramEps)) {
                                isXCurveOnIsoparamVCurve = false;
                                break;
                            }
                        }
                    } else if (sameV) {
                        const singularVParam = singularParam1.y;
                        const paramEps = coarseEps / dvts[2].getLength();
                        for (const it of ptsChart) {
                            // 交线是奇异曲线，所有的参数v都相等
                            if (!Util.isNearlyEqual(it.uvPara2.y, singularVParam, paramEps)) {
                                isXCurveOnIsoparamVCurve = false;
                                break;
                            }
                        }
                    }

                    if (isXCurveOnIsoparamVCurve) {
                        return; // 如果交线是奇异曲线，不用（也不能）再在相邻的曲面上求交，因此不用再继续找下一个曲面pair
                    }

                    ptConnectPatchs2.push(...cs2.surfPatchs);
                }
            }

            // 曲线往外延伸的方向，也是下一对patch对儿求交的交线切向参考方向
            let curveEndDir: Vec3 | undefined;
            if (i === 0) {
                curveEndDir = ptsChart[0].point.subtracted(ptsChart[1].point);
            } else {
                curveEndDir = ptsChart[ptsChart.length - 1].point.subtracted(ptsChart[ptsChart.length - 2].point);
            }

            if (ptConnectPatchs1.length === 2 && ptConnectPatchs2.length === 0) {
                const anotherPatch1 =
                    thePair.patch1 === ptConnectPatchs1[0] ? ptConnectPatchs1[1] : ptConnectPatchs1[0];
                connectPairs.push({
                    patch1: anotherPatch1,
                    patch2: thePair.patch2,
                    points: [ept.point],
                    dir: curveEndDir,
                    isUsed: false,
                });
            } else if (ptConnectPatchs1.length === 0 && ptConnectPatchs2.length === 2) {
                const anotherPatch2 =
                    thePair.patch2 === ptConnectPatchs2[0] ? ptConnectPatchs2[1] : ptConnectPatchs2[0];
                connectPairs.push({
                    patch1: thePair.patch1,
                    patch2: anotherPatch2,
                    points: [ept.point],
                    dir: curveEndDir,
                    isUsed: false,
                });
            } else if (ptConnectPatchs1.length === 2 && ptConnectPatchs2.length === 2) {
                // 如果两个patch都到达边界，不确定是出了哪个的边界还是两个边界都出了，所以要根据curve末端的方向判断
                const dvts1 = thePair.patch1.surface.getDerivatives(ept.uvPara1, 1);
                const surfOutDir1 = dvts1[2]; // 曲面1出边界的方向。 因为目前直考虑了v向存在奇异点分解的，所以只考虑v向出参数域
                const patch1RangeV = thePair.patch1.rangeUV![1];
                if (Math.abs(ept.uvPara1.y - patch1RangeV.min) < Math.abs(ept.uvPara1.y - patch1RangeV.max)) {
                    surfOutDir1.reverse(); // 如果是patch的起点，则方向reverse
                }
                // curve往外延伸的方向与patch11出曲面的方向相同，则出patch10曲面，下一个进入patch12
                const anotherPatch1 =
                    thePair.patch1 === ptConnectPatchs1[0] ? ptConnectPatchs1[1] : ptConnectPatchs1[0];
                const nextPatch1 = curveEndDir.dot(surfOutDir1) > 0 ? anotherPatch1 : thePair.patch1;

                const dvts2 = thePair.patch2.surface.getDerivatives(ept.uvPara2, 1);
                const surfOutDir2 = dvts2[2]; // 曲面2出边界的方向。 因为目前直考虑了v向存在奇异点分解的，所以只考虑v向出参数域
                const patch2RangeV = thePair.patch2.rangeUV![1];
                if (Math.abs(ept.uvPara2.y - patch2RangeV.min) < Math.abs(ept.uvPara2.y - patch2RangeV.max)) {
                    surfOutDir2.reverse(); // 如果是patch的起点，则方向reverse
                }
                // curve往外延伸的方向与patch21出曲面的方向相同，则出patch10曲面，下一个进入patch22
                const anotherPatch2 =
                    thePair.patch2 === ptConnectPatchs2[0] ? ptConnectPatchs2[1] : ptConnectPatchs2[0];
                const nextPatch2 = curveEndDir.dot(surfOutDir2) > 0 ? anotherPatch2 : thePair.patch2;

                connectPairs.push({
                    patch1: nextPatch1,
                    patch2: nextPatch2,
                    points: [ept.point],
                    dir: curveEndDir,
                    isUsed: false,
                });
            }
        }
    }

    private _spliceIntersectCurves(
        surfInterstRets: IntersectCurve3[],
        firstXPt: Vec3,
        degree: number,
        coarseEps: number,
    ): Curve3 {
        // 后处理：如果出现某两个点步长相对相邻的两个点步长很小，可能是计算有问题，删除其中一个点
        for (const icurv of surfInterstRets) {
            const cvPts = icurv.getIntersectPtsChart();
            if (cvPts.length > 3) {
                let i = 1;
                for (; i < cvPts.length - 1; i++) {
                    const sqrDist = cvPts[i].point.sqDistanceTo(cvPts[i - 1].point);
                    const twoSqrDist = cvPts[i + 1].point.sqDistanceTo(cvPts[i - 1].point);
                    if (sqrDist < twoSqrDist / 10000) {
                        cvPts.splice(i, 1);
                    }
                }

                // 最后一个点和前一个点的处理
                if (cvPts.length > 3) {
                    const lastIndex = cvPts.length - 1;
                    const lastSqrDist = cvPts[lastIndex].point.sqDistanceTo(cvPts[lastIndex - 1].point);
                    const prevSqrDist = cvPts[lastIndex].point.sqDistanceTo(cvPts[lastIndex - 2].point);
                    if (lastSqrDist < prevSqrDist / 10000) {
                        cvPts.splice(lastIndex - 1, 1);
                    }
                }
            }
        }

        // 交线连接合并
        const curvePts: Vec3[] = [];
        for (let i = 1; i < surfInterstRets.length; i++) {
            let addCurve = surfInterstRets[i] as IntersectCurve3;
            if (i === 1) {
                const intersct0 = surfInterstRets[0] as IntersectCurve3;
                const intersct1 = surfInterstRets[1] as IntersectCurve3;
                let origCurve: IntersectCurve3 = intersct0;
                if (intersct0.getIntersectPtsChart().length < intersct1.getIntersectPtsChart().length) {
                    origCurve = intersct1;
                    addCurve = intersct0;
                }

                origCurve.getIntersectPtsChart().map(p => curvePts.push(p.point));
                if (curvePts.length === 2) {
                    const insertPt = origCurve.getInsertPt(0, 0.5);
                    curvePts.splice(1, 0, insertPt);
                }
            }
            this._spliceCurve(curvePts, addCurve, coarseEps);
        }

        // 如果交线是一个周期的曲线，并且不是给定参考点的第一个交点不是周期性交点的起点，则需要处理成第一个点为起点
        if (curvePts[0].equals(curvePts[curvePts.length - 1], coarseEps) && !curvePts[0].equals(firstXPt, coarseEps)) {
            // 找到第一个交点的位置
            const firstPtIndex = curvePts.findIndex(pt => pt.equals(firstXPt, coarseEps));
            if (firstPtIndex > 0) {
                curvePts.pop();
                const prevSegPts = curvePts.slice(0, firstPtIndex);
                curvePts.splice(0, firstPtIndex);
                curvePts.push(...prevSegPts);
                curvePts.push(curvePts[0]);
            }
        }

        const nurbs = NurbsCurve3.makeByInterpolationPts(curvePts, degree);
        return nurbs;
    }

    /**
     * 在intercurve首部或者尾部拼接另一条交线
     * @ curve 用于拼接的曲线 // 目前仅支持直线
     * @ tol 容差
     */
    private _spliceCurve(curvePts: Vec3[], curve: Curve3, lengthEps: number) {
        const origStPt = curvePts[0];
        const origEndPt = curvePts[curvePts.length - 1];
        if (origStPt.sqDistanceTo(origEndPt) < lengthEps * lengthEps) {
            // 不一定是用端点，可能需要计算curve端点距离周期性交线的最近距离点
            MathAssert.warn(true, '未实现：周期性交线拼接曲线！');
            return;
        }

        const curveStPt = curve.getStartPt();
        const curveEndPt = curve.getEndPt();
        const dists: number[] = [];
        dists.push(origStPt.sqDistanceTo(curveStPt));
        dists.push(origStPt.sqDistanceTo(curveEndPt));
        dists.push(origEndPt.sqDistanceTo(curveStPt));
        dists.push(origEndPt.sqDistanceTo(curveEndPt));
        let minNo = 0;
        let minDist = dists[0];
        for (let i = 1; i < 4; i++) {
            if (dists[i] < minDist) {
                minNo = i;
                minDist = dists[i];
            }
        }
        if (minDist > lengthEps) {
            throw new Error('曲线不相连！');
        }

        const lambdas = [0.05, 0.1];
        if (curve.isLine3d()) {
            const lineLength = curve.getLength();
            if (lineLength < lengthEps) {
                return;
            }

            // 与交线起点相接
            if (minNo === 0 || minNo === 1) {
                if (minNo === 0) {
                    curve.reverse(); // 起点起点相接，curve反向使终点与起点相接
                }

                const stPt = curve.getStartPt();
                const endPt = curve.getEndPt();
                const ptInsert0 = stPt.multiplied(lambdas[1]).add(endPt.multiplied(1 - lambdas[1]));
                const ptInsert1 = stPt.multiplied(lambdas[0]).add(endPt.multiplied(1 - lambdas[0]));
                curvePts.splice(0, 0, ...[stPt, ptInsert0, ptInsert1]);
            } else {
                // 与交线终点相接
                if (minNo === 3) {
                    curve.reverse(); // 终点与终点相接，curve反向使起点与终点相接
                }

                const stPt = curve.getStartPt();
                const endPt = curve.getEndPt();
                const ptInsert0 = stPt.multiplied(1 - lambdas[0]).add(endPt.multiplied(lambdas[0]));
                const ptInsert1 = stPt.multiplied(1 - lambdas[1]).add(endPt.multiplied(lambdas[1]));
                curvePts.push(ptInsert0, ptInsert1, endPt);
            }
        } else if (curve instanceof IntersectCurve3) {
            const newPtsChart = curve.getIntersectPtsChart();
            const newCurvePts: Vec3[] = [];
            newPtsChart.map(p => newCurvePts.push(p.point));

            // curve的起点接在this交线上
            if (minNo === 0 || minNo === 2) {
                // 如果是2个点，很可能是直线（也可能是很短的曲线），可能很长，插两个点过渡；
                // 如果是3个点，可能是直线（也可能是曲线），中间一个点不会很远
                if (newCurvePts.length === 2) {
                    const insertPt0 = curve.getInsertPt(0, lambdas[0]);
                    const insertPt1 = curve.getInsertPt(0, lambdas[1]);
                    newCurvePts.splice(0, 1, ...[insertPt0, insertPt1]);
                } else if (newCurvePts.length === 3) {
                    const insertPt0 = curve.getInsertPt(0, lambdas[0]);
                    newCurvePts.splice(0, 1, insertPt0);
                } else {
                    newCurvePts.splice(0, 1);
                }

                if (minNo === 0) {
                    newCurvePts.reverse();
                    curvePts.splice(0, 0, ...newCurvePts);
                } else {
                    curvePts.push(...newCurvePts);
                }
            } else {
                if (newCurvePts.length === 2) {
                    const insertPt0 = curve.getInsertPt(0, 1 - lambdas[1]);
                    const insertPt1 = curve.getInsertPt(0, 1 - lambdas[0]);
                    newCurvePts.pop();
                    newCurvePts.push(insertPt0, insertPt1);
                } else if (newCurvePts.length === 3) {
                    const insertPt0 = curve.getInsertPt(1, lambdas[0]);
                    newCurvePts.pop();
                    newCurvePts.push(insertPt0);
                } else {
                    newCurvePts.pop();
                }

                if (minNo === 1) {
                    curvePts.splice(0, 0, ...newCurvePts);
                } else {
                    newCurvePts.reverse();
                    curvePts.push(...newCurvePts);
                }
            }
        } else {
            throw new Error('');
        }
    }

    private _getOverlapSurfaceIntersection(firstXPt: Vec3): Curve3 | undefined {
        // 先判断处理面重合情况
        for (let i = 0; i < this._surfacePatchs1.length; i++) {
            const patch1 = this._surfacePatchs1[i];
            for (let j = 0; j < this._surfacePatchs2.length; j++) {
                const patch2 = this._surfacePatchs2[j];
                // todo：得到的是某个曲面的奇异曲线，其实还需要根据参数域进行裁剪。但是目前未处理。
                if (SurfacesCoplaner.simple(patch1.surface, patch2.surface, this._tol)) {
                    let singularCurve1: Curve3 | undefined;
                    if (this._surfacePatchs1.length > 1) {
                        if (i === 0) {
                            singularCurve1 = this._singularCurvePatchs1[0].curve;
                        } else if (i === 2) {
                            singularCurve1 = this._singularCurvePatchs1[1].curve;
                        } else if (i === 1) {
                            const dist0 = PtToCurve3Distance.execute(firstXPt, this._singularCurvePatchs1[0].curve);
                            const dist1 = PtToCurve3Distance.execute(firstXPt, this._singularCurvePatchs1[1].curve);
                            singularCurve1 =
                                dist0.distance < dist1.distance
                                    ? this._singularCurvePatchs1[0].curve
                                    : this._singularCurvePatchs1[1].curve;
                        }
                    }

                    let singularCurve2: Curve3 | undefined;
                    if (this._surfacePatchs2.length > 1) {
                        if (j === 0) {
                            singularCurve2 = this._singularCurvePatchs2[0].curve;
                        } else if (j === 2) {
                            singularCurve2 = this._singularCurvePatchs2[1].curve;
                        } else if (j === 1) {
                            const dist0 = PtToCurve3Distance.execute(firstXPt, this._singularCurvePatchs2[0].curve);
                            const dist1 = PtToCurve3Distance.execute(firstXPt, this._singularCurvePatchs2[1].curve);
                            singularCurve1 =
                                dist0.distance < dist1.distance
                                    ? this._singularCurvePatchs2[0].curve
                                    : this._singularCurvePatchs2[1].curve;
                        }
                    }

                    if (singularCurve1 && !singularCurve2) {
                        return singularCurve1;
                    }
                    if (!singularCurve1 && singularCurve2) {
                        return singularCurve2;
                    }

                    // ！注意：这个地方方案可能有点问题。
                    // 方案1. 如果两个nurbs扫掠曲面存在部分重合（扫掠path曲线nurbs部分重合），如果判断为SurfaceSurfaceCoplaner，计算出两条奇异曲线，
                    // 但是奇异曲线只有部分重合，要将奇异曲线分段算作交线？再怎么连接？（从重合段末端点开始迭代逐个求交点）实现比较麻烦
                    // 方案2. 但是如果两个nurbs扫掠曲面存在完全重合，计算出两条奇异曲线，两条奇异曲线也会是完全共线（不考虑参数域），计算奇异曲线和曲面重合的部分返回。
                    // 不该用两个奇异曲线计算curvesOverlap返回重合部分，有可能奇异曲线不重合，应该用奇异曲线和曲面边界求交，利用交点裁剪奇异曲线，返回。
                    // 但是方案2有一个问题，就是曲面只存在部分重合时，计算会走迭代求交流程，而在部分重合位置，迭代求交会失效。由于目前没有部分重合的曲面，所以目前采用方案2.

                    // 两个曲面都是分解得到的，都有奇异曲线，其中必有一条是公共交线。选取哪一条？
                    if (singularCurve1 && singularCurve2) {
                        const stPt1 = singularCurve1.getStartPt();
                        const endPt1 = singularCurve1.getEndPt();
                        // 如果第二个曲面包含第一个曲线的起点或终点，认为奇异曲线1在曲面2上
                        const surf2ContainCv1StPt = this._surface2.containsPt(stPt1);
                        const surf2ContainCv1EndPt = this._surface2.containsPt(endPt1);
                        if (surf2ContainCv1StPt || surf2ContainCv1EndPt) {
                            if (surf2ContainCv1StPt && surf2ContainCv1EndPt) {
                                return singularCurve1;
                            }
                            const surf2RangeU = this._surface2.getDomainU();
                            if (surf2ContainCv1StPt) {
                                const isoCvMax = this._surface2.getIsoCurve(surf2RangeU.max, false);
                                const xPtInfo1 = X.curve3ds(isoCvMax, singularCurve1);
                                if (xPtInfo1) {
                                    MathAssert.warn(xPtInfo1.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve1.getRange().max = xPtInfo1[0].param2;
                                    return singularCurve1;
                                }

                                const isoCvMin = this._surface2.getIsoCurve(surf2RangeU.min, false);
                                const xPtInfo2 = X.curve3ds(isoCvMin, singularCurve1);
                                if (xPtInfo2) {
                                    MathAssert.warn(xPtInfo2.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve1.getRange().max = xPtInfo2[0].param2;
                                    return singularCurve1;
                                }
                                MathAssert.warn(false, '奇异曲线交点个数错误');
                            } else {
                                const isoCvMin = this._surface2.getIsoCurve(surf2RangeU.min, false);
                                const xPtInfo2 = X.curve3ds(isoCvMin, singularCurve1);
                                if (xPtInfo2) {
                                    MathAssert.warn(xPtInfo2.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve1.getRange().min = xPtInfo2[0].param2;
                                    return singularCurve1;
                                }

                                const isoCvMax = this._surface2.getIsoCurve(surf2RangeU.max, false);
                                const xPtInfo1 = X.curve3ds(isoCvMax, singularCurve1);
                                if (xPtInfo1) {
                                    MathAssert.warn(xPtInfo1.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve1.getRange().min = xPtInfo1[0].param2;
                                    return singularCurve1;
                                }

                                MathAssert.warn(false, '奇异曲线交点个数错误');
                            }
                            return singularCurve1;
                        }

                        const stPt2 = singularCurve2.getStartPt();
                        const endPt2 = singularCurve2.getEndPt();
                        const surf1ContainCv2StPt = this._surface1.containsPt(stPt2);
                        const surf1ContainCv2EndPt = this._surface1.containsPt(endPt2);
                        if (surf1ContainCv2StPt || surf1ContainCv2EndPt) {
                            if (surf1ContainCv2StPt && surf1ContainCv2EndPt) {
                                return singularCurve2;
                            }

                            const surf1RangeU = this._surface1.getDomainU();
                            if (surf2ContainCv1StPt) {
                                const isoCvMax = this._surface1.getIsoCurve(surf1RangeU.max, false);
                                const xPtInfo1 = X.curve3ds(isoCvMax, singularCurve2);
                                if (xPtInfo1) {
                                    MathAssert.warn(xPtInfo1.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve2.getRange().max = xPtInfo1[0].param2;
                                    return singularCurve2;
                                }

                                const isoCvMin = this._surface1.getIsoCurve(surf1RangeU.min, false);
                                const xPtInfo2 = X.curve3ds(isoCvMin, singularCurve1);
                                if (xPtInfo2) {
                                    MathAssert.warn(xPtInfo2.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve2.getRange().max = xPtInfo2[0].param2;
                                    return singularCurve2;
                                }
                                MathAssert.warn(false, '奇异曲线交点个数错误');
                            } else {
                                const isoCvMin = this._surface1.getIsoCurve(surf1RangeU.min, false);
                                const xPtInfo2 = X.curve3ds(isoCvMin, singularCurve1);
                                if (xPtInfo2) {
                                    MathAssert.warn(xPtInfo2.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve2.getRange().min = xPtInfo2[0].param2;
                                    return singularCurve2;
                                }

                                const isoCvMax = this._surface1.getIsoCurve(surf1RangeU.max, false);
                                const xPtInfo1 = X.curve3ds(isoCvMax, singularCurve2);
                                if (xPtInfo1) {
                                    MathAssert.warn(xPtInfo1.length > 1, '奇异曲线交点个数大于1');
                                    singularCurve2.getRange().min = xPtInfo1[0].param2;
                                    return singularCurve2;
                                }

                                MathAssert.warn(false, '奇异曲线交点个数错误');
                            }
                            return singularCurve2;
                        }

                        // 奇异曲线起点和终点都在曲面外，用奇异曲线和曲面上下边界求交
                        const rangeArr: number[] = [];
                        const surf1RangeU = this._surface1.getDomainU().toArray();
                        for (const u of surf1RangeU) {
                            const isoCv = this._surface1.getIsoCurve(u, false);
                            const xPtInfo = X.curve3ds(isoCv, singularCurve2);
                            if (xPtInfo) {
                                MathAssert.warn(xPtInfo.length > 1, '奇异曲线交点个数大于1');
                                rangeArr.push(xPtInfo[0].param2);
                            }
                        }
                        if (rangeArr.length > 0) {
                            if (rangeArr.length === 2) {
                                if (rangeArr[0] > rangeArr[1]) {
                                    [rangeArr[0], rangeArr[1]] = [rangeArr[1], rangeArr[0]];
                                }
                                singularCurve2.setRange(rangeArr[0], rangeArr[1]);
                            } else {
                                MathAssert.warn(rangeArr.length === 2, '奇异曲线交点个数错误');
                                // 需要额外处理？？
                            }

                            return singularCurve2;
                        }

                        const rangeArr2: number[] = [];
                        const surf2RangeU = this._surface2.getDomainU().toArray();
                        for (const u of surf2RangeU) {
                            const isoCv = this._surface2.getIsoCurve(u, false);
                            const xPtInfo = X.curve3ds(isoCv, singularCurve1);
                            if (xPtInfo) {
                                MathAssert.warn(xPtInfo.length > 1, '奇异曲线交点个数大于1');
                                rangeArr2.push(xPtInfo[0].param2);
                            }
                        }
                        if (rangeArr2.length > 0) {
                            if (rangeArr2.length === 2) {
                                if (rangeArr2[0] > rangeArr2[1]) {
                                    [rangeArr2[0], rangeArr2[1]] = [rangeArr2[1], rangeArr2[0]];
                                }
                                singularCurve1.setRange(rangeArr2[0], rangeArr2[1]);
                            } else {
                                MathAssert.warn(rangeArr2.length === 2, '奇异曲线交点个数错误');
                                // 需要额外处理？？
                            }

                            return singularCurve1;
                        }

                        return undefined;
                    }
                }
            }
        }

        return undefined;
    }
}