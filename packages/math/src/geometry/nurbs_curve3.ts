import * as verb from '../verb/verb';
import { Curve3 } from './curve3d';
import { Vec3 } from '../base/vec3';
import { Interval } from '../base/interval';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { DiscreteParam } from '../base/discrete_param';
import { MathAssert } from '../util/assert';
import { Util } from '../util/util';
import { INurbsCurve } from '../type_define/i_geometry';
import { TangentCone } from '../base/tangent_cone';
import { Tol } from '../base/tol';
import { Matrix4 } from '../base/matrix4';
import { Ln3 } from './ln3';
import { ICurvesOverlapInfo } from '../algorithm/overlap/i_overlap';
import { PeriodInterval } from '../base/period_inverval';
import { MathError } from '../util/math_error';
import { Coord3 } from '../base/coord3';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { Box3 } from '../base/box3';

/**
 * Nurbs曲线
 */
@registerGeo
export class NurbsCurve3 extends Curve3 implements INurbsCurve<Vec3> {
    /**
     * 合并nurbs曲线，目前仅支持合并三阶曲线
     * @param curve1
     * @param curve2
     * @param overlap 保证第一条曲线对应的重合区间为第一段，且第一条曲线的重合段为后半段
     */
    public static merge(
        curve1: NurbsCurve3,
        curve2: NurbsCurve3,
        overlap?: ICurvesOverlapInfo,
        degree: number = 3,
    ): NurbsCurve3 | undefined {
        let crv1 = curve1.clone();
        let crv2 = curve2.clone();

        if (overlap) {
            // 保证两条曲线一前一后首尾相接且第一条曲线对应第一个重复区间
            if (!overlap.isSameDirection) {
                crv2 = crv2.reverse();
            }
            const t = overlap.range1.getMid();
            crv1 = crv1.splitCurve(t)[0];
            const tInCrv2 = crv2.getParamAt(crv1.getPtAt(t));
            crv2 = crv2.splitCurve(tInCrv2)[1];
        } else if (crv1.getEndPt().equals(crv2.getEndPt())) {
            crv2 = crv2.reverse();
        } else if (crv1.getStartPt().equals(crv2.getStartPt())) {
            crv1 = crv1.reverse();
        } else if (crv1.getStartPt().equals(crv2.getEndPt())) {
            [crv1, crv2] = [crv2, crv1];
        } else if (crv1.getEndPt().equals(crv2.getStartPt())) {
            // normal case
        } else {
            return undefined;
        }

        const controlPts = crv1.getControlPoints();
        const knot1 = crv1.getKnots();
        const knot2 = crv2.getKnots();
        controlPts.pop();
        const control = controlPts.concat(crv2.getControlPoints());
        const knot = knot1.slice(0, knot1.length - 1);
        const endKnot = knot[knot.length - 1];
        const startFlag = knot2[0];
        for (let i = degree + 1; i < knot2.length; i++) {
            knot.push(knot2[i] + endKnot - startFlag);
        }

        return NurbsCurve3.makeByControlPoints(control, degree, knot);
    }

    /**
     * 构造Bezier曲线，degree 为控制点数-1，最大度数为 8.
     */
    public static makeBezier(controlPoints: types.IXYZ[], weights?: number[]): NurbsCurve3 {
        const controlPts = this._fiterCoPoint(controlPoints);
        const degree = controlPts.length - 1;
        const knots = NurbsCurve3.getBezierKnots(degree);
        return NurbsCurve3.makeByControlPoints(controlPts, degree, knots, weights, [0, 1]);
    }

    /**
     * 通过控制点和次数构造准均匀nurbs curve
     */
    public static makeByControlPoints(
        controlPoints: types.IXYZ[],
        degree: number = 3,
        knots?: number[],
        weights?: number[],
        range?: types.IInterval,
    ): NurbsCurve3 {
        // 传入knots则不再修改控制顶点，否则不满足 m = n + p + 1
        let controlPts = controlPoints;
        if (!knots) {
            controlPts = this._fiterCoPoint(controlPoints);
        }
        MathAssert.assert(controlPts.length >= degree + 1, 'nurbs curve 控制点数量需大于曲线次数');

        MathAssert.assert(!weights || weights.length === controlPts.length, '控制点和权值数量应相等');

        const _weights: number[] = weights || new Array(controlPts.length).fill(1);

        let _knots: number[];
        if (knots) {
            _knots = knots;
        } else {
            _knots = new Array(controlPts.length + degree + 1);
            const kLen = _knots.length;
            const cLen = controlPts.length;
            for (let i = 0; i < kLen; i++) {
                if (i <= degree) {
                    _knots[i] = 0;
                } else if (i <= cLen) {
                    _knots[i] = i - degree;
                } else {
                    _knots[i] = _knots[i - 1];
                }
            }
        }
        const verbPs = controlPts.map(pt => [pt.x, pt.y, pt.z]);
        const crv = verb.geom.NurbsCurve.byKnotsControlPointsWeights(degree, _knots, verbPs, _weights);
        return new NurbsCurve3(crv, range);
    }

    /**
     * 插值构造nurbs curve
     * 曲线将插值经过所有传入的点，曲线默认为三次
     */
    public static makeByInterpolationPts(
        pts: types.IXYZ[],
        degree: number = 3,
        closeSmooth: boolean = false,
    ): NurbsCurve3 {
        const interpts = this._fiterCoPoint(pts);
        if (interpts.length <= 1) {
            MathAssert.warn(false, 'nurbs curve 至少需要 2 个点进行插值');
            return new Ln3(interpts.length > 0 ? interpts[0] : Vec3.O(), Vec3.X(), [0, 0]) as unknown as NurbsCurve3;
        }

        const dg = Math.min(degree, interpts.length - 1);

        const verbPts = interpts.map(pt => [pt.x, pt.y, pt.z]);
        let crv;
        if (dg === 3) {
            if (closeSmooth && new Vec3(pts[0]).equals(pts[pts.length - 1])) {
                const temp = this._make3dNurbsByInterPoint(verbPts);
                const start = temp.tangent(0);
                crv = new verb.geom.NurbsCurve(verb.eval.Make.rationalInterpCurve(verbPts, 3, false, start, start));
            } else {
                crv = this._make3dNurbsByInterPoint(verbPts);
            }
        } else if (closeSmooth && new Vec3(pts[0]).equals(pts[pts.length - 1])) {
            const temp = verb.geom.NurbsCurve.byPoints(verbPts, dg);
            const start = temp.tangent(0);
            crv = new verb.geom.NurbsCurve(verb.eval.Make.rationalInterpCurve(verbPts, dg, false, start, start));
        } else {
            crv = verb.geom.NurbsCurve.byPoints(verbPts, dg);
        }
        return new NurbsCurve3(crv);
    }

