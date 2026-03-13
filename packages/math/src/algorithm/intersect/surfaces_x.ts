import { Surface } from '../../geometry/surface';
import { Interval } from '../../base/interval';
import { D } from '../calc_d';
import { Tol } from '../../base/tol';
import { CONST } from '../../type_define/const';
import { Vec3 } from '../../base/vec3';
import { SurfacesXUtil } from './surfaces_x_util';
import { ISurfacesXInfo } from './x_info';
import { Curve3 } from '../../geometry/curve3d';
import { IntersectCurve3 } from '../../geometry/intersect_curve3';
import { SurfacesXSpecial } from './surfaces_x_special';
import { SurfacesXComplex } from './surfaces_x_complex';
import { SurfacesCoplaner } from '../overlap/surfaces_coplaner';
import { MathAssert } from '../../util/assert';
import { types } from '../../type_define/i_types';
import { Util } from '../../util/util';
import { SurfaceSelfX } from './surface_self_x';
import { PeriodInterval } from '../../base/period_inverval';



/**
 * Surface 与 Surface求交，返回值为交线：平面+平面，平面+圆柱，平面+圆锥，平面+通用曲面；圆柱+圆柱，圆柱+圆锥；圆锥+圆锥；通用曲面+通用曲面；
 */
class SurfacesX {
    /**
     * 计算返回所有的交（交线、交点、重合面（未实现））
     * 曲面与曲面相交为交线
     * @param surface 曲面
     * @param surface 曲面
     * @returns 交线可能不止一条，故返回交线的数组
     */
    public static allIntersections(
        surface1: Surface,
        surface2: Surface,
        rangeU1?: Interval,
        rangeV1?: Interval,
        rangeU2?: Interval,
        rangeV2?: Interval,
        tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): ISurfacesXInfo[] {
        if (this._isComplexSurface(surface1) || this._isComplexSurface(surface2)) {
            return new SurfacesXComplex(surface1, surface2, tol).allIntersects();
        }

        const intResult = SurfacesXSpecial.execute(surface1, surface2, tol);
        if (intResult !== undefined) {
            return intResult;
        }

        const surfIntUtil = new SurfacesXUtil(surface1, surface2, tol);
        return surfIntUtil.calAllIntersects(rangeU1, rangeV1, rangeU2, rangeV2, useHighPrecision);
    }

    /**
     * 计算返回一条（离给定参考点最近的）交线
     * 曲面与曲面相交为交线
     * @param surface 曲面
     * @param surface 曲面
     * @param refPoint 距离交线很近的参考点
     * @returns 只返回一条交线，如果没有交返回空
     */
    public static singleCurveBetweenTwoPoints(
        surf1: Surface,
        surf2: Surface,
        point1: Vec3,
        point2: Vec3,
        refDir?: Vec3,
        tol: Tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        // 1. 先几何法或解析法计算所有的交，选一个最近的
        const intResults = SurfacesXSpecial.execute(surf1, surf2, tol);
        if (intResults !== undefined) {
            const intCurves: Curve3[] = [];
            for (const iRes of intResults) {
                if (iRes.curve) {
                    intCurves.push(iRes.curve);
                }
            }

            const xCurve = this.getNearstCurve(intCurves, point1, refDir);
            if (!xCurve) {
                return undefined;
            }

            const stParam = xCurve.getParamAt(point1);
            const tangent = xCurve.getTangentAt(stParam);
            if (refDir && tangent.dot(refDir) < 0) {
                xCurve.reverse();
            }

            let endParam = xCurve.getParamAt(point2);
            if (!xCurve.isPeriodic()) {
                if (stParam > endParam) {
                    xCurve.setRange(endParam, stParam);
                } else {
                    xCurve.setRange(stParam, endParam);
                }
                return xCurve;
            }

            const period = (xCurve.getRange() as PeriodInterval).period;
            if (Util.isNearlySmallerOrEqual(endParam, stParam, tol.numberEps)) {
                endParam += period;
            }
            xCurve.setRange(stParam, endParam);
            return xCurve;
        }

        // 2. 无法用几何法或解析法计算交线，用迭代方法计算一条交线返回
        // 先判断重合
        if (SurfacesCoplaner.simple(surf1, surf2, tol)) {
            MathAssert.warn('简单曲面重合，没有单条交线！');
            return undefined;
        }

        const surfIntUtil = new SurfacesXUtil(surf1, surf2, tol);
        const intResult = surfIntUtil.calSingleIntersect(point1, refDir, useHighPrecision);
        if (intResult === undefined || intResult.curve === undefined) {
            return undefined;
        }

        const degree = useHighPrecision ? 3 : 2;
        const nurbs = (intResult.curve as IntersectCurve3).toNurbsBetweenPoints(degree, point1, point2, refDir);
        return nurbs;
    }

