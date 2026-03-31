import { Surface } from './surface';
import { Vec3 } from '../base/vec3';
import { NurbsCurve3 } from './nurbs_curve3';
import { Curve3 } from './curve3d';
import { Box3 } from '../base/box3';
import { types } from '../type_define/i_types';
import { Interval } from '../base/interval';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { ISurfaceSurfaceIntersectPointInfo } from '../algorithm/intersect/x_info';
import { Tol } from '../base/tol';
import { QuadraticEquation } from '../solve_equations/quadratic_equation';
import { MathAssert } from '../util/assert';
import { LinearSystem } from '../solve_equations/linear_system';
import { CONST } from '../type_define/const';
import { Ln3 } from './ln3';
import { threeSurfacesIteration, surfaceSurfaceIteration } from '../algorithm/calculate_util/iterative_method';
import { Plane } from './plane';
import { geom } from '../verb/verb';

/**
 * ****************************内部使用，用于计算中间形式表达，不让外部使用*****************************
 */
export class IntersectCurve3 extends Curve3 {
    private _surface!: Surface[];

    private _ptsChart!: ISurfaceSurfaceIntersectPointInfo[];

    private _knots!: number[];

    private _domain!: Interval;

    constructor();

    constructor(surface: Surface[], intPts?: ISurfaceSurfaceIntersectPointInfo[]);

    constructor(surface?: Surface[], intPts?: ISurfaceSurfaceIntersectPointInfo[]) {
        super();
        if (surface && surface.length >= 2) {
            this._surface = surface;
            const knots: number[] = [0];
            if (intPts) {
                this._ptsChart = intPts;
                let length: number = 0;
                for (let i = 1; i < this._ptsChart.length; i++) {
                    length += this._ptsChart[i].point.distanceTo(this._ptsChart[i - 1].point);
                    knots.push(length);
                }
                this._domain = new Interval(0, length);
            } else {
                this._ptsChart = [];
                knots.push(0);
                this._domain = new Interval(0, 0);
            }
            this._knots = knots;
            this._range = this._domain;
        }
    }

    public toVerbNurbs(range?: Interval): geom.NurbsCurve {
        throw new Error('Method not implemented.');
    }

    public updateKonts() {
        let length: number = 0;
        const knots: number[] = [0];
        for (let i = 1; i < this._ptsChart.length; i++) {
            length += this._ptsChart[i].point.distanceTo(this._ptsChart[i - 1].point);
            knots.push(length);
        }
        this._knots = knots;
        this._domain = new Interval(0, length);
        this._range = this._domain;
    }

    public getAllPoints(): Vec3[] {
        return this._ptsChart.map(info => info.point);
    }

    public getIntersectPtsChart(): ISurfaceSurfaceIntersectPointInfo[] {
        return this._ptsChart;
    }

    public getDomain() {
        return this._domain;
    }

    /**
     * 判断该曲线是否为周期曲线
     */
    public isPeriodic(): boolean {
        if (this._ptsChart.length > 1 && this.getStartPt().equals(this.getEndPt())) {
            return true;
        }

        return false;
    }

    /**
     * 获取曲线起点
     */
    public getStartPt(): Vec3 {
        return this._ptsChart[0].point;
    }

    /**
     * 获取曲线末点
     */
    public getEndPt(): Vec3 {
        return this._ptsChart[this._ptsChart.length - 1].point;
    }

    public getPtAt(param: number): Vec3 {
        if (!this._domain.containsPt(param)) {
            throw new Error('parameter out domain!');
        }

        return this.getIntersectPtInfoAt(param).point;
    }

    public getIntersectPtInfoAt(param: number): ISurfaceSurfaceIntersectPointInfo {
        if (!this._domain.containsPt(param)) {
            throw new Error('parameter out domain!');
        }

        if (Math.abs(param) <= Tol.LENGTH) {
            return this._ptsChart[0];
        }
        if (Math.abs(param - this._range.max) <= Tol.LENGTH) {
            return this._ptsChart[this._ptsChart.length - 1];
        }

        let param1: number = 0;
        let param2: number = 0;
        let rangeIndex = 0;
        for (let i = 1; i < this._ptsChart.length; i++) {
            param1 = param2;
            param2 += this._ptsChart[i].point.distanceTo(this._ptsChart[i - 1].point);
            if (Math.abs(param - param2) <= Tol.LENGTH) {
                return this._ptsChart[i];
            }

            if (param < param2) {
                rangeIndex = i - 1;
                break;
            }
        }

        const refPt1 = this._ptsChart[rangeIndex];
        const refPt2 = this._ptsChart[rangeIndex + 1];
        const t = (param - param1) / (param2 - param1); // 参数在这两个点之间的比例参数

        const ptInfo = this._getInsertPt(refPt1, refPt2, t);
        if (ptInfo === undefined) {
            throw new Error('计算失败!');
        }
        return ptInfo;
    }