    // 如果已知nurbs的插值点都在一个平面上，可以传入平面的坐标系，这样能保证拟合的nurbs是平面曲线
    public static makeByInterpolationPointsInPlane(
        pts: types.IXYZ[],
        planeCoord: Coord3,
        degree: number = 3,
        closeSmooth: boolean = false,
    ): NurbsCurve3 {
        const localPt2ds = pts.map(_pt => planeCoord.getLocalPtAt(_pt));
        const pt2ds = localPt2ds.map(pt => {
            return { x: pt.x, y: pt.y, z: 0 };
        });
        const crv = NurbsCurve3.makeByInterpolationPts(pt2ds, degree, closeSmooth);
        const ctrlPt3ds = crv.getControlPoints().map(_pt2d => planeCoord.getWorldPtAt(_pt2d));
        const knot = crv.getKnots();
        const weight = crv.getWeights();
        return NurbsCurve3.makeByControlPoints(ctrlPt3ds, crv.getDegree(), knot, weight);
    }

    public static getBezierKnots(degree: number): number[] {
        const knots: number[] = [];
        const pn = degree + 1;
        for (let i = 0; i < pn; i++) {
            knots.push(0);
        }
        for (let i = 0; i < pn; i++) {
            knots.push(1);
        }
        return knots;
    }

    /**
     * 过滤重复点，只过滤连续的重复点
     * @param pts 输入点列
     */
    private static _fiterCoPoint(pts: types.IXYZ[]): types.IXYZ[] {
        const newPts: types.IXYZ[] = [];
        newPts.push(pts[0]);
        for (let i = 1; i < pts.length; ++i) {
            if (Tol.DEFAULT.areNear(pts[i], pts[i - 1])) continue;
            newPts.push(pts[i]);
        }
        return newPts;
    }

    /* eslint-disable */
    /**
     * 针对verb库中插值方法点修改，大致流程基本不变，主要修改解方程的方式
     * @param points 输入插值点
     * @returns
     */
    private static _make3dNurbsByInterPoint(points: Array<verb.core.Point>): verb.geom.NurbsCurve {
        var us = [0.0];
        var _g1 = 1;
        var _g = points.length;
        while (_g1 < _g) {
            var i = _g1++;
            var chord = verb.core.Vec.norm(verb.core.Vec.sub(points[i], points[i - 1]));
            var last = us[us.length - 1];
            us.push(last + chord);
        }
        var max = us[us.length - 1];
        var _g11 = 0;
        var _g2 = us.length;
        while (_g11 < _g2) {
            var i1 = _g11++;
            us[i1] = us[i1] / max;
        }
        var knotsStart = [0, 0, 0, 0];
        var start = 1;
        var end = us.length - 3;
        var _g3 = start;
        while (_g3 < end) {
            var i2 = _g3++;
            var weightSums = 0.0;
            var _g12 = 0;
            while (_g12 < 3) {
                var j = _g12++;
                weightSums += us[i2 + j];
            }
            knotsStart.push((1 / 3) * weightSums);
        }
        var knots = knotsStart.concat([1, 1, 1, 1]);
        var A: number[][] = [];
        var n = points.length - 1;
        var _g4 = 0;
        var ld = points.length - 4;
        while (_g4 < us.length) {
            var u = us[_g4];
            ++_g4;
            var span = verb.eval.Eval.knotSpanGivenN(n, 3, u, knots);
            var basisFuncs = verb.eval.Eval.basisFunctionsGivenKnotSpanIndex(span, u, 3, knots);
            var ls = span - 3;
            var rowstart = verb.core.Vec.zeros1d(ls);
            var rowend = verb.core.Vec.zeros1d(ld - ls);
            A.push(rowstart.concat(basisFuncs).concat(rowend));
        }
        var dim = points[0].length;
        var xs: number[][] = [];
        var _g5 = 0;
        while (_g5 < dim) {
            var i3 = [_g5++];
            var b;

            b = points.map(
                (function (i3) {
                    return function (x1: any) {
                        return x1[i3[0]];
                    };
                })(i3),
            );

            let x: number[];
            if (A.length > 5) {
                var newA = A.map(arr => arr.slice());
                x = this._quickSolve(newA, b.slice());
            } else {
                x = verb.core.Mat.solve(A, b);
            }
            xs.push(x);
        }
        var controlPts = verb.core.Mat.transpose(xs);
        var weights = verb.core.Vec.rep(controlPts.length, 1.0);
        controlPts = verb.eval.Eval.homogenize1d(controlPts, weights);

        return new verb.geom.NurbsCurve(new verb.core.NurbsCurveData(3, knots, controlPts));
    }
    /* eslint-enable */

    /**
     * 快速求解的方式采用基于追赶法的方式，由于矩阵并不是很整齐的原因，条状矩阵外扩保证了整齐，然后采用多次追赶的方式
     * 先“追”3次，然后“赶”3次，得到对角矩阵后，归一化直接得到解
     * 相比与LU分解常规求解，时间得到很大的提升
     * @param A 输入矩阵
     * @param b 系数
     * @returns
     */
    private static _quickSolve(A: verb.core.Matrix, b: verb.core.Vec): verb.core.Vec {
        const n = A.length;
        for (let i = 0; i < 3; ++i) {
            for (let j = n - 3 + i; j > 0; --j) {
                const arrDown = A[j];
                const arrUp = A[j - 1];
                let k = j + 2 - i < n ? j + 2 - i : n - 1;
                if (Tol.DEFAULT.isLengthZero(arrUp[k])) continue;
                const x = arrUp[k] / arrDown[k];
                b[j - 1] -= b[j] * x;
                for (; k > j - 6 && k >= 0; --k) {
                    arrUp[k] -= arrDown[k] * x;
                }
            }
        }

        for (let i = 0; i < 3; ++i) {
            for (let j = 2 - i; j < n - 1; ++j) {
                const arrDown = A[j + 1];
                const arrUp = A[j];
                let k = j - 2 + i > 0 ? j - 2 + i : 0;
                if (Tol.DEFAULT.isLengthZero(arrDown[k])) continue;
                const x = arrDown[k] / arrUp[k];
                b[j + 1] -= b[j] * x;
                for (; k < j + 6 && k < n; ++k) {
                    arrDown[k] -= arrUp[k] * x;
                }
            }
        }

        for (let i = 0; i < n; ++i) {
            b[i] *= 1 / A[i][i];
        }

        return b;
    }

    // verbNurbs对象
    private _verbCurve: verb.geom.NurbsCurve;