    /**
     * 计算返回一条（离给定参考点最近的）交线
     * 曲面与曲面相交为交线
     * @param surface 曲面
     * @param surface 曲面
     * @param refPoint 距离交线很近的参考点
     * @returns 只返回一条交线，如果没有交返回空
     */
    public static singleCurveNearPointSimple(
        surf1: Surface,
        surf2: Surface,
        refPoint: Vec3,
        refDir?: Vec3,
        tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        // 1. 先几何法或解析法计算所有的交，选一个最近的
        const intResults = SurfacesXSpecial.execute(surf1, surf2, tol);
        if (intResults !== undefined) {
            const intCurves: Curve3[] = [];
            for (const iRes of intResults) {
                if (iRes.curve) {
                    intCurves.push(iRes.curve);
                }
            }

            return this.getNearstCurve(intCurves, refPoint, refDir);
        }

        // 2. 无法用几何法或解析法计算交线，用迭代方法计算一条交线返回
        // 先判断重合
        if (SurfacesCoplaner.simple(surf1, surf2, tol)) {
            MathAssert.warn('简单曲面重合，没有单条交线！');
            return undefined;
        }

        return this._singleCurveNearPoint(surf1, surf2, refPoint, refDir, tol, useHighPrecision);
    }

    /**
     * 计算返回一条（离给定参考点最近的）交线.如果convertNurbs=false，返回的曲线类型可能为intersectCurve3d，不建议外部使用，算法库内部使用
     * 曲面与曲面相交为交线
     * @param surface 曲面
     * @param surface 曲面
     * @param refPoint 距离交线很近的参考点
     * @returns 只返回一条交线，如果没有交返回空
     */
    public static singleCurveNearPoint(
        surf1: Surface,
        surf2: Surface,
        refPoint: Vec3,
        refDir?: Vec3,
        tol = Tol.DEFAULT,
        useHighPrecision = false,
        convertNurbs = true,
    ): Curve3 | undefined {
        // 1. 先几何法或解析法计算所有的交，选一个最近的
        const intResults = SurfacesXSpecial.execute(surf1, surf2, tol);
        if (intResults !== undefined) {
            const intCurves: Curve3[] = [];
            for (const iRes of intResults) {
                if (iRes.curve) {
                    intCurves.push(iRes.curve);
                }
            }

            return this.getNearstCurve(intCurves, refPoint, refDir);
        }

        // 2. 无法用几何法或解析法计算交线，用迭代方法计算一条交线返回
        if (this._isComplexSurface(surf1) || this._isComplexSurface(surf2)) {
            const surfInt = new SurfacesXComplex(surf1, surf2, tol);
            const xCurve = surfInt.singleIntersectCurve(refPoint, refDir, useHighPrecision);
            if (xCurve) {
                return xCurve;
            }

            // 对于nurbs的extendCurve的sweepSurface，奇异曲线是交线，但是重合判断失败，求交交点在奇异曲线两边飘，导致求交会失败
            // 没什么好的处理方法，最后补救一下，不分片求交
            return this._singleCurveNearPoint(surf1, surf2, refPoint, refDir, tol, useHighPrecision, convertNurbs);
        }

        // 先判断重合
        if (SurfacesCoplaner.simple(surf1, surf2, tol)) {
            MathAssert.warn('简单曲面重合，没有单条交线！');
            return undefined;
        }

        return this._singleCurveNearPoint(surf1, surf2, refPoint, refDir, tol, useHighPrecision, convertNurbs);
    }

    // public static selfIntersectCurves(
    //     surf: Surface,
    //     refUV1: types.IXY,
    //     refUV2: types.IXY,
    //     refDir?: Vec3,
    //     tol = Tol.DEFAULT,
    //     useHighPrecision = false,
    // ): Curve3[] {

    // }

    public static selfIntersectCurve(
        surf: Surface,
        refUV1: types.IXY,
        refUV2: types.IXY,
        refDir?: Vec3,
        tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        const selfXRes = SurfaceSelfX.singleIntersectCurve(surf, refUV1, refUV2, refDir, tol, useHighPrecision);
        if (selfXRes) {
            return selfXRes;
        }

        return this.singleCurveNearParam(surf, surf, refUV1, refUV2, refDir, tol, useHighPrecision);
    }