    /**
     * 计算曲线在给定参数区间的包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box3 {
        throw new Error('unimplemented');
    }

    public getTangentAt(t: number, useDefaultSnap = true): Vec3 {
        const intersectInfo = this.getIntersectPtInfoAt(t);
        const dts = this.getDerivativesAtPt(intersectInfo, 1, useDefaultSnap);
        return dts[1].normalized();
    }

    /**
     *  获取某点对应的参数，如果点在曲线外，离得比较远，可能会出问题
     */
    public getParamAt(point: types.IXYZ): number {
        // 曲线上的点反求参数，根据参数的定义，弦长参数化的交线，t是(param - param1) / (param2 - param1)
        const uv1 = this._surface[0].getUVAt(point);
        const uv2 = this._surface[1].getUVAt(point);
        if (
            this._surface[0].getPtAt(uv1).sqDistanceTo(point) < Tol.LENGTH_2 &&
            this._surface[1].getPtAt(uv2).sqDistanceTo(point) < Tol.LENGTH_2
        ) {
            const params: number[] = [];
            for (let i = 0; i < this._ptsChart.length - 1; i++) {
                const chordSqrlength = this._ptsChart[i + 1].point.sqDistanceTo(this._ptsChart[i].point);
                const dist1 = this._ptsChart[i].point.sqDistanceTo(point);
                const dist2 = this._ptsChart[i + 1].point.sqDistanceTo(point);
                if (dist1 < chordSqrlength && dist2 < chordSqrlength) {
                    const pt1 = this._ptsChart[i].point;
                    const pt2 = this._ptsChart[i + 1].point;

                    const line = new Ln3(pt1, pt2);
                    const localT = line.getParamAt(point);
                    params.push(this._knots[i] + localT);
                }
            }

            if (params.length === 1) {
                const ptInfo = this.getIntersectPtInfoAt(params[0]);
                if (ptInfo.point.sqDistanceTo(point) < Tol.LENGTH_2) {
                    return params[0];
                }

                // 两个曲面近似相切的时候，点在两个曲面上的距离都很近，但是点不在交线上，导致反求参数的点和原来的不是同一个点
                const dvts = this.getDerivativesAtPt(ptInfo, 1);
                const tangent = dvts[1].normalized();
                if (Math.abs(tangent.dot(ptInfo.point.subtracted(point).normalized())) < Tol.ANGLE) {
                    return params[0];
                }

                throw new Error('反求参数失败');
            }

            for (const param of params) {
                const pt = this.getPtAt(param);
                if (pt.sqDistanceTo(point) < Tol.LENGTH_2) {
                    return param;
                }
            }
        }

        // 点不在曲线上时，反求参数很麻烦。找几个备选参数区间，迭代找垂足点
        const distIndexMap: { dist: number; index: number }[] = [];
        for (let i = 0; i < this._ptsChart.length - 1; i++) {
            const chordSqrlength = this._ptsChart[i + 1].point.sqDistanceTo(this._ptsChart[i].point);
            const dist1 = this._ptsChart[i].point.sqDistanceTo(point);
            const dist2 = this._ptsChart[i + 1].point.sqDistanceTo(point);
            // const midPt = this._ptsChart[i + 1].point.midTo(this._ptsChart[i].point);
            // const midDist = midPt.sqDistanceTo(point);
            const minSqrDist = dist1 <= dist2 ? dist1 : dist2;
            if (minSqrDist < chordSqrlength) {
                distIndexMap.push({ dist: minSqrDist, index: i });
            }
        }

        const params: number[] = [];
        for (const iter of distIndexMap) {
            const midParam = (this._knots[iter.index] + this._knots[iter.index + 1]) / 2;
            // 计算切向，垂足点的参数。func = tangent * (pt - pt0)
            const resultParam = this.getFootByIterate(point, midParam);
            if (resultParam !== undefined) {
                params.push(resultParam);
            }
        }

        if (params.length === 0) {
            throw new Error('反求参数失败');
        } else if (params.length === 1) {
            return params[0];
        }

        let minDistParam = params[0];
        let minDist = CONST.MAX_INTEGER;
        for (const t of params) {
            const cvPt = this.getPtAt(t);
            const tmpDist = cvPt.sqDistanceTo(point);
            if (tmpDist < minDist) {
                minDist = tmpDist;
                minDistParam = t;
            }
        }
        return minDistParam;
    }

    // 找到节点属于哪一段参数域（knot[i]～knot[i+1]）的范围，返回knot的节点索引
    public getKontIndex(point: types.IXYZ): number {
        if (this._ptsChart.length < 1) {
            throw new Error('invalid IntersectCurve!');
        }

        let minDistIndex = 0;
        let minSqrDist = this._ptsChart[0].point.sqDistanceTo(point);
        for (let i = 1; i < this._ptsChart.length; i++) {
            const line = new Ln3(this._ptsChart[i - 1].point, this._ptsChart[i].point);
            const t = line.getParamAt(point);
            const range = line.getRange();
            if (range.containsPt(t, Tol.LENGTH)) {
                const dist = line.getPtAt(t).sqDistanceTo(point);
                if (dist < line.getRange().getLength() * 0.005) {
                    // 如果满足此条件，点在交线曲线上，返回区间段
                    return i - 1; // 角度pi / 16，拱高/半弦长 = 0.00171347；角度pi / 16，拱高/半弦长 = 0.003426959
                }
            }

            const sqrDist = this._ptsChart[i].point.sqDistanceTo(point);
            if (sqrDist < minSqrDist) {
                minDistIndex = i;
                minSqrDist = sqrDist;
            }
        }

        // 不在交线上的点，去最近距离点，比较判断在前一段还是后一段直线参数域上，如果都不在，则就取minDistIndex
        if (minDistIndex === 0) {
            const line = new Ln3(this._ptsChart[minDistIndex].point, this._ptsChart[minDistIndex + 1].point);
            const t = line.getParamAt(point);
            const range = line.getRange();
            if (t > range.min - Tol.LENGTH) {
                return minDistIndex;
            }
            return minDistIndex - 1;
        }
        if (minDistIndex > 0) {
            const preLine = new Ln3(this._ptsChart[minDistIndex - 1].point, this._ptsChart[minDistIndex].point);
            const t = preLine.getParamAt(point);
            const range = preLine.getRange();
            if (t > range.max + Tol.LENGTH) {
                return minDistIndex;
            }
            return minDistIndex - 1;
        }

        return minDistIndex;
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, n: number): Vec3[] {
        throw new Error('未实现！');
    }