    // 曲线的次数
    private _degree: number;

    // 节点数组
    private _knots: number[];

    // 控制点
    private _controlPoints: Vec3[];

    // 权值
    private _weights: number[];

    constructor(verbCurve?: verb.geom.NurbsCurve, range?: types.IInterval) {
        super();
        if (verbCurve) {
            this._verbCurve = verbCurve;
            this._updateParameters();

            const isPeriodic =
                this._controlPoints[0].sqDistanceTo(this._controlPoints[this._controlPoints.length - 1]) <
                Tol.LENGTH_2;
            if (range) {
                if (isPeriodic) {
                    const domain = verbCurve.domain();
                    this._range = new PeriodInterval(range[0], range[1], domain.max - domain.min);
                } else {
                    this._range = new Interval(range[0], range[1]);
                }
            } else {
                const domain = verbCurve.domain();
                this._range = isPeriodic
                    ? new PeriodInterval(domain.min, domain.max, domain.max - domain.min)
                    : new Interval(domain.min, domain.max);
            }
        }
    }

    public toVerbNurbs(): verb.geom.NurbsCurve {
        return this._verbCurve.clone() as verb.geom.NurbsCurve;
    }

    public getDegree(): number {
        return this._degree;
    }

    public getWeights(): number[] {
        return this._weights;
    }

    public getKnots(): number[] {
        return this._knots;
    }

    public getControlPoints(): Vec3[] {
        return this._controlPoints;
    }

    /**
     * 获取定义域，参数 t 超过该范围无法求值
     * range 为定义域上的一部分，用于裁切曲线
     */
    public getDomain(): Interval {
        const domain = this._verbCurve.domain();
        if (this._range instanceof PeriodInterval) {
            return new PeriodInterval(domain.min, domain.max, domain.max - domain.min);
        }
        return new Interval(domain.min, domain.max);
    }

    public isBezier(): boolean {
        const pn = this._controlPoints.length;
        if (this._degree + 1 !== pn) return false;

        for (let i = 0; i < pn; i++) {
            if (this._knots[i] !== 0) return false;
            if (this._knots[i + pn] !== 0) return false;
        }

        return true;
    }

    /**
     * 判断nurbs是否近似为一条直线
     */
    public getCoincideLine(angleTol = Tol.ANGLE): Ln3 | undefined {
        // 可用最小二乘法优化，后期有必要再修改
        const dir = this._controlPoints[this._controlPoints.length - 1].subtracted(this._controlPoints[0]).normalize();
        const line3d = new Ln3(this._controlPoints[0], dir, Interval.infinitArray());
        for (let i = 1; i < this._controlPoints.length; i++) {
            const tmpDir = this._controlPoints[i].subtracted(this._controlPoints[0]).normalize();
            if (!dir.isParallel(tmpDir, angleTol)) {
                return undefined;
            }
        }
        return line3d;
    }

    /**
     * 判断NurbsCurve3d是否是平面曲线
     * 如果是平面曲线：并且控制顶点能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；
     * 如果不是平面曲线，返回false
     */
    public isPlaneCurve3d(angleTol = Tol.ANGLE): boolean | Vec3 {
        const ctrlPts = this._controlPoints;
        if (ctrlPts.length < 4) {
            return true;
        }

        let normal: Vec3 | undefined;
        const pt0 = ctrlPts[0];
        // 依次从三个点计算平面
        const o = Vec3.O();
        const v0 = ctrlPts[1].subtracted(pt0).normalized();
        for (let i = 2; i < ctrlPts.length; i++) {
            const vect = ctrlPts[i].subtracted(pt0);
            if (vect.equals(o)) {
                continue;
            }
            const v1 = vect.normalized();
            if (normal === undefined) {
                const n = v0.cross(v1).normalized();
                if (!n.equals(new Vec3(0, 0, 0))) {
                    normal = n;
                }
            } else {
                const dot = normal.dot(v1);
                if (Math.abs(dot) > angleTol) {
                    return false;
                }
            }
        }

        if (normal) {
            return normal;
        }

        return true;
    }

    /**
     * 获取参数值对应的曲线上的点
     * @param t 参数(弧长)
     */
    public getPtAt(t: number): Vec3 {
        const domain = this.getDomain();
        const param = domain instanceof PeriodInterval ? domain.getRegularParam(t) : t;
        const pt = this._verbCurve.point(param);
        return new Vec3(pt[0], pt[1], pt[2]);
    }

