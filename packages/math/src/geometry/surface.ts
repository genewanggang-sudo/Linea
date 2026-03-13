import { Curve2 } from './curve2';
import { Curve3 } from './curve3d';
import { types } from '../type_define/i_types';
import { Vec3 } from '../base/vec3';
import { Vec2 } from '../base/vec2';
import { Box3 } from '../base/box3';
import { Tol } from '../base/tol';
import { DiscreteParam } from '../base/discrete_param';
import { SmoothPoly3 } from './smooth_poly3';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { Util } from '../util/util';
import { Geometry3d } from '../geometry/geometry3d';
import { Interval } from '../base/interval';
import { NurbsCurve3 } from './nurbs_curve3';
import { CONST } from '../type_define/const';
import { PeriodInterval } from '../base/period_inverval';
import { Ln2 } from './ln2';
import { NurbsCurve2 } from './nurbs_curve2';
import { SurfaceUtil } from '../util/surface_util';
import { LinearSystem } from '../solve_equations/linear_system';
import { ISurfaceTransformExtra } from '../type_define/i_geometry';



/**
 * 曲面基类
 */
abstract class Surface extends Geometry3d {
    constructor() {
        super();
    }

    /**
     * 获取uv处的三维点
     * @param uv
     */
    public abstract getPtAt(uv: types.IXY): Vec3;

    /**
     * 获取三维点处的uv值，（反求参数）
     * @param pt
     */
    public abstract getUVAt(pt: types.IXYZ): Vec2;

    /**
     * 获取uv处的法矢
     * @param uv
     */
    public abstract getNormAt(uv: types.IXY): Vec3;

    /**
     *  获取某参数t处的n阶偏导数
     * t : 参数t
     * n : 导数的阶数 // 譬如n = 2，会计算曲线在参数t处的0阶导(即曲线点)，1阶偏导（包含偏u、偏v），2阶偏导（包含偏uu、偏uv、偏vv）
     */
    public abstract getDerivatives(uv: types.IXY, n: number): Vec3[];