    // // 可计算奇异点偏导数
    // public getDerivativesPlusAtPt(
    //     intersctPtInfo: ISurfaceSurfaceIntersectPointInfo,
    //     disturbDirSign: number,
    //     nth: number,
    // ): Vec3[] {
    //     const paraTol = Tol.LENGTH;
    //     // 在奇异点扰动uv参数，会修改intsctPtInfo的uv参数，所以使用前需要复制一份
    //     const uvParaDisturb = (uvPara: types.IXY) => {
    //         const tinyStep = 2 * paraTol * disturbDirSign;
    //         const newX = tinyStep + uvPara.x;
    //         const newY = tinyStep + uvPara.y;
    //         return { x: newX, y: newY };
    //     };

    //     if (intersctPtInfo.isSingularity) {
    //         const intPtInfoClone: ISurfaceSurfaceIntersectPointInfo = { ...intersctPtInfo };
    //         intPtInfoClone.uvPara1 = uvParaDisturb(intPtInfoClone.uvPara1);
    //         intPtInfoClone.uvPara2 = uvParaDisturb(intPtInfoClone.uvPara2);
    //         return this.getDerivativesAtPt(intPtInfoClone, nth);
    //     }

    //     const intCurvDvts = this.getDerivativesAtPt(intersctPtInfo, nth);
    //     return intCurvDvts;
    // }