    /**
     * 利用nurbs导数连续的特性，比较两个连续离散点与求取垂足点的关系，看是否满足关系然后在进行迭代求解
     * @param point 求取垂足的点
     * @param distEps 距离容差
     * @param angleEps 角度容差
     * @returns
     */
    public getAllFootParams(
        point: types.IXYZ,
        distEps = Tol.LENGTH,
        angleEps = Tol.ANGLE,
    ): number[] {
        const result: number[] = [];
        const clampParam = !this.isPeriodic();
        const domain = this.getDomain();
        const segNum = this._degree * this._controlPoints.length;
        const span = (domain.max - domain.min) / segNum;
        const pt = new Vec3(point);
        let seg1 = domain.min;
        let vec1 = this.getPtAt(seg1).subtracted(pt);
        let val1 = this.getTangentAt(seg1).dot(vec1);
        if (Math.abs(val1) < distEps) {
            result.push(seg1);
        }
        for (let i = 1; i <= segNum; ++i) {
            const seg2 = domain.min + span * i;
            const vec2 = this.getPtAt(seg2).subtracted(pt);
            const val2 = this.getTangentAt(seg2).dot(vec2);
            if (Math.abs(val2) < distEps) {
                result.push(seg2);
                continue;
            }

            if (val1 * val2 < 0) {
                let iteraterVal;
                if (val1 > 0) iteraterVal = seg1;
                else iteraterVal = seg2;
                const resultParam = this.getFootByIterate(point, iteraterVal, distEps, angleEps, clampParam);
                if (resultParam !== undefined) {
                    const clampedParam = clampParam ? resultParam : domain.clamp(resultParam);
                    if (clampedParam < seg2 + distEps && clampedParam > seg1 - distEps) {
                        result.push(clampedParam);
                    } else {
                        // 用二分法求解，将解控制在seg1 ～ seg2之间。
                        const resultParam2 = this.getFootByDichotomy(point, seg1, seg2, distEps, angleEps, clampParam);
                        if (resultParam2 === undefined) {
                            MathError.warn('nurbs3d反求参数失败！');
                        } else {
                            result.push(resultParam2);
                        }
                    }
                }
            }

            seg1 = seg2;
            vec1 = vec2;
            val1 = val2;
        }

        if (result.length < 1) return [];
        result.sort();
        const newResult = [result[0]];
        for (let i = 1; i < result.length; ++i) {
            if (Math.abs(result[i - 1] - result[i]) < distEps) continue;
            newResult.push(result[i]);
        }

        if (newResult.length > 1 && domain instanceof PeriodInterval) {
            if (Math.abs(newResult[newResult.length - 1] - newResult[0] - domain.period) < distEps) {
                newResult.pop();
            }
        }

        return newResult;

        // const domain = this.getDomain();

        // const angle = CONST.PI_12;
        // const cosEps = Math.cos((CONST.PI - angle) / 2);
        // const nearFoots: number[] = []; // 备用参数
        // const footParams: number[] = [];

        // const distEps = Tol.LENGTH;
        // const processEps2 = distEps * distEps / 100;
        // const coarseEps = distEps * 100;
        // let iter = 0;
        // let tmpParam = domain.min;
        // let tmpDvs = this.getDerivatives(tmpParam, 2);
        // let vect = tmpDvs[0].subtracted(point);
        // let fx: number = vect.dot(tmpDvs[1]);

        // while (iter < CONST.MAX_ITER_NUM) {
        //     const deltaT = angle * tmpDvs[1].getSqLength() / Math.abs(tmpDvs[1].dot(tmpDvs[2])); // 估计步长
        //     let nextParam = tmpParam + deltaT > domain.max ? domain.max : tmpParam + deltaT;
        //     let nextDvs = this.getDerivatives(nextParam, 2);

        //     if (Math.abs(tmpDvs[1].normalized().dot(nextDvs[1].normalized())) < cosEps) {
        //         const dt2 =  deltaT / 2;
        //         nextParam = tmpParam + dt2 > domain.max ? domain.max : tmpParam + dt2;
        //         nextDvs = this.getDerivatives(nextParam, 2);
        //     }

        //     const nxtVect = nextDvs[0].subtracted(point);
        //     const nxtFx: number = nxtVect.dot(nextDvs[1]);

        //     // 如果f0 * f1 < 0，则（t，t+deltaT）区间有一个垂足
        //     if (fx * nxtFx < Tol.LENGTH) {
        //         const foot = this.getFootByIterate(point, tmpParam + deltaT / 2, distEps, distEps, true);
        //         if (foot !== undefined) {
        //             const sqrDist = this.getPtAt(foot).sqDistanceTo(point);
        //             if (sqrDist < processEps2) {
        //                 return foot;
        //             }

        //             footParams.push(foot);
        //         }
        //     } else {
        //         if (vect.getSqLength() < coarseEps || Math.abs(vect.normalized().dot(tmpDvs[1].normalized())) < cosEps) {
        //             nearFoots.push(tmpParam);
        //         }
        //     }

        //     if (nextParam > domain.max - Tol.NUMBER) {
        //         break;
        //     }

        //     iter++;
        //     tmpParam = nextParam;
        //     tmpDvs = nextDvs;
        //     fx = nxtFx;
        // }

        // if (footParams.length === 0) {
        //     // 如果没有找到垂足，从近似垂足中以及端点中找最近点，因为 f0 * f1 < 0 可能漏掉在近似垂足附近的垂足
        //     for (const param of nearFoots) {
        //         const foot = this.getFootByIterate(point, param, distEps, distEps, true);
        //         if (foot !== undefined) {
        //             const sqrDist = this.getPtAt(foot).sqDistanceTo(point);
        //             if (sqrDist < processEps2) {
        //                 return foot;
        //             }

        //             footParams.push(foot);
        //         }
        //     }
        // }

        // if (footParams.length > 0) {
        //     let minParam = footParams[0];
        //     let minDist = this.getPtAt(minParam).sqDistanceTo(point);
        //     for (let i = 1; i < footParams.length; i++) {
        //         const dist = this.getPtAt(footParams[i]).sqDistanceTo(point);
        //         if (dist < minDist) {
        //             minParam = footParams[i];
        //             minDist = dist;
        //         }
        //     }
        //     return minParam;
        // }

        // const stDist = this.getStartPt().sqDistanceTo(point);
        // const endDist = this.getEndPt().sqDistanceTo(point);
        // return stDist < endDist ? this.getStartParam() : this.getEndParam();
    }

    /**
     * 获取点在曲线上的参数
     * @param point
     */
    /* eslint-disable */
    public getParamAt(point: types.IXYZ): number {
        const domain = this.getDomain();
        const splitNum = 10;
        var pts = verb.eval.Tess.rationalCurveRegularSampleRange(
            this._verbCurve.asNurbs(),
            domain.min,
            domain.max,
            this._controlPoints.length * splitNum, // (this._controlPoints.length - this._degree) * this._degree * 2,
            true,
        );
        const param = this._getParamAtWithPoints(point, pts);

        if (this.getPtAt(param).equals(point)) {
            return param;
        }
        pts = [];
        for (let i = 0; i < this._knots.length - 1; i++) {
            const [curr, next] = [this._knots[i], this._knots[i + 1]];
            if (curr !== next) {
                const span = (next - curr) / splitNum;
                for (let j = 0; j < splitNum; j++) {
                    const u = curr + span * j;
                    pts.push([u, ...this._verbCurve.point(u)]);
                }
            }
        }
        pts.push(this._verbCurve.point(this._knots[this._knots.length - 1]));
        return this._getParamAtWithPoints(point, pts);;
    }