    /**
     * 几何变换，改变自己
     * @param m
     */
    public abstract transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: ISurfaceTransformExtra): this;

    /**
     * 是否和另一个曲面面完全重叠
     * @param other
     * @param tol
     */
    public abstract isCoplanar(other: Surface, tol: Tol): boolean;

    /**
     * 曲线是否在曲面上
     * @param curve
     * @param tolerance
     */
    public abstract containsCurve(curve: Curve3, tolerance: number): boolean;

    /**
     * 获取等参曲线
     * @param param 等参曲线处的参数
     * @param useV true 时返回等 v 参数曲线，false 时返回等 u 参数曲线
     */
    public abstract getIsoCurve(param: number, useV: boolean): Curve3;

    /**
     * U向是周期性的
     */
    public isUPeriodic(): boolean {
        return this.getDomainU() instanceof PeriodInterval;
    }

    /**
     * V向是周期性的
     */
    public isVPeriodic(): boolean {
        return this.getDomainV() instanceof PeriodInterval;
    }

    /**
     * 是否是直纹面
     */
    public isRuled(): boolean {
        return false;
    }

    /**
     * 获取曲面的domainU
     */
    public getDomainU(): Interval {
        return Interval.infinit();
    }

    /**
     * 获取曲面的domainV
     */
    public getDomainV(): Interval {
        return Interval.infinit();
    }

    // 将参数调整到参数域内的位置
    public clampInDomain(paraXY: types.IXY) {
        //
    }

    public getBBox(): Box3 {
        throw new Error('No bounding box for Surface');
    }

    public getBox(theRangeU?: Interval, theRangeV?: Interval): Box3 {
        const rangeU = theRangeU || this.getDomainU();
        const rangeV = theRangeV || this.getDomainV();
        const boundCurves = [
            this.getIsoCurve(rangeU.min, false).setRange(rangeV),
            this.getIsoCurve(rangeU.max, false).setRange(rangeV),
            this.getIsoCurve(rangeV.min, true).setRange(rangeU),
            this.getIsoCurve(rangeV.max, true).setRange(rangeU),
        ];
        const resultBox = new Box3();
        boundCurves.forEach(_cv => {
            resultBox.union(_cv.getBBox());
        });
        return resultBox;
    }

    /**
     * 获取三维点p处的法矢
     * @param p
     */
    public getNormAtPoint(p: types.IXYZ): Vec3 {
        const uv = this.getUVAt(p);
        return this.getNormAt(uv);
    }

    /**
     * 获取曲面的奇异点
     */
    public getSingularPoints(): Vec3[] {
        return [];
    }

    /**
     * 平移，改变自己
     * @param offset 平移量
     */
    public translate(offset: types.IXYZ): this {
        return super.translate(offset);
    }

    /**
     * 旋转，改变自己
     * @param angle 旋转角度
     * @param pivot 旋转轴上的一个点
     * @param axis 旋转轴方向
     */
    public rotate(angle: number, pivot: Vec3, axis: Vec3): this {
        return super.rotate(angle, pivot, axis);
    }

    /**
     *  克隆
     */
    public clone(): any {
        return super.clone();
    }

    /**
     * 几何变换，得到新的几何对象 // 处理镜像变换时，保留V向和法向
     * @param m
     */
    public transformed(m: types.IMatrix4 | types.numberArrs4X4, extra?: ISurfaceTransformExtra): Surface {
        return this.clone().transform(m, extra);
    }

    /**
     * 点到曲面的垂足
     */
    public getProjectedPtBy(point: types.IXYZ) {
        const p = this.getUVAt(point);
        return this.getPtAt(p);
    }

    /**
     * 点是否在曲面上
     * @param point
     * @param tolerance
     */
    public containsPt(point: types.IXYZ, tolerance: number = Tol.LENGTH): boolean {
        const sqrDist = this.getPtAt(this.getUVAt(point)).sqDistanceTo(point);
        return Util.isNearly0(sqrDist, tolerance * tolerance);
    }

    /**
     * 点到曲面的距离
     * @deprecated 请使用CalculateDistance.ptToSurf()接口
     * @param point
     */
    public distanceToPoint(point: types.IXYZ): number {
        return this.getPtAt(this.getUVAt(point)).distanceTo(point);
    }

    /**
     * 点到曲面的有向距离， 点在正向，距离为正，否则为负
     * @deprecated 请使用CalculateDistance.ptToSurfSigned()接口
     * @param point
     */
    public signDistanceToPoint(point: types.IXYZ): number {
        const p = this.getUVAt(point);
        const pt = this.getPtAt(p);
        let distance = pt.distanceTo(point);
        if (pt.subtracted(point).dot(this.getNormAt(p)) > 0) {
            distance = -distance;
        }
        return distance;
    }

    /**
     * 计算给定点的参数, 牛顿迭代法对曲面的投影点逐步求精
     * @param pt3d 要反求参数的point
     * @param refUV 参考参数UV
     * @param lengthEps 距离误差
     * @param angleEps 角度误差
     * @param validLengthU 如果需要验证求到的参数是否距离给定参考的参数refUV.x太远，如果距离太远可能是计算的参数不准，用其他方法计算所有的参数，选一个最近的参数
     * @param validLengthV 如果需要验证求到的参数是否距离给定参考的参数refUV.y太远，如果距离太远可能是计算的参数不准，用其他方法计算所有的参数，选一个最近的参数
     */
    public getUVNearParam(
        pt3d: Vec3,
        refUV: types.IXY,
        lengthEps: number = Tol.ANGLE,
        angleEps: number = Tol.LENGTH,
        validLengthU?: number,
        validLengthV?: number,
    ): Vec2 {
        const dSinAngleEps = Math.sin(angleEps); // cos(PI/2 - dAngleEpsilon)
        const dDistSqr = lengthEps * lengthEps;

        let getFootUV = false;
        const tmpUV: types.IXY = { x: refUV.x, y: refUV.y };
        let i = 0;
        for (; i < CONST.NORMAL_ITER_NUM; i++) {
            const dvts = this.getDerivatives(tmpUV, 2);
            const vect = dvts[0].subtracted(pt3d);
            const func = [vect.dot(dvts[1]), vect.dot(dvts[2])];
            // 已经满足垂直条件
            if (vect.getSqLength() < dDistSqr) {
                getFootUV = true;
                break;
            }
            if (Math.abs(func[0]) < dSinAngleEps && Math.abs(func[1]) < dSinAngleEps) {
                getFootUV = true;
                break;
            }

            // 牛顿迭代,计算下一个点
            // // Jacbi matrix
            // const calcJacbiFunc = (uv: number[]) => {
            //     const dvts = this.getDerivatives({ x: uv[0], y: uv[1] }, 2);
            //     const vect = dvts[0].subtracted(pt3d);
            //     const df1 = [dvts[1].dot(dvts[1]) + vect.dot(dvts[3]), dvts[2].dot(dvts[1])];
            //     const df2 = [dvts[1].dot(dvts[2]), dvts[2].dot(dvts[2]) + vect.dot(dvts[5])];
            //     return [df1, df2];
            // };
            const fu = dvts[1].dot(dvts[1]) + vect.dot(dvts[3]);
            const fv = dvts[2].dot(dvts[1]);
            const gu = fv;
            const gv = dvts[2].dot(dvts[2]) + vect.dot(dvts[5]);
            const dfs = [
                [fu, fv],
                [gu, gv],
            ];

            // 解方程
            if (Math.abs(dfs[0][0] * dfs[1][1] - dfs[0][1] * dfs[1][0]) < Tol.CALCULATE_EPS) {
                getFootUV = false;
                break; // |det| < 0, 无法继续迭代
            }
            const deltaParams = LinearSystem.execute(dfs, func);
            if (deltaParams === undefined) {
                getFootUV = false;
                break;
            }

            tmpUV.x -= deltaParams[0];
            tmpUV.y -= deltaParams[1];

            // 参数域拉回？？
        }

        let isValidU = false;
        let isValidV = false;
        if (getFootUV) {
            if (!validLengthU && !validLengthV) {
                return new Vec2(tmpUV);
            }

            if (!validLengthU) {
                isValidU = true;
            } else if (Math.abs(tmpUV.x - refUV.x) < validLengthU) {
                isValidU = true;
            } else if (Math.abs(tmpUV.x - refUV.x) > validLengthU) {
                const domainU = this.getDomainU();
                if (domainU instanceof PeriodInterval) {
                    tmpUV.x = domainU.getRegularParam(tmpUV.x);
                    if (Math.abs(tmpUV.x - refUV.x) < validLengthU) {
                        isValidU = true;
                    }
                    if (Math.abs(tmpUV.x - domainU.period - refUV.x) < validLengthU) {
                        tmpUV.x -= domainU.period;
                        isValidU = true;
                    }
                    if (Math.abs(tmpUV.x + domainU.period - refUV.x) < validLengthU) {
                        tmpUV.x += domainU.period;
                        isValidU = true;
                    }
                }
            }

            if (!validLengthV) {
                isValidV = true;
            } else if (Math.abs(tmpUV.y - refUV.y) < validLengthV) {
                isValidV = true;
            } else if (Math.abs(tmpUV.y - refUV.y) > validLengthV) {
                const domainV = this.getDomainV();
                if (domainV instanceof PeriodInterval) {
                    tmpUV.x = domainV.getRegularParam(tmpUV.x);
                    if (Math.abs(tmpUV.y - refUV.y) < validLengthV) {
                        isValidV = true;
                    }
                    if (Math.abs(tmpUV.y - domainV.period - refUV.y) < validLengthV) {
                        tmpUV.y -= domainV.period;
                        isValidV = true;
                    }
                    if (Math.abs(tmpUV.y + domainV.period - refUV.y) < validLengthV) {
                        tmpUV.y += domainV.period;
                        isValidV = true;
                    }
                }
            }
        }

        if (isValidU && isValidV) {
            return new Vec2(tmpUV);
        }

        const uv = this.getUVAt(pt3d);
        return uv;
    }

    public getCurve2dForIsoCurve(pt3ds: Vec3[]): Curve2 | undefined {
        if (pt3ds.length > 200 && !this.isPlane()) {
            const pt2d = this.getUVAt(pt3ds[0]);
            const isoUCv = this.getIsoCurve(pt2d.x, false);
            const discretePts1 = DiscreteUtil.discreteCurve3d(isoUCv, DiscreteParam.NORMAL);
            if (Math.abs(discretePts1.length / pt3ds.length - 1) < 0.01) {
                let isIsoUCv = true;
                for (let i = 0; i < pt3ds.length; i += 2) {
                    if (!isoUCv.containsPt(pt3ds[i])) {
                        isIsoUCv = false;
                        break;
                    }
                }

                if (isIsoUCv) {
                    const pt2dEnd = this.getUVAt(pt3ds[pt3ds.length - 1]);
                    if (Math.abs(pt2d.x - pt2dEnd.x) < Tol.LENGTH) {
                        return new Ln2(pt2d, pt2dEnd);
                    }
                    if (Math.abs(pt2d.x - pt2dEnd.x) > Tol.LENGTH && this.isUPeriodic()) {
                        const domainU = this.getDomainU() as PeriodInterval;
                        const period = domainU.period;
                        if (Math.abs((pt2dEnd.x - pt2d.x) / period - 1) < Tol.LENGTH) {
                            pt2dEnd.x = pt2d.x;
                            return new Ln2(pt2d, pt2dEnd);
                        }
                    }
                    // else {
                    //     // todo
                    // }
                }
            }
            const isoVCv = this.getIsoCurve(pt2d.y, true);
            const discretePts2 = DiscreteUtil.discreteCurve3d(isoVCv, DiscreteParam.NORMAL);
            if (Math.abs(discretePts2.length / pt3ds.length - 1) < 0.01) {
                let isIsoVCv = true;
                for (let i = 0; i < pt3ds.length; i += 2) {
                    if (!isoVCv.containsPt(pt3ds[i])) {
                        isIsoVCv = false;
                        break;
                    }
                }

                if (isIsoVCv) {
                    const pt2dEnd = this.getUVAt(pt3ds[pt3ds.length - 1]);
                    if (Math.abs(pt2d.y - pt2dEnd.y) < Tol.LENGTH) {
                        return new Ln2(pt2d, pt2dEnd);
                    }
                    if (Math.abs(pt2d.y - pt2dEnd.y) > Tol.LENGTH && this.isVPeriodic()) {
                        const domainU = this.getDomainU() as PeriodInterval;
                        const period = domainU.period;
                        if (Math.abs((pt2dEnd.y - pt2d.y) / period - 1) < Tol.LENGTH) {
                            pt2dEnd.y = pt2d.y;
                            return new Ln2(pt2d, pt2dEnd);
                        }
                    }
                    // else {
                    //     // todo
                    // }
                }
            }
        }

        return undefined;
    }

    /**
     * 将三维曲线，转成参数域的二维曲线：对于平面，得到的是精确的参数域曲线；对于其他曲面，得到的是精确表达的直线，或者是nurbs2d曲线
     * 注：传入参数时，请保证曲线必须在曲面surface上。如果曲线不在曲面上，请调用投影接口。平面投影接口：Curve3ProjectToPlane
     * @param curve 在曲面上的曲线
     */
    public getCurve2d(curveOnSurface: Curve3): Curve2 {
        const pt3ds = DiscreteUtil.discreteCurve3d(curveOnSurface, DiscreteParam.NORMAL);
        const isoCurve2d = this.getCurve2dForIsoCurve(pt3ds);
        if (isoCurve2d) {
            return isoCurve2d;
        }
        const pt2ds = pt3ds.map(p3 => this.getUVAt(p3));

        // 处理getCurve2d跨周期的问题
        const domainU = this.getDomainU();
        if (domainU instanceof PeriodInterval) {
            const period = domainU.period;
            // 离散之后，二维参数点的距离差不可能特别大
            if (pt2ds.length > 2) {
                let hasBigDist = true; // 对于在周期线上的curve，反求参数结果在周期线上跳来跳去，需要while循环处理
                while (hasBigDist) {
                    // ----0----1----|2---3----4-------
                    // ---5.8--6.0---|0--0.2--0.4------- => ---5.8--6.0---|6.28--6.48--6.68-------（case1）
                    // ---0.4--0.2--0|---6.0--5.8------- => ---6.68--6.48--6.28|---6.0--5.8-------（case2）
                    let i = 0; // 周期断开位置的索引
                    let sign = 0;
                    for (; i < pt2ds.length - 2; i++) {
                        const iDist = pt2ds[i + 1].x - pt2ds[i].x;
                        const jDist = Math.abs(pt2ds[i + 2].x - pt2ds[i + 1].x);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1; // 如果iDist < 0是曲线与surf参数域方向同向，case1的情况；>0是反向，case2的情况
                            break;
                        }
                    }

                    // 没找到断开位置，判断最后一个是否断开（--------7----8---9----|10-------）
                    if (sign === 0) {
                        const iDist = pt2ds[i + 1].x - pt2ds[i].x;
                        const jDist = Math.abs(pt2ds[i].x - pt2ds[i - 1].x);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1;
                        } else {
                            i++;
                        }
                    }

                    hasBigDist = sign !== 0;
                    if (sign !== 0) {
                        if (sign > 0) i++; // 如果sign > 0调整后面的参数+period，从后一个开始调整；如果sign < 0,调整前面的参数+period，从当前的开始调整
                        while (i >= 0 && i < pt2ds.length) {
                            pt2ds[i].x += period;
                            i += sign!;
                        }
                    }
                }
            }

            // curve2d的点整体出了周期域，移动到周期内
            if (Math.min(pt2ds[0].x, pt2ds[pt2ds.length - 1].x) > period - Tol.NUMBER) {
                for (const pt2d of pt2ds) {
                    pt2d.x -= period;
                }
            } else if (Math.max(pt2ds[0].x, pt2ds[pt2ds.length - 1].x) < Tol.NUMBER) {
                for (const pt2d of pt2ds) {
                    pt2d.x += period;
                }
            }
        }
        const domainV = this.getDomainV();
        if (domainV instanceof PeriodInterval) {
            const period = domainV.period;
            if (pt2ds.length > 2) {
                let hasBigDist = true;
                while (hasBigDist) {
                    let i = 0; // 周期断开位置的索引
                    let sign = 0;
                    for (; i < pt2ds.length - 2; i++) {
                        const iDist = pt2ds[i + 1].y - pt2ds[i].y;
                        const jDist = Math.abs(pt2ds[i + 2].y - pt2ds[i + 1].y);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1; // 如果iDist < 0是曲线与surf参数域方向同向，case1的情况；>0是反向，case2的情况
                            break;
                        }
                    }

                    // 没找到断开位置，判断最后一个是否断开（--------7----8---9----|10-------）
                    if (sign === 0) {
                        const iDist = pt2ds[i + 1].y - pt2ds[i].y;
                        const jDist = Math.abs(pt2ds[i].y - pt2ds[i - 1].y);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1;
                        } else {
                            i++;
                        }
                    }

                    hasBigDist = sign !== 0;
                    if (sign !== 0) {
                        if (sign > 0) i++; // 如果sign > 0调整后面的参数+period，从后一个开始调整；如果sign < 0,调整前面的参数+period，从当前的开始调整
                        while (i >= 0 && i < pt2ds.length) {
                            pt2ds[i].y += period;
                            i += sign;
                        }
                    }
                }
            }

            // curve2d的点整体出了周期域，移动到周期内
            if (Math.min(pt2ds[0].y, pt2ds[pt2ds.length - 1].y) > period - Tol.NUMBER) {
                for (const pt2d of pt2ds) {
                    pt2d.y -= period;
                }
            } else if (Math.max(pt2ds[0].y, pt2ds[pt2ds.length - 1].y) < Tol.NUMBER) {
                for (const pt2d of pt2ds) {
                    pt2d.y += period;
                }
            }
        }

        const dirVect = pt2ds[pt2ds.length - 1].subtracted(pt2ds[0]);
        if (dirVect.isZero()) {
            // 如果起点和终点相同，要么是0长直线（很多个点都聚集在一起）；要么是周期性曲线，或者也可能是往复直线（往复直线的情况暂不考虑，因为没法表示，nurbs拟合也不一定处理得好）
            for (let i = 1; i < pt2ds.length; i++) {
                const tmpVect = pt2ds[i].subtracted(pt2ds[0]);
                if (tmpVect.getSqLength() > Tol.LENGTH_2) {
                    return NurbsCurve2.makeByInterpolationPts(pt2ds);
                }
            }

            return new Ln2(pt2ds[0], pt2ds[pt2ds.length - 1]);
        }
        const lineDir = dirVect.normalized();

        let isLine = true;
        for (let i = 1; i < pt2ds.length; i++) {
            const tmpDir = pt2ds[i].subtracted(pt2ds[0]).normalize();
            if (!lineDir.isParallel(tmpDir, Tol.ANGLE)) {
                isLine = false;
                break;
            }
        }
        if (isLine) {
            return new Ln2(pt2ds[0], lineDir, [0, dirVect.getLength()]);
        }

        return NurbsCurve2.makeByInterpolationPts(pt2ds);
    }

    /**
     * 将参数域中的二维曲线映射到曲面上的三维曲线
     * @param curve 二维参数域曲线 // 对于NurbsSurface，请保证二维曲线在surface的domain内
     */
    public getCurve3d(curve: Curve2): Curve3 {
        const vec3s = DiscreteUtil.discreteCurve2dOnSurface(curve, this, DiscreteParam.CALCULATE).points;
        return new SmoothPoly3(vec3s);
    }

    // 外部调用时，请保证loop3d首尾连接且封闭（其实就是一个三维封闭的环），就能得到一个封闭的参数域loop2d
    public wireToUV(loop3d: Curve3[], tol = Tol.DEFAULT): { loop: Curve2[]; mapping: Map<Curve3, Curve2> } {
        const map = new Map<Curve3, Curve2>();
        const loop2d = loop3d.map(crv3d => {
            const crv2d = this.getCurve2d(crv3d);
            map.set(crv3d, crv2d);
            return crv2d;
        });

        SurfaceUtil.unifyCurve2dUVBetweenCurves(loop3d, this, loop2d, tol);
        return { loop: loop2d, mapping: map };
    }

    /**
     *  the firs fundamental form: E, F, G
     * @param u
     * @param v
     * @return [E, F, G]
     */
    public firstFundamentalForm(uv: types.IXY): number[] {
        const duv = this.getDerivatives(uv, 1);
        const E = duv[1].dot(duv[1]);
        const F = duv[1].dot(duv[2]);
        const G = duv[2].dot(duv[2]);
        return [E, F, G];
    }

    public tessellate(
        params = DiscreteParam.NORMAL,
        tol = Tol.DEFAULT,
    ): types.IRenderNode {
        const mesh = this.discrete(params, tol);

        const surfRangeU = this.getDomainU();
        surfRangeU.min = Math.max(surfRangeU.min, -1000);
        surfRangeU.max = Math.min(surfRangeU.max, 1000);
        const surfRangeV = this.getDomainV();
        surfRangeV.min = Math.max(surfRangeV.min, -1000);
        surfRangeV.max = Math.min(surfRangeV.max, 1000);

        const cv1 = this.getIsoCurve(surfRangeV.min, true);
        cv1.setRange(surfRangeU);
        const cv2 = this.getIsoCurve(surfRangeU.max, false);
        cv2.setRange(surfRangeV);
        const cv3 = this.getIsoCurve(surfRangeV.max, true);
        cv3.setRange(surfRangeU);
        cv3.reverse();
        const cv4 = this.getIsoCurve(surfRangeU.min, false);
        cv4.setRange(surfRangeV);
        cv4.reverse();

        // const boundCurves = [cv1, cv2, cv3, cv4];
        return {
            mesh,
        };
    }

    public discrete(params = DiscreteParam.NORMAL, tol = Tol.DEFAULT): types.IMesh {
        const surfRangeU = this.getDomainU();
        surfRangeU.min = Math.max(surfRangeU.min, -1000);
        surfRangeU.max = Math.min(surfRangeU.max, 1000);
        const surfRangeV = this.getDomainV();
        surfRangeV.min = Math.max(surfRangeV.min, -1000);
        surfRangeV.max = Math.min(surfRangeV.max, 1000);
        const pts = [
            new Vec2(surfRangeU.min, surfRangeV.min),
            new Vec2(surfRangeU.max, surfRangeV.min),
            new Vec2(surfRangeU.max, surfRangeV.max),
            new Vec2(surfRangeU.min, surfRangeV.max),
        ];
        const boundCurve2ds = [
            { pCurve: new Ln2(pts[0], pts[1]) },
            { pCurve: new Ln2(pts[1], pts[2]) },
            { pCurve: new Ln2(pts[2], pts[3]) },
            { pCurve: new Ln2(pts[3], pts[0]) },
        ];
        const mesh = DiscreteUtil.discreteSurface(this, [boundCurve2ds], true, params, tol);
        return mesh;
    }

    protected _containsBaseCurve(curve: Curve3, tol: number = Tol.LENGTH): boolean {
        if (curve.isLine3d()) {
            // 只判断首末端点不对，可能首末端点正好在曲面上，但中间都不在
            return (
                this.containsPt(curve.getStartPt(), tol) &&
                this.containsPt(curve.getEndPt(), tol) &&
                this.containsPt(curve.getMidPt(), tol)
            );
        }
        if (curve.isArc3d()) {
            return (
                this.containsPt(curve.getPtAt(0), tol) &&
                this.containsPt(curve.getPtAt(CONST.PI), tol) &&
                this.containsPt(curve.getPtAt(CONST.PI_2), tol) &&
                this.containsPt(curve.getPtAt(CONST.PI_2 * 3), tol)
            );
        }
        if (curve.isNurbsCurve3d()) {
            const nurbs3d = curve as NurbsCurve3;
            const isLine = nurbs3d.getCoincideLine();
            return (
                isLine !== undefined &&
                this.containsPt(nurbs3d.getStartPt(), tol) &&
                this.containsPt(nurbs3d.getEndPt(), tol) &&
                this.containsPt(curve.getMidPt(), tol)
            );
            // 圆弧的情况比较麻烦，暂时也用不到，暂不考虑
        }

        return false;
    }
}

export { Surface };