    /*
     * 注意：pt必须是交线上的点
     * 获取某参数t处的n阶导数(弧长参数化)，例如 n = 2 时，会返回曲线在参数t处的坐标、1阶导、2阶导
     * @param t 参数
     * @param n 需要计算的导数的最大阶数
     * @param useDefaultSnap 在奇异点处，二阶不连续，默认根据计算的曲线切向，判断吸附到前一片曲面的末尾，还是当前曲面的开始
     * @param refDir 用于计算切向，建议给定参考方向，参考方向可以由当前交点与前一交点连线确定 // 如果不给参考方向，在过奇异点后计算的自然切向会突变，与之前切向相反，出现错误
     */
    public getDerivativesAtPt(
        intersectPtInfo: ISurfaceSurfaceIntersectPointInfo,
        nth: number,
        useDefaultSnap = true,
        refDir?: Vec3,
    ): Vec3[] {
        const dvts: Vec3[] = [];
        dvts.push(intersectPtInfo.point);

        const surf1 = this._surface[0];
        const surf2 = this._surface[1];
        if (nth >= 1) {
            // calculate Tangent
            const surfNormal1 = surf1.getNormAt(intersectPtInfo.uvPara1).normalized();
            const surfNormal2 = surf2.getNormAt(intersectPtInfo.uvPara2).normalized();
            const tangent = surfNormal1.cross(surfNormal2);

            const angleEps2 = Tol.ANGLE * Tol.ANGLE * 10000;
            if (tangent.getSqLength() < angleEps2) {
                // 法向平行，特殊方法计算Derivatives
                const ret = this._getDerivativesAtTangentialPoint(intersectPtInfo, nth, useDefaultSnap, refDir);
                MathAssert.warn(ret.length !== nth, 'intersectCurve: getDerivativesAtTangentialPoint计算失败！');
                return ret;
            }

            // 如果计算的切向与参考的切向相反，说明计算方向错误，需要反向
            const tangentVect = tangent.normalized();
            if (refDir !== undefined && refDir.dot(tangentVect) < 0) {
                tangentVect.reverse();
            }
            dvts.push(tangentVect);

            if (nth >= 2) {
                // calculate Curvature
                const cosTheta = surfNormal1.dot(surfNormal2);
                const sinThetaSqr = 1 - cosTheta * cosTheta;

                const calCurvature = (pts: Vec3[], surfNormal: Vec3) => {
                    const L = pts[3].dot(surfNormal);
                    const M = pts[4].dot(surfNormal);
                    const N = pts[5].dot(surfNormal);

                    const E = pts[1].dot(pts[1]);
                    const F = pts[1].dot(pts[2]);
                    const G = pts[2].dot(pts[2]);
                    const denom = E * G - F * F;
                    const u = (pts[1].dot(tangentVect) * G - pts[2].dot(tangentVect) * F) / denom;
                    const v = (pts[2].dot(tangentVect) * E - pts[1].dot(tangentVect) * F) / denom;

                    const k = L * u * u + 2 * M * u * v + N * v * v;
                    return k;
                };

                const pts1: Vec3[] = surf1.getDerivatives(intersectPtInfo.uvPara1, nth);
                const pts2: Vec3[] = surf2.getDerivatives(intersectPtInfo.uvPara2, nth);
                const k1 = calCurvature(pts1, surfNormal1);
                const k2 = calCurvature(pts2, surfNormal2);
                //
                const curvatureVect = surfNormal1
                    .multiplied((k1 - k2 * cosTheta) / sinThetaSqr)
                    .add(surfNormal2.multiplied((k2 - k1 * cosTheta) / sinThetaSqr));

                dvts.push(curvatureVect);

                if (nth >= 3) {
                    // calculate Torsion
                    // const curvatureSqr = (k1 * k1 + k2 * k2 - 2 * k1 * k2 * cosTheta) / sinThetaSqr;
                    // const calTorsion = (pts: Vec3[], surfNormal: Vec3, uv2: number[]) => {
                    //     const uv1: number[] = []; // 用上面的
                    //     const III =
                    //         pts[6].dot(surfNormal) * uv1[1] ** 3 +
                    //         3 * pts[7].dot(surfNormal) * uv1[1] * uv1[1] * uv1[2] +
                    //         3 * pts[8].dot(surfNormal) * uv1[1] * uv1[2] * uv1[2] +
                    //         pts[9].dot(surfNormal) * uv1[2] ** 3;
                    //     const lambda = 3 * (uv1[0] * uv2[0] + uv1[0] * uv2[1] + uv1[1] * uv2[0] + uv1[1] * uv2[1]) + III;
                    //     return lambda;
                    // };
                    // const lambda1 = calTorsion(pts1, surfNormal1, [1, 1]);
                    // const lambda2 = calTorsion(pts2, surfNormal2, [1, 1]);
                    // //
                    // const torsionVect = tangentVect.multiplied(-curvatureSqr)
                    //     .add(surfNormal1.multiplied((lambda1 - lambda2 * cosTheta) / sinThetaSqr))
                    //     .add(surfNormal2.multiplied((lambda2 - lambda1 * cosTheta) / sinThetaSqr));
                }
            }
        }

        return dvts;
    }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        throw new Error('unimplemented');
    }

    public getType() {
        return EN_GEO_TYPE.INTERSECT_3D;
    }

    /**
     * 反向，改变自己
     */
    public reverse(): this {
        this._ptsChart.reverse();
        const lastKnot = this._knots[this._knots.length - 1];
        for (let i = 0; i < this._knots.length; i++) {
            this._knots[i] = lastKnot - this._knots[i];
        }
        this._knots.reverse();
        return this;
    }

    public split(params: number[], tolerance?: number): IntersectCurve3[] {
        throw new Error('unimplemented');
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        for (const isurf of this._surface) {
            isurf.transform(m);
        }
        for (const ptInfo of this._ptsChart) {
            ptInfo.point.transform(m);
        }
        this.updateKonts();
        return this;
    }

    /**
     * 转nurbs
     */
    public toSimpleCurve3d(degree = 3): Curve3 {
        // const degree = 2;
        // const knots: number[] = [];
        // const curvePts: Vec3[] = [];
        // let length: number = 0;
        // for (let j = 0; j < degree + 1; j++) {
        //     knots.push(length);
        // }
        // for (let i = 1; i < this._ptsChart.length; i++) {
        //     length += this._ptsChart[i].point.distanceTo(this._ptsChart[i - 1].point);
        //     if (this._ptsChart[i].isSingularity) {
        //         for (let j = 0; j < degree; j++) {
        //             knots.push(length);
        //             curvePts.push(this._ptsChart[i].point);
        //         }
        //     } else {
        //         knots.push(length);
        //         curvePts.push(this._ptsChart[i].point);
        //     }
        // }
        // for (let j = 0; j < degree; j++) {
        //     knots.push(length);
        // }

        // const nurbs = NurbsCurve3.MakeByKnotsControlPtsWeights(degree, knots, curvePts);
        // return nurbs;

        const curvePts: Vec3[] = [];
        this._ptsChart.map(p => curvePts.push(p.point));

        // 如果只有两个点，再中间插一个点，然后判断是否是直线
        if (curvePts.length === 2) {
            const insertPt = this.getInsertPt(0, 0.5, true);
            curvePts.splice(1, 0, insertPt);
        }

        // 如果只有三个交点，可能是直线
        if (curvePts.length === 3) {
            const vect1 = curvePts[1].subtracted(curvePts[0]).normalize();
            const vect2 = curvePts[2].subtracted(curvePts[1]).normalize();
            if (vect1.isParallel(vect2)) {
                return new Ln3(curvePts[0], curvePts[2]);
            }
        }

        if (degree > 2 && curvePts.length < degree + 1) {
            const insertNum = degree + 1 - curvePts.length;
            for (let i = 0; i < insertNum; i++) {
                // 每次找到距离最大的两个点在中间插入一个新的点
                let maxDist = 0;
                let maxDistIndex = 0;
                for (let k = 0; k < curvePts.length - 1; k++) {
                    const tmpDist = curvePts[k].sqDistanceTo(curvePts[k + 1]);
                    if (tmpDist > maxDist) {
                        maxDist = tmpDist;
                        maxDistIndex = k;
                    }
                }
                const insertPt = this.getInsertPt(maxDistIndex, 0.5);
                curvePts.splice(maxDistIndex + 1, 0, insertPt);
            }
        }

        const nurbs = NurbsCurve3.makeByInterpolationPts(curvePts, degree);
        return nurbs;
    }

    /**
     * 转nurbs
     */
    public toNurbs(degree = 3, lengthEps = Tol.LENGTH): NurbsCurve3 {
        const curvePts: Vec3[] = [];
        this._ptsChart.map(p => curvePts.push(p.point));

        // 如果只有两个点，再中间插一个点，然后判断是否是直线
        if (curvePts.length === 2) {
            const insertPt = this.getInsertPt(0, 0.5);
            curvePts.splice(1, 0, insertPt);
        }

        if (degree > 2 && curvePts.length < degree + 1) {
            const insertNum = degree + 1 - curvePts.length;
            for (let i = 0; i < insertNum; i++) {
                // 每次找到距离最大的两个点在中间插入一个新的点
                let maxDist = 0;
                let maxDistIndex = 0;
                for (let k = 0; k < curvePts.length - 1; k++) {
                    const tmpDist = curvePts[k].sqDistanceTo(curvePts[k + 1]);
                    if (tmpDist > maxDist) {
                        maxDist = tmpDist;
                        maxDistIndex = k;
                    }
                }
                const insertPt = this.getInsertPt(maxDistIndex, 0.5);
                curvePts.splice(maxDistIndex + 1, 0, insertPt);
            }
        }

        const nurbs = NurbsCurve3.makeByInterpolationPts(curvePts, degree);
        return nurbs;
    }

    /**
     * 转nurbs
     */
    public toNurbsBetweenPoints(rDegree = 3, point1: Vec3, point2: Vec3, dir?: Vec3): Curve3 {
        const allCurvePts: Vec3[] = [];
        this._ptsChart.map(p => allCurvePts.push(p.point));
        // 如果只有两个点，再中间插一个点，然后判断是否是直线
        if (allCurvePts.length === 2) {
            const insertPt = this.getInsertPt(0, 0.5);
            allCurvePts.splice(1, 0, insertPt);
        }

        // 如果只有三个交点，可能是直线
        if (allCurvePts.length === 3) {
            const vect1 = allCurvePts[1].subtracted(allCurvePts[0]).normalize();
            const vect2 = allCurvePts[2].subtracted(allCurvePts[1]).normalize();
            if (vect1.isParallel(vect2)) {
                const line = new Ln3(point1, point2);
                if (dir && dir.dot(line.getDirection()) < 0) {
                    return line.reverse();
                }
                return line;
            }
        }

        const index1 = this.getKontIndex(point1) + 1; // 在[i ~ i + 1]之间
        const index2 = this.getKontIndex(point2); // 在[i ~ i + 1]之间
        let [stPt, endPt] = [point1, point2];
        let [minIndex, maxIndex] = [index1, index2];
        if (minIndex > maxIndex) {
            [stPt, endPt] = [endPt, stPt];
            [minIndex, maxIndex] = [maxIndex, minIndex];
        }

        // 如果是周期性交线，并且起点方向与参考方向相反，要取另一段交线
        if (
            dir &&
            this._ptsChart[0].point.equals(this._ptsChart[this._ptsChart.length - 1].point, Tol.LENGTH)
        ) {
            const stDir =
                minIndex < this._ptsChart.length - 2
                    ? this._ptsChart[minIndex].point.subtracted(this._ptsChart[minIndex + 1].point)
                    : this._ptsChart[minIndex - 1].point.subtracted(this._ptsChart[minIndex].point);
            if (stDir.dot(dir) < 0) {
                [stPt, endPt] = [endPt, stPt];
                maxIndex = minIndex + this._ptsChart.length;
            }
        }

        const curvePts: Vec3[] = [];
        for (let i = minIndex + 1; i <= maxIndex; i++) {
            curvePts.push(this._ptsChart[i % this._ptsChart.length].point);
        }

        // 如果只有两个点，再中间插一个点
        if (curvePts.length === 2) {
            const insertPt = this.getInsertPt(minIndex, 0.5);
            curvePts.splice(minIndex + 1, 0, insertPt);
        }

        const sqDist1 = curvePts[0].sqDistanceTo(curvePts[1]);
        if (stPt.sqDistanceTo(curvePts[0]) > sqDist1 / 10000) {
            curvePts.splice(0, 0, stPt);
        } else {
            curvePts[0] = stPt;
        }

        const sqDist2 = curvePts[curvePts.length - 1].sqDistanceTo(curvePts[curvePts.length - 2]);
        if (endPt.sqDistanceTo(curvePts[curvePts.length - 1]) > sqDist2 / 10000) {
            curvePts.push(endPt);
        } else {
            curvePts[curvePts.length - 1] = endPt;
        }

        const degree = curvePts.length <= rDegree ? rDegree - 1 : rDegree;
        const nurbs = NurbsCurve3.makeByInterpolationPts(curvePts, degree);
        return nurbs;
    }

    // 计算交点表的index和index+1之间位置的一个插值点，如果精确插值的计算失败，估测一个粗略的点
    // 在两个点之间插点：lambda: 0 ~ 1，在两个点之间的位置（距离第一个点的距离/两点之间的距离）
    public getInsertPt(index: number, lambda: number, needInsert: boolean = false): Vec3 {
        const ptInfo0 = this._ptsChart[index];
        const ptInfo1 = this._ptsChart[index + 1];
        const nearPt = this._getInsertPt(ptInfo0, ptInfo1, lambda);
        if (nearPt !== undefined) {
            if (needInsert) {
                this._ptsChart.splice(index + 1, 0, nearPt);
            }
            return nearPt.point;
        }

        const coarsePt = ptInfo0.point.multiplied(1 - lambda).add(ptInfo1.point.multiplied(lambda)); // 估一个粗略的点
        return coarsePt;
    }

    // 在两个点之间插点：在交点表的index和index+1之间位置的一个插值点；lambda: 0 ~ 1，在两个点之间的位置（距离第一个点的距离/两点之间的距离）
    public insertPt(index: number, lambda: number): boolean {
        const ptInfo0 = this._ptsChart[index];
        const ptInfo1 = this._ptsChart[index + 1];
        const nearPt = this._getInsertPt(ptInfo0, ptInfo1, lambda);
        if (nearPt === undefined) {
            return false;
        }

        this._ptsChart.splice(index + 1, 0, nearPt);
        return true;
    }

    public clone() {
        const surfs = [...this._surface];
        const ptsChart: ISurfaceSurfaceIntersectPointInfo[] = [];
        for (const ptInfo of this._ptsChart) {
            const newPtInfo: ISurfaceSurfaceIntersectPointInfo = {
                point: ptInfo.point.clone(),
                uvPara1: { x: ptInfo.uvPara1.x, y: ptInfo.uvPara1.y },
                uvPara2: { x: ptInfo.uvPara2.x, y: ptInfo.uvPara2.y },
                isSingularity: ptInfo.isSingularity,
            };
            ptsChart.push(newPtInfo);
        }

        const cloneXCurve = new IntersectCurve3(surfs, ptsChart);
        return cloneXCurve;
    }

    /**
     * 抽取元数据，用于序列化
     */
    public dump() {
        const nurbs = this.toSimpleCurve3d();
        return nurbs.dump();
    }

    public load() {
        return this;
    }

    // calculate Derivatives Intersection curve at tangential intersection points
    private _getDerivativesAtTangentialPoint(
        intersectPtInfo: ISurfaceSurfaceIntersectPointInfo,
        nth: number,
        useDefaultSnap = true,
        refDir?: Vec3,
    ): Vec3[] {
        const dvts: Vec3[] = [];
        dvts.push(intersectPtInfo.point);

        const surf1 = this._surface[0];
        const surf2 = this._surface[1];
        const surfN1 = surf1.getNormAt(intersectPtInfo.uvPara1).normalized();
        const surfN2 = surf2.getNormAt(intersectPtInfo.uvPara2).normalized();

        const getSecondFuncForm = (pts: Vec3[], surfNormal: Vec3) => {
            const L = pts[3].dot(surfNormal);
            const M = pts[4].dot(surfNormal);
            const N = pts[5].dot(surfNormal);
            return { L, M, N };
        };

        const pts1 = surf1.getDerivatives(intersectPtInfo.uvPara1, nth + 1);
        const pts2 = surf2.getDerivatives(intersectPtInfo.uvPara2, nth + 1);
        const form1 = getSecondFuncForm(pts1, surfN1);
        const form2 = getSecondFuncForm(pts2, surfN2);

        // let commonNormal: Vec3;
        // if (surfN1.equals(surfN2)) {
        //     commonNormal = surfN1.added(surfN2).multiply(0.5);
        // } else {
        //     commonNormal = surfN1.subtracted(surfN2).multiply(0.5);
        // }
        const commonNormal = surfN1;
        const denominator = 1 / pts2[1].cross(pts2[2]).dot(commonNormal);
        const crossS1uS2v = pts1[1].cross(pts2[2]);
        const crossS1vS2v = pts1[2].cross(pts2[2]);
        const crossS2uS1u = pts2[1].cross(pts1[1]);
        const crossS2uS1v = pts2[1].cross(pts1[2]);
        const a11 = crossS1uS2v.dot(commonNormal) * denominator;
        const a12 = crossS1vS2v.dot(commonNormal) * denominator;
        const a21 = crossS2uS1u.dot(commonNormal) * denominator;
        const a22 = crossS2uS1v.dot(commonNormal) * denominator;

        // 二次方程b11 * (u1)^2 + 2 * b12 * (u1) * (v1) + b22 * (v1) * (v1) = 0
        const b11 = a11 * a11 * form2.L + 2 * a11 * a21 * form2.M + a21 * a21 * form2.N - form1.L;
        const b12 = a11 * a12 * form2.L + (a11 * a22 + a12 * a21) * form2.M + a21 * a22 * form2.N - form1.M;
        const b22 = a12 * a12 * form2.L + 2 * a12 * a22 * form2.M + a22 * a22 * form2.N - form1.N;

        let u1: number;
        let v1: number;
        let tangent: Vec3;
        const solveTol = Tol.NUMBER_CALC_EPS;
        if (Math.abs(b11) <= solveTol) {
            if (Math.abs(b12) > solveTol) {
                const omiga = -b22 / (2 * b12);
                const tangentVect = pts1[1].multiplied(omiga).add(pts1[2]);
                v1 = 1 / tangentVect.getLength();
                u1 = omiga * v1;
                tangent = tangentVect.normalized();
            } else if (Math.abs(b22) > solveTol) {
                const revOmiga = -(2 * b12) / b22;
                const tangentVect = pts1[1].added(pts1[2].multiplied(revOmiga));
                u1 = 1 / tangentVect.getLength();
                v1 = revOmiga * u1;
                tangent = tangentVect.normalized();
            } else {
                // b11 = 0, b22 = 0, b12 = 0
                // 两种可能：1.曲面在该点高阶相切：曲面的u、v偏导完全相同，大小相等；（暂未处理）
                // 2.曲面的v偏导完全相同，u偏导方向(平行，大小无所谓)，但是u向的系数为0，这样就导致
                // 二次方程的的系数a、b都为0，又因为v向完全相同，所以原来两个曲面对应的两个方程只有一个有效，
                // 因为不管u向系数为0，所以不论两个曲面切向方向和大小如何，结果都一样；
                // 又因为v向相同，所以不论v向系数如何其结果也都一样，所以方程组有无穷多解。
                // 第二种情况对应两个柱面z向相同，并且两个柱面相切，交线为v向的直线。
                // 同理，如果存在两个曲面相切，切线在v向系数为0，两个曲面u向方向相同时，也会出现。
                const sameDu = pts1[1].equals(pts2[1]);
                const sameDv = pts1[2].equals(pts2[2]);
                if (sameDv && !sameDu) {
                    v1 = 1 / pts1[2].getLength();
                    u1 = 0;
                    // 验证正确: form1.L * 0 + 2 * form1.M * 0 + form1.N * 1 = form2.L * 0 + form2.M * 0 + form2.N * 1
                    tangent = pts1[2].normalized();
                } else if (sameDu && !sameDv) {
                    u1 = 1 / pts1[1].getLength();
                    v1 = 0;
                    tangent = pts1[1].normalized();
                } else {
                    MathAssert.warn('getDerivativesAtTangentialPoint: 高阶相切，不能用此方法计算切线');
                    return dvts;
                }
            }
        } else {
            // 二次方程b11 * (u1 / v1)^2 + 2 * b12 * (u1 / v1) + b22 = 0
            const omigas = QuadraticEquation.solve(b11, 2 * b12, b22, solveTol); // omiga = u1 / v1
            if (omigas.length === 0) {
                MathAssert.warn('getDerivativesAtTangentialPoint: 曲面相切，只有一个孤立的切点，没有切向和曲率');
                return dvts;

            } else if (omigas.length === 1) {
                const omiga = omigas[0];
                const tangentVect = pts1[1].multiplied(omiga).add(pts1[2]);
                v1 = 1 / tangentVect.getLength();
                u1 = omiga * v1;
                tangent = tangentVect.normalized();
            } else {
                const tangent1 = pts1[1].multiplied(omigas[0]).add(pts1[2]);
                const tangent2 = pts1[1].multiplied(omigas[1]).add(pts1[2]);

                // 根据给定的参考方向，选取夹角更小的作为下一个方向
                if (refDir) {
                    let angle1 = refDir.angle(tangent1);
                    angle1 = angle1 > CONST.PI_2 ? CONST.PI - angle1 : angle1;
                    let angle2 = refDir.angle(tangent2);
                    angle2 = angle2 > CONST.PI_2 ? CONST.PI - angle2 : angle2;
                    if (angle2 < angle1) {
                        v1 = 1 / tangent2.getLength(); // 公式中计算的tangent是单位切向
                        const omiga = omigas[1];
                        u1 = omiga * v1;
                        tangent = tangent2.normalized();
                    } else {
                        v1 = 1 / tangent1.getLength();
                        const omiga = omigas[0];
                        u1 = omiga * v1;
                        tangent = tangent1.normalized();
                    }
                } else {
                    v1 = 1 / tangent1.getLength();
                    tangent = tangent1.normalized(); // 如果当前交点是初始点，且没有给定参考方向，随机选取其中第一个
                    const omiga = omigas[0];
                    u1 = omiga * v1;
                }
            }
        }
        // 如果计算的切向与参考方向相反，则需要反向
        if (refDir !== undefined && refDir.dot(tangent) < 0) {
            tangent.reverse();
        }
        dvts.push(tangent);

        // 对u1和v1处理一下
        u1 = Math.abs(u1) < Tol.ZERO_JUDGE_EPS ? 0 : u1;
        v1 = Math.abs(v1) < Tol.ZERO_JUDGE_EPS ? 0 : v1;

        if (nth >= 2) {
            // Calculate curvature
            const u2 = a11 * u1 + a12 * v1;
            const v2 = a21 * u1 + a22 * v1;

            const u1u1 = u1 * u1;
            const v1v1 = v1 * v1;
            const u2u2 = u2 * u2;
            const v2v2 = v2 * v2;
            const AA = pts1[3]
                .multiplied(u1u1)
                .add(pts1[4].multiplied(2 * u1 * v1))
                .add(pts1[5].multiplied(v1v1));
            const BB = pts2[3]
                .multiplied(u2u2)
                .add(pts2[4].multiplied(2 * u2 * v2))
                .add(pts2[5].multiplied(v2v2));
            const BA = BB.subtracted(AA);
            const a13 = BA.cross(pts2[2]).dot(commonNormal) * denominator;
            const a23 = pts2[1].cross(BA).dot(commonNormal) * denominator;
            // eq1: x3 = a11 * x1 + a12 * x2 + a13
            // eq2: x4 = a21 * x1 + a22 * x2 + a23
            const III1 =
                pts1[6].dot(surfN1) * u1u1 * u1 +
                3 * pts1[7].dot(surfN1) * u1u1 * v1 +
                3 * pts1[8].dot(surfN1) * u1 * v1v1 +
                pts1[9].dot(surfN1) * v1 * v1v1;
            const III2 =
                pts2[6].dot(surfN2) * u2u2 * u2 +
                3 * pts2[7].dot(surfN2) * u2u2 * v2 +
                3 * pts2[8].dot(surfN2) * u2 * v2v2 +
                pts2[9].dot(surfN2) * v2 * v2v2;
            const L1u1 = form1.L * u1;
            const M1u1 = form1.M * u1;
            const M1v1 = form1.M * v1;
            const N1v1 = form1.N * v1;
            const L2u2 = form2.L * u2;
            const M2u2 = form2.M * u2;
            const M2v2 = form2.M * v2;
            const N2v2 = form2.N * v2;
            // const lambda1 = 3 * (L1u1 * x1 + M1v1 * x1 + M1u1 * x2 + N1v1 * x2) + III1;
            // const lambda2 = 3 * (L2u2 * x3 + M2v2 * x3 + M2u2 * x4 + N2v2 * x4) + III2;
            // eq3: lambda1 = lambda2
            // eq1, eq2 代入eq3得:
            // (L2u2 * a11 + M2u2 * a21 + M2v2 * a11 + N2v2 * a21 - L1u1 - M1v1) * x1 +
            // (L2u2 * a12 + M2u2 * a22 + M2v2 * a12 + N2v2 * a22 - M1u1 - N1v1) * x2 +
            // (L2u2 * a13 + M2u2 * a23 + M2v2 * a13 + N2v2 * a23 + III2 / 3 - III1 / 3) = 0
            const tmp11 = L2u2 * a11 + M2u2 * a21 + M2v2 * a11 + N2v2 * a21 - L1u1 - M1v1;
            const tmp12 = L2u2 * a12 + M2u2 * a22 + M2v2 * a12 + N2v2 * a22 - M1u1 - N1v1;
            const tmp13 = L2u2 * a13 + M2u2 * a23 + M2v2 * a13 + N2v2 * a23 + III2 / 3 - III1 / 3;
            // eq4: pts1[1] * tangent * x1 + pts1[2] * tangent * x2 + tmp23 = 0
            const tmp21 = pts1[1].dot(tangent);
            const tmp22 = pts1[2].dot(tangent);
            const tmp23 =
                pts1[3].dot(tangent) * u1u1 + 2 * pts1[4].dot(tangent) * u1 * v1 + pts1[5].dot(tangent) * v1v1;

            // 二元方程组：
            // tmp11 * x1 + tmp12 * x2 + tmp13 = 0
            // tmp21 * x1 + tmp22 * x2 + tmp23 = 0
            const A = [
                [tmp11, tmp12],
                [tmp21, tmp22],
            ];
            const b = [-tmp13, -tmp23];
            const resEqs = LinearSystem.execute(A, b); // 由于大量计算，结果很不精确，数字10-16次方左右的数，解方程结果不准确
            if (resEqs === undefined) {
                return dvts;
            }

            // 理解：计算的曲率向量很小，而圆柱面的二阶导很大，因为圆柱面是角度参数化，而此处是弧长参数化。圆柱面的二阶导/半径的平方，得到的结果差不多一个量级
            const curvatureVect = AA.added(pts1[1].multiplied(resEqs[0])).added(pts1[2].multiplied(resEqs[1]));
            dvts.push(curvatureVect);
        }

        return dvts;
    }

    // 在两个点之间插点：param: 0 ~ 1，在两个点之间的位置（距离第一个点的距离/两点之间的距离）
    private _getInsertPt(
        ptInfo1: ISurfaceSurfaceIntersectPointInfo,
        ptInfo2: ISurfaceSurfaceIntersectPointInfo,
        param: number,
        tol = Tol.DEFAULT,
    ): ISurfaceSurfaceIntersectPointInfo | undefined {
        const surface1 = this._surface[0];
        const surface2 = this._surface[1];

        const estimateUV1 = {
            x: ptInfo1.uvPara1.x * (1 - param) + ptInfo2.uvPara1.x * param,
            y: ptInfo1.uvPara1.y * (1 - param) + ptInfo2.uvPara1.y * param,
        }; // 新的点在曲面1的参数估值
        const estimateUV2 = {
            x: ptInfo1.uvPara2.x * (1 - param) + ptInfo2.uvPara2.x * param,
            y: ptInfo1.uvPara2.y * (1 - param) + ptInfo2.uvPara2.y * param,
        }; // 新的点在曲面2的参数估值

        const origin = new Vec3(
            ptInfo1.point.x * (1 - param) + ptInfo2.point.x * param,
            ptInfo1.point.y * (1 - param) + ptInfo2.point.y * param,
            ptInfo1.point.z * (1 - param) + ptInfo2.point.z * param,
        );
        const dir = ptInfo1.point.subtracted(ptInfo2.point);
        const plane = new Plane(origin, dir);
        const estimateUV3 = { x: 0, y: 0 };
        const iteration3 = [estimateUV1, estimateUV2, estimateUV3];
        const iterativeValidity3 = threeSurfacesIteration(
            this._surface[0],
            this._surface[1],
            plane,
            iteration3,
            tol.lengthEps,
        );
        let iterResPt3: Vec3 | undefined;
        if (iterativeValidity3) {
            if (
                surface1.getDomainU().containsPt(iteration3[0].x) &&
                surface1.getDomainV().containsPt(iteration3[0].y) &&
                surface2.getDomainU().containsPt(iteration3[1].x) &&
                surface2.getDomainV().containsPt(iteration3[1].y)
            ) {
                iterResPt3 = plane.getPtAt(iteration3[2]);
                if (iterResPt3.sqDistanceTo(origin) < 0.01) {
                    // 理论上所求点和plane原点的距离其实很近，就是该点的拱高，而拱高应不大于曲线精度的容差，所以距离理应不大于0.1
                    const ret: ISurfaceSurfaceIntersectPointInfo = {
                        point: iterResPt3,
                        uvPara1: iteration3[0],
                        uvPara2: iteration3[1],
                    };
                    return ret;
                }
            }
        }

        const iteration = [estimateUV1, estimateUV2];

        const nearstPt = param < 0.5 ? ptInfo1.point : ptInfo2.point;
        const iterValidity1 = surfaceSurfaceIteration(this._surface[0], this._surface[1], iteration, tol.lengthEps);
        if (iterValidity1) {
            if (
                surface1.getDomainU().containsPt(iteration[0].x) &&
                surface1.getDomainV().containsPt(iteration[0].y) &&
                surface2.getDomainU().containsPt(iteration[1].x) &&
                surface2.getDomainV().containsPt(iteration[1].y)
            ) {
                const iterResPt1 = surface1.getPtAt(iteration[0]);
                if (iterResPt3 && iterResPt3.sqDistanceTo(origin) < iterResPt1.sqDistanceTo(origin)) {
                    const ret: ISurfaceSurfaceIntersectPointInfo = {
                        point: iterResPt3,
                        uvPara1: iteration3[0],
                        uvPara2: iteration3[1],
                    };
                    return ret;
                }

                // 验证一下计算的点是否在两个点之间
                if (iterResPt1.sqDistanceTo(nearstPt) < ptInfo1.point.sqDistanceTo(ptInfo2.point)) {
                    const ret: ISurfaceSurfaceIntersectPointInfo = {
                        point: iterResPt1,
                        uvPara1: iteration[0],
                        uvPara2: iteration[1],
                    };
                    return ret;
                }
            }
        }

        // 用一阶导迭代计算试试
        const iterValidity2 = surfaceSurfaceIteration(
            this._surface[0],
            this._surface[1],
            iteration,
            tol.lengthEps,
            false,
        );
        if (iterValidity2) {
            if (
                surface1.getDomainU().containsPt(iteration[0].x) &&
                surface1.getDomainV().containsPt(iteration[0].y) &&
                surface2.getDomainU().containsPt(iteration[1].x) &&
                surface2.getDomainV().containsPt(iteration[1].y)
            ) {
                const iterResPt2 = surface1.getPtAt(iteration[0]);
                if (iterResPt3 && iterResPt3.sqDistanceTo(origin) < iterResPt2.sqDistanceTo(origin)) {
                    const ret: ISurfaceSurfaceIntersectPointInfo = {
                        point: iterResPt3,
                        uvPara1: iteration3[0],
                        uvPara2: iteration3[1],
                    };
                    return ret;
                }

                if (iterResPt2.sqDistanceTo(nearstPt) < ptInfo1.point.sqDistanceTo(ptInfo2.point)) {
                    const ret: ISurfaceSurfaceIntersectPointInfo = {
                        point: iterResPt2,
                        uvPara1: iteration[0],
                        uvPara2: iteration[1],
                    };
                    return ret;
                }
            }
        }

        return undefined;
    }
}