    private _getParamAtWithPoints(point: types.IXYZ, pts: verb.core.Point[]) {
        const p = [point.x, point.y, point.z];
        var min = Infinity;
        var u = this.getDomain().min;

        var _g1 = 0;
        var _g = pts.length - 1;
        while (_g1 < _g) {
            var i1 = _g1++;
            var u0 = pts[i1][0];
            var u11 = pts[i1 + 1][0];
            var p0 = pts[i1].slice(1);
            var p1 = pts[i1 + 1].slice(1);
            var proj = verb.core.Trig.segmentClosestPoint(p, p0, p1, u0, u11);
            var d1 = verb.core.Vec.norm(verb.core.Vec.sub(p, proj.pt));

            if (Math.abs(d1 - min) < Tol.EDGE_LENGTH_EPS) {
                // 如果两个点距离很近，一个在参数域内，一个在外，优先选择参数域内的点
                if (this._range.containsPt(proj.u) && !this._range.containsPt(u)) {
                    min = d1;
                    u = proj.u;
                }
            } else if (d1 < min) {
                min = d1;
                u = proj.u;
            }
        }

        var maxits = 20;
        var i = 0;
        var e;
        var eps1 = 1.0e-6;
        var eps2 = 1.0e-7;
        var dif;
        var minu = this._knots[0];
        var maxu = this._knots[this._knots.length - 1];
        var closed = this._controlPoints[0].equals(
            this._controlPoints[this._controlPoints.length - 1],
            verb.core.Constants.EPSILON,
        );
        var cu = u;
        var n = function (u2: any, e1: any, d: any) {
            var f1 = verb.core.Vec.dot(e1[1], d);
            var s0 = verb.core.Vec.dot(e1[2], d);
            var s1 = verb.core.Vec.dot(e1[1], e1[1]);
            var df = s0 + s1;
            return u2 - f1 / df;
        };
        while (i < maxits) {
            e = verb.eval.Eval.rationalCurveDerivatives(this._verbCurve.asNurbs(), cu, 2);
            for (const ie of e) {
                if (ie.length > p.length) {
                    ie.splice(p.length); // 未知原因导致计算的数据存在问题，暂时这样处理一下
                }
            }
            dif = verb.core.Vec.sub(e[0], p);
            var c1v = verb.core.Vec.norm(dif);
            var c2n = verb.core.Vec.dot(e[1], dif);
            var c2d = verb.core.Vec.norm(e[1]) * c1v;
            var c2v = c2n / c2d;
            var c1 = c1v < eps1;
            var c2 = Math.abs(c2v) < eps2;
            if (c1 && c2) return cu;
            var ct = n(cu, e, dif);
            if (ct < minu)
                if (closed) ct = maxu - (ct - minu);
                else ct = minu;
            else if (ct > maxu)
                if (closed) ct = minu + (ct - maxu);
                else ct = maxu;
            var c3v = verb.core.Vec.norm(verb.core.Vec.mul(ct - cu, e[1]));
            if (c3v < eps1) return cu;
            cu = ct;
            i++;
        }
        return cu;
    }
    /* eslint-enable */

    /**
     * 计算参数域内的最近点参数
     * @param point 给定点
     * @returns 参数
     */
    /* eslint-disable */
    public getNearestT(point: Vec3, rRange?: Interval): number {
        const p = [point.x, point.y, point.z];
        const range = rRange || this._range;
        var min = Infinity;
        var u = range.min;
        const discreteSegs = (this._controlPoints.length - this._degree) * this._degree * 3;
        var pts = verb.eval.Tess.rationalCurveRegularSampleRange(
            this._verbCurve.asNurbs(),
            range.min,
            range.max,
            discreteSegs,
            true,
        );
        var _g1 = 0;
        var _g = pts.length - 1;
        while (_g1 < _g) {
            var i1 = _g1++;
            var u0 = pts[i1][0];
            var u11 = pts[i1 + 1][0];
            var p0 = pts[i1].slice(1);
            var p1 = pts[i1 + 1].slice(1);
            var proj = verb.core.Trig.segmentClosestPoint(p, p0, p1, u0, u11);
            var d1 = verb.core.Vec.norm(verb.core.Vec.sub(p, proj.pt));
            if (d1 < min) {
                min = d1;
                u = proj.u;
            }
        }

        var maxits = 20;
        var i = 0;
        var e;
        var eps1 = 1.0e-6;
        var eps2 = 1.0e-7;
        var dif;
        var minu = range.min;
        var maxu = range.max;
        var cu = u;
        var n = function (u2: any, e1: any, d: any) {
            var f1 = verb.core.Vec.dot(e1[1], d);
            var s0 = verb.core.Vec.dot(e1[2], d);
            var s1 = verb.core.Vec.dot(e1[1], e1[1]);
            var df = s0 + s1;
            return u2 - f1 / df;
        };
        while (i < maxits) {
            e = verb.eval.Eval.rationalCurveDerivatives(this._verbCurve.asNurbs(), cu, 2);
            for (const ie of e) {
                if (ie.length > p.length) {
                    ie.splice(p.length); // 未知原因导致计算的数据存在问题，暂时这样处理一下
                }
            }
            dif = verb.core.Vec.sub(e[0], p);
            var c1v = verb.core.Vec.norm(dif);
            var c2n = verb.core.Vec.dot(e[1], dif);
            var c2d = verb.core.Vec.norm(e[1]) * c1v;
            var c2v = c2n / c2d;
            var c1 = c1v < eps1;
            var c2 = Math.abs(c2v) < eps2;
            if (c1 && c2) return cu;
            var ct = n(cu, e, dif);
            if (ct < minu)
                if (range instanceof PeriodInterval) ct = ct + range.period;
                else ct = minu;
            else if (ct > maxu)
                if (range instanceof PeriodInterval) ct = ct - range.period;
                else ct = maxu;
            var c3v = verb.core.Vec.norm(verb.core.Vec.mul(ct - cu, e[1]));
            if (c3v < eps1) return cu;
            cu = ct;
            i++;
        }
        return cu;
    }

    /**
     * 获取参数值对应的曲线上的点处的切向量
     * @param t
     * @returns 单位切向量
     */
    public getTangentAt(t: number): Vec3 {
        const domain = this.getDomain();
        let param;
        if (
            domain instanceof PeriodInterval &&
            (t > domain.max + Tol.CALCULATE_EPS || t < domain.min - Tol.CALCULATE_EPS)
        ) {
            param = domain.getRegularParam(t, Tol.CALCULATE_EPS); // 只有出参数域了才做参数调整，否则计算末端点处的切向不对
        } else {
            param = t;
            MathError.warn(domain.containsPt(t, Tol.CALCULATE_EPS), 'nurbs getTangentAt: 参数超出参数域');
        }
        const tanV = this._verbCurve.tangent(param);
        const vec = new Vec3(tanV[0], tanV[1], tanV[2]);
        return vec.normalize();
    }

    /**
     *  获取某参数t处的几阶导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)、1阶导、2阶导
     */
    public getDerivatives(t: number, nth: number): Vec3[] {
        const domain = this.getDomain();
        let param;
        if (
            domain instanceof PeriodInterval &&
            (t > domain.max + Tol.CALCULATE_EPS || t < domain.min - Tol.CALCULATE_EPS)
        ) {
            param = domain.getRegularParam(t, Tol.CALCULATE_EPS); // 只有出参数域了才做参数调整，否则计算末端点处的切向不对
        } else {
            param = t;
            if (!domain.containsPt(t, Tol.CALCULATE_EPS)) {
                MathError.warn('nurbs getDerivatives: 参数超出参数域');
            }
        }
        return this._verbCurve.derivatives(param, nth).map(p => new Vec3(p));
    }