    public static singleCurveNearParam(
        surf1: Surface,
        surf2: Surface,
        refUV1: types.IXY,
        refUV2: types.IXY,
        refDir?: Vec3,
        tol = Tol.DEFAULT,
        useHighPrecision = false,
    ): Curve3 | undefined {
        const surfIntUtil = new SurfacesXUtil(surf1, surf2, tol);
        const intResult = surfIntUtil.calSingleSelfIntersect(refUV1, refUV2, refDir, useHighPrecision);
        if (intResult) {
            const intCurve = intResult.curve as IntersectCurve3;
            // return intCurve;
            const degree = 3;
            const intNurbs = intCurve.toSimpleCurve3d(degree);
            return intNurbs;
        }

        return undefined;
    }

    public static getNearstCurve(intCurves: Curve3[], refPoint: Vec3, refDir?: Vec3): Curve3 | undefined {
        if (intCurves.length < 1) {
            return undefined;
        }
        if (intCurves.length === 1) {
            return intCurves[0];
        }

        // 找到距离最小的curve，如果有多个距离最小的curve，都记录下来，然后比较与refDir的夹角
        let minDistIndexes: number[] = [];
        let minDis = CONST.MODEL_MAX_LENGTH;
        for (let i = 0; i < intCurves.length; i++) {
            const dis = D.ptToCurve3d(refPoint, intCurves[i]);
            if (Util.isNearlySmaller(dis, minDis)) {
                minDistIndexes = [i];
                minDis = dis;
            } else if (Util.isNearlyEqual(dis, minDis)) {
                minDistIndexes.push(i);
            }
        }

        if (minDistIndexes.length === 1 || refDir === undefined) {
            return intCurves[minDistIndexes[0]];
        }

        let minAngleIndex: number = minDistIndexes[0];
        let minAngle = CONST.PI;
        for (const index of minDistIndexes) {
            const param = intCurves[index].getParamAt(refPoint);
            const tangent = intCurves[index].getTangentAt(param);
            let angle = refDir.angle(tangent);
            angle = angle > CONST.PI_2 - Tol.ANGLE ? CONST.PI - angle : angle;
            if (angle < minAngle) {
                minAngleIndex = index;
                minAngle = angle;
            }
        }

        return intCurves[minAngleIndex];
    }

    private static _isComplexSurface(surf: Surface) {
        return false;
    }

    private static _singleCurveNearPoint(
        surf1: Surface,
        surf2: Surface,
        refPoint: Vec3,
        refDir?: Vec3,
        tol?: Tol,
        useHighPrecision?: boolean,
        convertNurbs = true,
    ): Curve3 | undefined {
        const surfIntUtil = new SurfacesXUtil(surf1, surf2, tol);
        const intResult = surfIntUtil.calSingleIntersect(refPoint, refDir, useHighPrecision);
        if (intResult) {
            if (!convertNurbs) {
                return intResult.curve;
            }

            const intCurve = intResult.curve as IntersectCurve3;
            // return intCurve;
            const degree = useHighPrecision ? 3 : 2;
            const intNurbs = intCurve.toSimpleCurve3d(degree);
            return intNurbs;
        }

        // const isoXCv = this._getIsoCurveIntersect(surf1, surf2, refPoint, tol);
        // if (isoXCv) {
        //     return isoXCv;
        // }
        return undefined;
    }

    // private static _getIsoCurveIntersect(
    //     surf1: Surface,
    //     surf2: Surface,
    //     refPoint: Vec3,
    //     tol: Tol = new Tol(),
    // ): Curve3 | undefined {
    //     const surfIntUtil = new SurfacesXUtil(surf1, surf2, tol);
    //     const fisrtPtInfo = surfIntUtil.findSurfaceIntersectPoint(refPoint);
    //     if (!fisrtPtInfo) {
    //         return undefined;
    //     }

    //     const uIsoCv1 = surf1.getIsoCurve(fisrtPtInfo.uvPara1.x, false);
    //     const vIsoCv1 = surf1.getIsoCurve(fisrtPtInfo.uvPara1.y, true);

    //     const uIsoCv2 = surf2.getIsoCurve(fisrtPtInfo.uvPara2.x, false);
    //     const vIsoCv2 = surf2.getIsoCurve(fisrtPtInfo.uvPara2.y, true);
    //     if (
    //         CalcOverlap.curve3ds(uIsoCv1, uIsoCv2, tol).length > 0 ||
    //         CalcOverlap.curve3ds(uIsoCv1, vIsoCv2, tol).length > 0
    //     ) {
    //         // todo：还需要找重合段
    //         return uIsoCv1;
    //     }
    //     if (
    //         CalcOverlap.curve3ds(vIsoCv1, uIsoCv2, tol).length > 0 ||
    //         CalcOverlap.curve3ds(vIsoCv1, vIsoCv2, tol).length > 0
    //     ) {
    //         return vIsoCv1;
    //         // todo：还需要找重合段
    //     }

    //     return undefined;
    // }
}

export { SurfacesX };