    public getTangentCone(range?: Interval, approx: boolean = true): TangentCone {
        const rRange = range || this._range;
        const min = rRange.min;
        const max = rRange.max;

        const domain = this.getDomain();
        if (max < domain.min || min > domain.max) {
            return new TangentCone(Vec3.O(), 0);
        }

        // 分割得到参数区间内的曲线
        const cloneNurbs = this.clone();
        let midNurbs: NurbsCurve3;
        if (min < domain.min) {
            const nurbss = cloneNurbs.splitCurve(max);
            midNurbs = nurbss[0];
        } else if (min < domain.min) {
            const nurbss = cloneNurbs.splitCurve(min);
            midNurbs = nurbss[1];
        } else {
            const nurbs1s = cloneNurbs.splitCurve(min);
            const nurbs2s = nurbs1s[1].splitCurve(min);
            midNurbs = nurbs2s[0];
        }

        // 计算TangentCone
        const srqTol = Tol.LENGTH * Tol.LENGTH;
        const rCone = new TangentCone(Vec3.O(), 0);
        const ctrlPts = midNurbs.getControlPoints();
        let i = 1;
        // 找到一个初始的TangentCone
        while (i < ctrlPts.length) {
            const rVt: Vec3 = ctrlPts[i].subtracted(ctrlPts[i - 1]);
            if (rVt.getSqLength() > srqTol) {
                rCone.dir = rVt;
                break;
            }
            i++;
        }

        // merge TangentCone
        if (i === ctrlPts.length) {
            rCone.dir = Vec3.X();
            rCone.angle = 0;
        } else {
            i++;
            while (i < ctrlPts.length) {
                const rVt: Vec3 = ctrlPts[i].subtracted(ctrlPts[i - 1]);
                if (rVt.getSqLength() > srqTol) {
                    rCone.mergeCone(rVt);
                }
                i++;
            }
        }

        return rCone;
    }

    /**
     * 获取曲线上的弧长等分点，返回的第一个和最后一个分别为曲线的起点和终点
     * @param count 等分点数量，数目限制最小为3
     * @returns 单位切向量
     */
    public getEqualDiversionPts(count: number = 3): Vec3[] {
        MathAssert.assert(count >= 3, 'getEqualDiversionPts，请传入大于3的数字', count);

        const res: Vec3[] = [];
        const length = this.getLength();
        const step = length / (count - 1);
        for (let len = 0; len <= length; len += step) {
            const pt = this.getPtAt(len);
            res.push(pt);
        }
        return res;
    }

    public getKontIndex(knot: number, eps = Tol.LENGTH) {
        let i = 0;
        for (; i < this._knots.length - 1; i++) {
            if (knot > this._knots[i] - eps && knot <= this._knots[i + 1] - eps) {
                break;
            }
        }
        return i;
    }

    public getMultiplicityOfKnot(knot: number, k: number, eps = Tol.LENGTH): number {
        let multi: number = 0;
        // if (knot > this._knots[k] + eps && knot < this._knots[k + 1] - eps) {
        //     tmpMulti = 0; // 不是已有的节点
        // } else
        if (Math.abs(knot - this._knots[k]) < eps) {
            multi++;
            for (let m = k + 1; m < this._knots.length; m++) {
                if (Math.abs(knot - this._knots[m]) < eps) {
                    multi++;
                } else {
                    break;
                }
            }
        } else if (Math.abs(knot - this._knots[k + 1]) < eps) {
            for (let m = k + 2; m < this._knots.length; m++) {
                if (Math.abs(knot - this._knots[m]) < eps) {
                    multi++;
                } else {
                    break;
                }
            }
        }
        return multi;
    }

    /**
     * 插入单个节点
     * @param knot
     * @param eps
     */
    public insertKnot(knot: number, eps = Tol.LENGTH) {
        const domain = this.getDomain();
        const t = domain instanceof PeriodInterval ? domain.getRegularParam(knot) : knot;
        if (t < domain.min + eps || t > domain.max - eps) {
            return; // 也不能在开始和结尾插入节点，因为节点重数已经满了
        }

        const k = this.getKontIndex(knot, eps);
        const newCtrlPts = this._newCtrlPtsAtInsertKnot(k, t);

        const p = this._degree;
        // 更新nurbs的信息
        this._knots.splice(k + 1, 0, t);
        this._controlPoints.splice(k - p + 1, p - 1, ...newCtrlPts);
        this._weights.splice(k - p + 1, 0, 1);

        // 不能直接插入进_verbCurve的数据中，需要重新构造verbCurve
        const corePts: Array<number>[] = [];
        newCtrlPts.map(_pt => corePts.push([_pt.x, _pt.y, _pt.z]));
        const verbCtrlPts = this._verbCurve.controlPoints();
        verbCtrlPts.splice(k - p + 1, p - 1, ...corePts);
        this._verbCurve = verb.geom.NurbsCurve.byKnotsControlPointsWeights(p, this._knots, verbCtrlPts, this._weights);
    }

    /**
     * 插入单个节点重复插入multi次
     * @param knot
     * @param insertTimes
     * @param eps
     */
    public insertMultiKnot(knot: number, insertTimes: number, eps = Tol.LENGTH) {
        const domain = this.getDomain();
        const param = domain instanceof PeriodInterval ? domain.getRegularParam(knot) : knot;
        if (param < domain.min + eps || param > domain.max - eps) {
            return; // 也不能在开始和结尾插入节点，因为节点重数已经满了
        }

        const p = this._degree;
        const index = this.getKontIndex(knot, eps);
        const tmpMulti = this.getMultiplicityOfKnot(param, index, eps);
        const newCtrlPts = this._newCtrlPtsAtInsertMultiKnot(index, param, insertTimes, tmpMulti);

        const knots = new Array(insertTimes);
        knots.fill(param);
        const weights = new Array(insertTimes);
        weights.fill(1);

        // 更新nurbs的信息
        this._knots.splice(index + 1, 0, ...knots);
        this._controlPoints.splice(index - p + 1, p - tmpMulti - 1, ...newCtrlPts);
        this._weights.splice(index - p + 1, 0, ...weights);

        // 不能直接插入进_verbCurve的数据中，需要重新构造verbCurve
        const corePts: Array<number>[] = [];
        newCtrlPts.map(_pt => corePts.push([_pt.x, _pt.y, _pt.z]));
        const verbCtrlPts = this._verbCurve.controlPoints();
        verbCtrlPts.splice(index - p + 1, p - tmpMulti - 1, ...corePts);
        this._verbCurve = verb.geom.NurbsCurve.byKnotsControlPointsWeights(p, this._knots, verbCtrlPts, this._weights);
    }

    /**
     * 插入多个节点(暂未实现)
     * @param knot
     * @param eps
     */
    public insertKnots(knot: number[], eps = Tol.LENGTH) {
        // if (!this.getDomain().containsPt(knot, eps)) {
        //     return;
        // }
        // let i = 0;
        // for (const iterator of object) {
        // }
    }

    public getBox(range?: Interval): Box3 {
        const theRange = range || this._range;
        const length = theRange.getLength();
        const domain = this.getDomain();
        if (theRange.containsInterval(domain)) {
            return new Box3(this._controlPoints);
        }

        if (domain instanceof PeriodInterval) {
            theRange.min = domain.getRegularParam(theRange.min);
            theRange.max = theRange.min + length;
        }

        // 下面的操作会修改数据，先记录下来，后面再改回去
        const p = this._degree;
        const cloneKnots = this.getKnots().slice();
        const cloneCtrlPts = this.getControlPoints().slice();

        let index1 = this.getKontIndex(theRange.min);
        if (
            theRange.min - this.getDomain().min > Tol.NUMBER &&
            theRange.min - this.getDomain().max < -Tol.NUMBER
        ) {
            const multi = this.getMultiplicityOfKnot(theRange.min, index1);
            const insertTimes = this._degree - multi;
            const newCtrlPts = this._newCtrlPtsAtInsertMultiKnot(index1, theRange.min, insertTimes, multi);

            const knots = new Array(insertTimes);
            knots.fill(theRange.min);
            this._knots.splice(index1 + 1, 0, ...knots);
            this._controlPoints.splice(index1 - p + 1, p - multi - 1, ...newCtrlPts);

            index1 = index1 - p + insertTimes; // 从index1 - p + 1位置插入次数insertTimes
        } else {
            index1 -= p;
        }
        let index2 = this.getKontIndex(theRange.max);
        if (
            theRange.max - this.getDomain().min > Tol.NUMBER &&
            theRange.max - this.getDomain().max < -Tol.NUMBER
        ) {
            const multi = this.getMultiplicityOfKnot(theRange.max, index2);
            const insertTimes = this._degree - multi;
            const newCtrlPts = this._newCtrlPtsAtInsertMultiKnot(index2, theRange.max, insertTimes, multi);

            const knots = new Array(insertTimes);
            knots.fill(theRange.max);
            this._knots.splice(index2 + 1, 0, ...knots);
            this._controlPoints.splice(index2 - p + 1, p - multi - 1, ...newCtrlPts);

            index2 = index2 - p + insertTimes;
        } else {
            index2 -= p;
        }
        const ctrlPts = this.getControlPoints().slice(index1, index2 + 1);

        // 数据改回去
        this._knots = cloneKnots;
        this._controlPoints = cloneCtrlPts;

        return new Box3(ctrlPts);
    }

    /**
     * 节点细化
     * @param useDomainOrRange true就是要对整个domain范围作节点细化，false只对range内的节点细化（待完善）。
     */
    public knotRefinement(useDomainOrRange = false) {
        const degree = this._degree;
        const knots = this.getKnots();
        const averageLength = this.getDomain().getLength() / 10;
        for (let i = degree; i < knots.length - degree + 1; i++) {
            if (knots[i + 1] - knots[i] > averageLength) {
                this.insertKnot((knots[i + 1] + knots[i]) / 2);
                i--;
            }

            if (knots.length > 30) {
                break; // 防止死循环
            }
        }
    }

    /**
     * 在参数 t 处将 Nurbs 曲线切分为两部分 // 分割成两条完全独立的nurbs，对控制顶点做了重新计算
     * @param t 切分点处的参数
     * @param useRange 若真，则根据原参数域进行同步切分；若假，则切分得到的曲线以定义域作为参数域
     * @return 返回切分得到的参数曲线，并会根据原参数域设置新的参数域。若参数有误则返回空数组
     */
    public splitCurve(t: number, useRange = true): NurbsCurve3[] {
        const domain = this.getDomain();
        const param = domain instanceof PeriodInterval ? domain.getRegularParam(t) : t;
        const verbCurves = this._verbCurve.split(param);
        if (verbCurves.length < 2) {
            MathAssert.warn(true, 'NurbsCurve 分割错误：参数有误', param);
            return [];
        }

        // 分割有bug，当分割参数点为节点时，分割结果断开位置节点和控制顶点有多余
        const curSeg1Knots = verbCurves[0].knots();
        let lastKnotMulti = 1;
        for (let i = curSeg1Knots.length - 2; i >= 0; i--) {
            if (Util.isNearlyEqual(curSeg1Knots[i], curSeg1Knots[curSeg1Knots.length - 1])) {
                lastKnotMulti++;
            }
        }

        if (lastKnotMulti > verbCurves[0].degree() + 1) {
            const curv1CtrlPts = verbCurves[0].controlPoints();
            for (let j = 0; j < lastKnotMulti - verbCurves[1].degree() - 1; j++) {
                const ctrlPtsCount1 = curv1CtrlPts.length;
                if (new Vec3(curv1CtrlPts[ctrlPtsCount1 - 1]).equals(new Vec3(curv1CtrlPts[ctrlPtsCount1 - 2]))) {
                    curv1CtrlPts.pop();
                    curSeg1Knots.pop();
                }
            }

            verbCurves[0] = verb.geom.NurbsCurve.byKnotsControlPointsWeights(
                verbCurves[0].degree(),
                curSeg1Knots,
                curv1CtrlPts,
            );
        }

        const curSeg2Knots = verbCurves[1].knots();
        let firstKnotMulti = 1;
        for (let i = 1; i < curSeg2Knots.length; i++) {
            if (Util.isNearlyEqual(curSeg2Knots[i], curSeg2Knots[0])) {
                firstKnotMulti++;
            }
        }

        if (firstKnotMulti > verbCurves[1].degree() + 1) {
            const curv2CtrlPts = verbCurves[1].controlPoints();
            for (let j = 0; j < firstKnotMulti - verbCurves[1].degree() - 1; j++) {
                if (new Vec3(curv2CtrlPts[0]).equals(new Vec3(curv2CtrlPts[1]))) {
                    curv2CtrlPts.splice(0, 1);
                    curSeg2Knots.splice(0, 1);
                }
            }

            verbCurves[1] = verb.geom.NurbsCurve.byKnotsControlPointsWeights(
                verbCurves[1].degree(),
                curSeg2Knots,
                curv2CtrlPts,
            );
        }

        if (useRange) {
            const p1 = this._verbCurve.point(this._range.min);
            const p2 = this._verbCurve.point(this._range.max);
            const p = this._verbCurve.point(param);
            const t1Min = verbCurves[0].closestParam(p1);
            const t1Max = verbCurves[0].closestParam(p);
            const t2Min = verbCurves[1].closestParam(p);
            const t2Max = verbCurves[1].closestParam(p2);
            const ret1 = new NurbsCurve3(verbCurves[0], [t1Min, t1Max]);
            const ret2 = new NurbsCurve3(verbCurves[1], [t2Min, t2Max]);
            return [ret1, ret2];
        }

        return [new NurbsCurve3(verbCurves[0]), new NurbsCurve3(verbCurves[1])];
    }

    public reverse(): this {
        // Reverse the verb nurbs curve
        const range = this.getRange();
        const domain = this.getDomain();
        const isDomainStart = Math.abs(range.min - domain.min) < Tol.NUMBER;
        const isDomainEnd = Math.abs(range.max - domain.max) < Tol.NUMBER;
        this._verbCurve = this._verbCurve.reverse();
        this._updateParameters();
        const newDomain = this.getDomain();
        const stParam = isDomainStart ? newDomain.max : newDomain.max - (range.min - domain.min);
        const edParam = isDomainEnd ? newDomain.min : domain.max - range.max + newDomain.min;
        this._range.set(edParam, stParam);
        return this;
    }

    public clone(): NurbsCurve3 {
        const obj = new NurbsCurve3(this._verbCurve.clone(), this._range.toArray());
        obj.userData = this.userData;
        return obj;
    }

    /**
     * 获取曲线长度
     */
    public getLength(range?: Interval): number {
        const r = range || this._range;
        const l1 = this._verbCurve.lengthAtParam(r.min);
        const l2 = this._verbCurve.lengthAtParam(r.max);
        return l2 - l1;
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        const data: types.numberArrs4X4 = (m as types.IMatrix4).data || m;
        // verb matrix is right multiply
        const transposeData = new Matrix4(data).transpose().data;
        this._verbCurve = this._verbCurve.transform(transposeData);
        this._updateParameters();
        return this;
    }

    /**
     * 离散曲线
     * @param tolerance  相邻三点组成的三角形面积的最大值
     * @returns 离散点
     */
    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        return DiscreteUtil.discreteCurve3d(this, params);
        // const pts = verb.eval.Tess.rationalCurveAdaptiveSampleRange(
        //     this._verbCurve.asNurbs(),
        //     this._range.min,
        //     this._range.max,
        //     params.tolerance.lengthEps,
        //     false,
        // );
        // return pts.map(p => new Vec3(p));
    }

    public getType(): EN_GEO_TYPE {
        return EN_GEO_TYPE.NURBS_CURVE_3D;
    }

    public dump(): types.IDBNurbsCurve3d {
        const cps = this._controlPoints.map(p => p.toArray3());
        let isSameWeight = true;
        const w0 = this._weights[0];

        for (const w of this._weights) {
            if (w !== w0) {
                isSameWeight = false;
                break;
            }
        }

        return {
            type: EN_GEO_TYPE.NURBS_CURVE_3D,
            data: [
                this._degree,
                cps,
                this.isBezier() ? [] : [...this._knots],
                isSameWeight ? [] : [...this._weights],
                this._range.toArray(),
            ],
        };
    }

    public load({ data: [degree, controlPts, _knots, _weights, range] }: types.IDBNurbsCurve3d) {
        const knots = _knots.length === 0 ? NurbsCurve3.getBezierKnots(degree) : _knots;
        const weights = _weights.length === 0 ? new Array<number>(controlPts.length).fill(1) : _weights;
        this._verbCurve = verb.geom.NurbsCurve.byKnotsControlPointsWeights(degree, knots, controlPts, weights);
        this._updateParameters();

        const stCtrlPt = this._controlPoints[0];
        const endCtrlPt = this._controlPoints[this._controlPoints.length - 1];
        const isPeriodic = stCtrlPt.sqDistanceTo(endCtrlPt) < Tol.LENGTH_2;
        if (isPeriodic) {
            const domain = this._verbCurve.domain();
            this._range = new PeriodInterval(range[0], range[1], domain.max - domain.min);
        } else {
            this._range = new Interval(range[0], range[1]);
        }
        return this;
    }

    private _updateParameters() {
        this._degree = this._verbCurve.degree();
        this._knots = this._verbCurve.knots();
        this._weights = this._verbCurve.weights();
        this._controlPoints = this._verbCurve.controlPoints().map(pt => {
            return new Vec3(pt);
        });
    }

    private _newCtrlPtsAtInsertKnot(k: number, t: number) {
        const lambdas: number[] = [];
        for (let i = k - this._degree + 1; i <= k; i++) {
            lambdas.push((t - this._knots[i]) / (this._knots[i + this._degree] - this._knots[i]));
        }

        const newCtrlPts: Vec3[] = [];
        for (let i = k - this._degree + 1; i <= k; i++) {
            const lamda = lambdas[i - (k - this._degree + 1)];
            const newCtrlPt = this._controlPoints[i]
                .multiplied(lamda)
                .add(this._controlPoints[i - 1].multiplied(1 - lamda));
            newCtrlPts.push(newCtrlPt);
        }

        return newCtrlPts;
    }

    /**
     *
     * @param k 位置索引
     * @param t 插入的节点参数
     * @param times 插入次数
     * @param multi 已有重复度
     */
    private _newCtrlPtsAtInsertMultiKnot(k: number, t: number, times: number, multi: number) {
        const p = this._degree;
        MathError.warn(times + multi <= p, '插入节点重复度太多');
        const n = Math.min(times, p - multi);

        const ctrlPts = this._controlPoints;
        const ctrlPtss: Vec3[][] = [];
        let prevCtrlPts: Vec3[] = ctrlPts.slice(k - p, k - multi + 1);
        for (let r = 1; r <= n; r++) {
            const tmpCtrlPts: Vec3[] = [];
            let j = 1;
            for (let i = k - p + r; i <= k - multi; i++) {
                const lambda = (t - this._knots[i]) / (this._knots[i + p - r + 1] - this._knots[i]);
                const newCtrlPt = prevCtrlPts[j].multiplied(lambda).add(prevCtrlPts[j - 1].multiplied(1 - lambda));
                tmpCtrlPts.push(newCtrlPt);
                j++;
            }
            prevCtrlPts = tmpCtrlPts;
            ctrlPtss.push(tmpCtrlPts);
        }

        const newCtrlPts: Vec3[] = [];
        for (const pts of ctrlPtss) {
            newCtrlPts.push(pts[0]);
        }
        for (let i = ctrlPtss.length - 1; i >= 0; i--) {
            const pts = ctrlPtss[i];
            if (pts.length < 2) {
                continue; // 前面已经加入该顶点
            }
            newCtrlPts.push(pts[pts.length - 1]);
        }
        return newCtrlPts;
    }
}
