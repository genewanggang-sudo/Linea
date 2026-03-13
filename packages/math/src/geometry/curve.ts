import { CONST } from '../type_define/const';
import { Interval } from '../base/interval';
import { Vec } from '../base/vec';
import { DiscreteParam } from '../base/discrete_param';
import { types } from '../type_define/i_types';
import { Tol } from '../base/tol';
import { PeriodInterval } from '../base/period_inverval';
import { GeoElement } from '../base/geo_element';
import { MathAssert } from '../util/assert';
import { DiscreteCurve } from '../algorithm/discrete/discrete_curve';
import { gaussIntegration } from '../math/gauss_integration';
import { MathError } from '../util/math_error';



/**
 * @author tiansk
 * 参数曲线的基类
 */
abstract class Curve<PointType extends Vec> extends GeoElement {
    // 参数域
    protected _range: Interval = Interval.infinit();

    constructor() {
        super();
    }

    /**
     * 获取某参数对应的点
     */
    public abstract getPtAt(t: number): PointType;

    /**
     * 获取某点（点也可以不在曲线上）对应的参数t（不限参数域）
     */
    public abstract getParamAt(point: types.IXY | PointType): number;

    /**
     * 获得曲线在参数域 rRange 上的切向锥
     * @param range 参数域
     * @param bApprox true = 近似切向锥；false = 精确切向锥
     */
    // public abstract getTangentCone(range: Interval, bApprox: boolean): TangentCone;

    /**
     * 获取某参数t处的几阶导数，例如 n = 2 时，会返回曲线在参数t处的坐标、1阶导、2阶导
     * @param t 参数
     * @param n 需要计算的导数的最大阶数
     * @param snapToPreviousEnd 参数点在奇异点附近时，当输入为true时返回奇异点的前导数，false时返回奇异点的后导数。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public abstract getDerivatives(t: number, n: number, snapToPreviousEnd?: boolean): PointType[];

    /**
     *  反向，改变自己
     */
    public abstract reverse(): this;

    /**
     * 依据给定参数点，将曲线分割成多段。如果参数点都不在曲线上，则返回空的数组
     * @param param
     * @param tolerance
     */
    public abstract split(params: number[], tolerance?: number): Curve<PointType>[];

    /**
     * 获取某点在曲线上的所有垂足点的参数t
     * 备注：此外，在pt_to_curve3d_distance.ts文件中，包装了一个getFootPointInRange函数，直接计算range内最小距离垂足点的函数，比计算所有的比较垂足然后取最小效率更高
     */
    public getAllFootParams(point: types.IXY | PointType, _lengthEps = Tol.LENGTH): number[] {
        MathAssert.warn(false, `${this.constructor.name}.getAllFootParams() not supported yet`);
        return [this.getParamAt(point)];
    }

    /**
     * 计算给定点的参数
     * @param thePt 要反求参数的point
     * @param refT 给一个参考的参数
     * @param lengthEps 反求参数的精度容差
     * @param validLength 如果需要验证求到的参数是否距离给定参考的参数refT太远，如果距离太远可能是计算的参数不准，用其他方法计算所有的参数，选一个最近的参数
     */
    public getParamNearT(
        thePt: types.IXY | PointType,
        refT: number,
        lengthEps: number = Tol.LENGTH,
        angleEps: number = Tol.ANGLE,
        validLength?: number,
    ): number {
        const dfx = this.getDerivatives(refT, 1)[1];
        const paramEps = lengthEps / dfx.getLength();
        const dSinAngleEps = Math.sin(angleEps);
        const sqrDistEps = lengthEps * lengthEps;

        let getFootT = false;
        let tmpT = refT;
        if (!(this._range instanceof PeriodInterval)) {
            tmpT = this.getDomain().clamp(tmpT);
        }
        let iter = 0;
        for (; iter < CONST.NORMAL_ITER_NUM; iter++) {
            const dvts = this.getDerivatives(tmpT, 2);
            const vect = dvts[0].subtracted(thePt);
            const func = vect.dot(dvts[1]);
            // 已经满足垂直条件
            if (vect.getSqLength() < sqrDistEps || Math.abs(func) < dSinAngleEps) {
                getFootT = true;
                break;
            }

            const df = dvts[1].dot(dvts[1]) + dvts[2].dot(dvts[0].subtracted(thePt));
            if (df === 0) {
                getFootT = false;
                break;
            }
            const deltaT = func / df;

            tmpT -= deltaT;
            if (!(this._range instanceof PeriodInterval)) {
                tmpT = this.getDomain().clamp(tmpT);
            }
            // if (i >= CONST.NORMAL_ITER_NUM) {
            //     const newDvts = this.getDerivatives(tmpT, 1);
            //     const newVect = newDvts[0].subtracted(thePt);
            //     const newFunc = newVect.dot(newDvts[1]);
            //     bIsDecrease = Math.abs(newFunc) < Math.abs(func) - Tol.CALCULATE_EPS; // 如果迭代趋势收敛(距离0更近了)，继续迭代
            // }

            if (Math.abs(deltaT) < paramEps || iter > 40) {
                const newDvts = this.getDerivatives(tmpT, 1);
                const newVect = newDvts[0].subtracted(thePt);
                const newFunc = newVect.dot(newDvts[1]);
                getFootT = newVect.getSqLength() < sqrDistEps || Math.abs(newFunc) < dSinAngleEps;
                break;
            }
        }

        if (getFootT) {
            if (!validLength) {
                return tmpT;
            }
            if (Math.abs(tmpT - refT) < validLength) {
                return tmpT;
            }

            const range = this.getRange();
            if (range instanceof PeriodInterval) {
                const param = range.getRegularParam(tmpT);
                if (Math.abs(param - refT) < validLength) {
                    return param;
                }
                if (Math.abs(param - range.period - refT) < validLength) {
                    return param - range.period;
                }
                if (Math.abs(param + range.period - refT) < validLength) {
                    return param + range.period;
                }
            }
        }

        const params = this.getAllFootParams(thePt);
        // if (this.getRange() instanceof PeriodInterval) {
        //     const period = (this.getRange() as PeriodInterval).period;
        //     const paramsLength = params.length;
        //     for (let i = 0; i < paramsLength; i++) {
        //         params.push(params[i] + period);
        //     }
        // }
        if (params.length > 0) {
            let minDistT = params[0];
            let minDist = Math.abs(minDistT - refT);
            for (let i = 1; i < params.length; i++) {
                const tmpDist = Math.abs(params[i] - refT);
                if (tmpDist < minDist) {
                    minDist = tmpDist;
                    minDistT = params[i];
                }
            }
            return minDistT;
        }

        return this.getParamAt(thePt);
    }

    /**
     * 判断该曲线是否为周期曲线
     */
    public isPeriodic(): boolean {
        return this._range instanceof PeriodInterval;
    }

    /**
     * 判断该曲线是否为直线
     * @returns
     */
    public isLineLike(): boolean {
        return false;
    }

    /**
     * 反向，得到一个新的曲线对象
     */
    public reversed(): Curve<PointType> {
        return this.clone().reverse();
    }

    /**
     * 获取曲线起点
     */
    public getStartPt(): PointType {
        const startT = this.getStartParam();
        return this.getPtAt(startT);
    }

    /**
     * 获取曲线末点
     */
    public getEndPt(): PointType {
        const endT = this.getEndParam();
        return this.getPtAt(endT);
    }

    /**
     * 获取曲线中点
     */
    public getMidPt(): PointType {
        return this.getPtAt(this.getRange().getMid());
    }

    /**
     *  获取曲线(给定参数域区间段的)长度
     */
    public getLength(range?: Interval): number {
        if (this.isSmoothPoly2d() || this.getSingularities().length > 0) {
            // 不连续的curve不能积分
            const pts = DiscreteCurve.general(
                t => this.getPtAt(t),
                t => this.getTangentAt(t),
                (range || this._range).toArray(),
                this.getSingularities(),
                DiscreteParam.HIGH,
            );

            let len = 0;
            for (let i = 1; i < pts.length; i++) {
                len += pts[i - 1].point.subtract(pts[i].point).getLength();
            }

            return len;
        }

        // 积分计算
        const theRange = range || this.getRange();
        const inteFunc = (t: number) => {
            const dvts = this.getDerivatives(t, 1);
            return Math.sqrt(dvts[1].dot(dvts[1]));
        };
        const length = gaussIntegration(inteFunc, theRange.min, theRange.max, 1.0e-6, 1.0e-6);
        return length;
    }

    /**
     * 离散成点集
     */
    public discrete(params = DiscreteParam.NORMAL): PointType[] {
        return [this.getStartPt(), this.getEndPt()];
    }

    /**
     * 获取曲线的domain
     */
    public getDomain(): Interval {
        return Interval.infinit();
    }

    /**
     * 获取曲线起点处参数值
     */
    public getStartParam(): number {
        return this.getRange().min;
    }

    /**
     * 获取曲线末点处参数值
     */
    public getEndParam(): number {
        return this.getRange().max;
    }

    /**
     * 获取起点处的切线
     */
    public getStartTangent(): PointType {
        return this.getTangentAt(this.getStartParam(), false);
    }

    /**
     * 获取末点处的切线
     */
    public getEndTangent(): PointType {
        return this.getTangentAt(this.getEndParam(), true);
    }

    /**
     * 获取中点处的切线
     */
    public getMidTangent(): PointType {
        return this.getTangentAt(this.getRange().getMid());
    }

    /**
     *  获取某参数处的切线
     * @param t 参数
     * @param snapToPreviousEnd 参数点在奇异点附近时，当输入为true时返回奇异点前的切向量，false时返回奇异点后的切向量。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public getTangentAt(t: number, snapToPreviousEnd?: boolean): PointType {
        const snapPre = this._getSnapToPrevious(t, snapToPreviousEnd);
        const eps2 = Tol.LENGTH_2;

        const tan0 = this.getDerivatives(t, 1, snapPre)[1];
        {
            const sqLen = tan0.getSqLength();

            if (sqLen > eps2) {
                const ret = tan0.multiply(1 / Math.sqrt(sqLen));
                return ret;
            }
        }

        let dt = Tol.NUMBER;
        const snapSign = snapPre ? 1 : -1;
        const p0 = this.getPtAt(t);
        const domain = this.getDomain();

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const t1 = t - dt * snapSign;
            if (!domain.containsPt(t1)) break;

            const p1 = this.getPtAt(t1);
            const tan = p0.subtracted(p1) as PointType;
            const sqLen = tan.getSqLength();

            if (sqLen > eps2) {
                const ret = tan.multiply(snapSign / Math.sqrt(sqLen));
                return this._refineDegerateTangent(t, snapPre, ret);
            }
            dt *= 10;
            if (domain instanceof PeriodInterval && domain.period < dt) break;
        }
        MathAssert.warn(false, 'Curve failed to get tangent');
        return tan0;
    }

    /**
     * 获取奇异点
     */
    public getSingularities(): number[] {
        return [];
    }

    /**
     * 从几何上判断该点是否是起点
     * @param point
     */
    public isStartPt(point: types.IXY | PointType, tolerance = Tol.LENGTH): boolean {
        return this.getStartPt().equals(point, tolerance);
    }

    /**
     * 从几何上判断该点是否是末点
     * @param point
     */
    public isEndPt(point: types.IXY | PointType, tolerance = Tol.LENGTH): boolean {
        return this.getEndPt().equals(point, tolerance);
    }

    /**
     * point投影在curve上的点p是否在曲线上
     * @param point
     */
    public containsProjectedPt(point: types.IXY | PointType, tolerance = Tol.LENGTH): boolean {
        const param = this.getParamAt(point);
        return this._range.containsPt(param);
    }

    /**
     * 是否包含某个点, 即某点是否在该曲线段上
     */
    public containsPt(point: types.IXY | PointType, tolerance = Tol.LENGTH): boolean {
        const sqrEps = tolerance * tolerance;
        // 1.判断端点的距离
        if (this.getStartPt().sqDistanceTo(point) < sqrEps || this.getEndPt().sqDistanceTo(point) < sqrEps) {
            return true;
        }
        // 2.判断垂直距离
        const param = this.getParamAt(point);
        const d = this.getPtAt(param).sqDistanceTo(point);
        if (d > sqrEps) {
            return false;
        }

        // 3.判断参数域
        return this._range.containsPt(param, tolerance);
    }

    /**
     * 点到曲线的垂足
     */
    public getProjectedPtBy(point: types.IXY | PointType) {
        const p = this.getParamAt(point);
        return this.getPtAt(p);
    }

    /**
     * 计算距离迭代方法函数：从给定参数出发，迭代求取最近的垂足的点；如果没有垂足点返回undefined。(二维三维曲线通用)
     * @param point 目标点
     * @param param0 迭代的初始参数
     * @param paramEps 参数的迭代终止误差
     */
    public getFootByIterate(
        point: types.IXY | PointType,
        param0?: number,
        distEps = Tol.LENGTH,
        angleEps = Tol.ANGLE,
        clampParam = true,
    ): number | undefined {
        let iter = 0;
        let t = param0 !== undefined ? param0 : this._range.getMid();
        let dvts: PointType[] = this.getDerivatives(t, 2);
        let vect: PointType = dvts[0].subtracted(point) as PointType;
        const dotEps = Math.sin(angleEps);
        const processDistEps = distEps * 1e-2;
        const processDistEps2 = processDistEps * processDistEps;
        const maxDt = (this._range instanceof PeriodInterval ? this._range.period : this.getDomain().getLength()) / 4;

        do {
            const fx: number = vect.dot(dvts[1]);
            const df2 = dvts[1].dot(dvts[1]) + vect.dot(dvts[2]);

            if (Math.abs(df2) < processDistEps2) {
                break;
            }

            let deltaT = fx / df2;
            if (Math.abs(deltaT) > maxDt) {
                deltaT = maxDt * Math.sign(deltaT);
            }

            const t0 = t;
            t = t0 - deltaT;
            if (clampParam) {
                t = this.getDomain().clamp(t);
            }

            const p0 = dvts[0];
            dvts = this.getDerivatives(t, 2);
            vect = dvts[0].subtracted(point) as PointType;

            if (p0.sqDistanceTo(dvts[0]) < processDistEps2) {
                break;
            }

            iter++;
        } while (iter < CONST.NORMAL_ITER_NUM);

        // 因为vect是点之间的距离，用LENGTH_EPS || 判断是否垂直，拉回到边界的情况不垂直，不是垂足点
        if (vect.isZero(distEps) || Math.abs(dvts[1].normalized().dot(vect.normalized())) < dotEps) {
            return t;
        }

        return undefined;
    }

    /**
     * 二分+迭代方法：从给定参数出发，迭代求取最近的垂足的点；如果没有垂足点返回undefined。(二维三维曲线通用)
     * @param point 目标点
     * @param param0 迭代的初始参数
     * @param paramEps 参数的迭代终止误差
     */
    public getFootByDichotomy(
        point: types.IXY | PointType,
        param1: number,
        param2: number,
        distEps = Tol.LENGTH,
        angleEps = Tol.ANGLE,
        clampParam = true,
    ): number | undefined {
        const dotEps = Math.sin(angleEps);
        const processDistEps = distEps * 1e-2;
        const processDistEps2 = processDistEps * processDistEps;
        const maxDt = (this._range instanceof PeriodInterval ? this._range.period : this.getDomain().getLength()) / 4;

        let t: number;
        const vect1 = this.getPtAt(param1).subtracted(point);
        let dot1 = this.getTangentAt(param1).dot(vect1);
        const vect2 = this.getPtAt(param2).subtracted(point);
        let dot2 = this.getTangentAt(param2).dot(vect2);
        if (dot1 * dot2 < 0) {
            let t1 = param1;
            let t2 = param2;
            for (let iter = 0; iter < 8; iter++) {
                t = (t1 + t2) / 2;
                const newVect = this.getPtAt(t).subtracted(point);
                if (newVect.getSqLength() < processDistEps2) {
                    return t;
                }
                const newDot = this.getTangentAt(t).dot(newVect);
                if (Math.abs(newDot) < dotEps) {
                    return t;
                }
                if (dot1 * newDot < 0) {
                    dot2 = newDot;
                    t2 = t;
                } else if (dot2 * newDot < 0) {
                    dot1 = newDot;
                    t1 = t;
                }
            }
            t = (t1 + t2) / 2;
        } else {
            t = (param1 + param2) / 2;
        }

        let dvts: PointType[] = this.getDerivatives(t, 2);
        let vect: PointType = dvts[0].subtracted(point) as PointType;
        let iter = 0;
        do {
            const fx: number = vect.dot(dvts[1]);
            const df2 = dvts[1].dot(dvts[1]) + vect.dot(dvts[2]);

            if (Math.abs(df2) < processDistEps2) {
                break;
            }

            let deltaT = fx / df2;
            if (Math.abs(deltaT) > maxDt) {
                deltaT = maxDt * Math.sign(deltaT);
            }

            const t0 = t;
            t = t0 - deltaT;
            if (clampParam) {
                t = this.getDomain().clamp(t);
            }

            const p0 = dvts[0];
            dvts = this.getDerivatives(t, 2);
            vect = dvts[0].subtracted(point) as PointType;

            if (p0.sqDistanceTo(dvts[0]) < processDistEps2) {
                break;
            }

            iter++;
        } while (iter < CONST.NORMAL_ITER_NUM);

        // 因为vect是点之间的距离，用LENGTH_EPS || 判断是否垂直，拉回到边界的情况不垂直，不是垂足点
        if (vect.isZero(distEps) || Math.abs(dvts[1].normalized().dot(vect.normalized())) < dotEps) {
            return t;
        }

        return undefined;
    }

    /**
     * 延伸曲线,若曲线参数域为[0,1]
     * > 从尾部增加1，参数域变为[0,2]
     *
     * > 从头部增加1，参数域变为[-1,1]
     * @param howLong 延伸长度
     * @param bTail 是否从尾部增加
     */
    public extend(howLong: number, bTail: boolean = true): this {
        if (bTail) {
            this._range.max += howLong;
        } else {
            this._range.min -= howLong;
        }
        return this;
    }

    /**
     * 从参数域的2端延伸曲线
     * @param howLong 延伸长度
     */
    public extendDouble(howLong: number): this {
        this._range.max += howLong;
        this._range.min -= howLong;

        return this;
    }

    /**
     * 获取参数域的拷贝
     */
    public getRange(): Interval {
        return this._range;
    }

    /**
     * 重设参数域
     */
    public setRange(min: number, max: number): this;

    /**
     * 重设参数域
     */
    public setRange(range: Interval): this;

    /**
     * 重设参数域
     */
    public setRange(a: number | Interval, max?: number): this {
        if (typeof a === 'number' && max !== undefined) {
            this._range.set(a, max);
        } else if (a instanceof Interval) {
            this._range.set(a.min, a.max);
        }
        return this;
    }

    /**
     * 设置参数域为单向或双向无穷
     * @param min
     */
    public setRangeInfinit(min?: number) {
        if (this._range instanceof PeriodInterval) {
            this._range.min = min || 0;
            this._range.max = this._range.min + this._range.period;
        } else {
            const domain = this.getDomain();
            this._range.set(min !== undefined ? min : domain.min, domain.max);
        }
    }

    /**
     * 设置参数域为单向无穷
     * @param min
     */
    public setRangeMaxInfinit() {
        if (this._range instanceof PeriodInterval) {
            this._range.max = this._range.min + this._range.period;
        } else {
            this._range.max = this.getDomain().max;
        }
    }

    /**
     * 设置参数域为单向无穷
     * @param min
     */
    public setRangeMinInfinit() {
        if (this._range instanceof PeriodInterval) {
            this._range.min = this._range.max + this._range.period;
        } else {
            this._range.min = this.getDomain().min;
        }
    }

    /**
     * 2曲线是否在几何上相等
     * > 返回值：
     * - 0不相等
     * - 1相等且方向相同
     * - -1相等且方向相反
     * @param another
     * @param torlerance
     */
    public equals(another: Curve<PointType>, torlerance: number = Tol.LENGTH): 0 | 1 | -1 {
        if (this.getType() !== another.getType()) {
            return 0;
        }

        // 比较中点
        if (!this.getMidPt().equals(another.getMidPt(), torlerance)) {
            return 0;
        }

        if (
            this.getStartPt().equals(another.getStartPt(), torlerance) &&
            this.getEndPt().equals(another.getEndPt(), torlerance)
        ) {
            return 1;
        }

        if (
            this.getStartPt().equals(another.getEndPt(), torlerance) &&
            this.getEndPt().equals(another.getStartPt(), torlerance)
        ) {
            return -1;
        }
        return 0;
    }

    public clone(): Curve<PointType> {
        return super.clone() as Curve<PointType>;
    }

    /**
     * 通过等分参数域来获得离散结果
     * @param segmentCount
     */
    public discreteBySegmentCount(segmentCount: number): PointType[] {
        const n = Math.ceil(segmentCount);
        const dt = (this._range.max - this._range.min) / n;
        const pts: PointType[] = [];
        for (let i = 0; i <= n; i++) {
            pts.push(this.getPtAt(i * dt + this._range.min));
        }
        // 结果可通过迭代来优化离散结果
        return pts;
    }

    /**
     * 获取插值点
     */
    public getInterpPts(lengthEps: number): { params: number[]; pts: Vec[] } {
        const params: number[] = [];
        const pts: Vec[] = [];

        // const params = [this._range.min, this._range.getMid(), this._range.max];
        // let sumCurtureRadius = 0;
        // for (const t of params) {
        //     const dvts = this.getDerivatives(t, 2);
        //     const curtureRadius = dvts[1].getSqLength() / dvts[2].getLength(); // 曲率半径，也就是半径大小
        //     sumCurtureRadius += curtureRadius;
        // }
        // const averageRadius = sumCurtureRadius / params.length;
        // const stepFactor = 1 / Math.log10(averageRadius);

        let t = this._range.min;
        while (t <= this._range.max) {
            const dvts = this.getDerivatives(t, 2);
            params.push(t);
            pts.push(dvts[0]);

            let tStep: number;
            const angleStep = 0.15;
            const curtureRadius = dvts[1].getSqLength() / dvts[2].getLength(); // 曲率半径，也就是半径大小

            if (curtureRadius > 10) {
                const stepFactor = 1 / Math.log10(curtureRadius);
                tStep = curtureRadius * angleStep * stepFactor;
                // } else if (curtureRadius > 0.1) {
                //     const estimatePt = dvts[0]
                //         .added(dvts[1].multiplied(angleStep))
                //         .add(dvts[2].multiplied((angleStep * angleStep) / 2)); // 当曲率半径比较大的时候，要考虑曲率方向的变化
                //     const stepVect = estimatePt.subtracted(dvts[0]);
                //     tStep = stepVect.dot(dvts[1].normalized());
            } else if (curtureRadius > 0.1) {
                tStep = curtureRadius * angleStep; // 当曲率半径很小的时候，不再加入步长因子，因为加入步长因子会使步长变长
            } else if (curtureRadius > 0.0001) {
                // 步长0.1001时，tStep = 0.015；步长为0.099时，步长为0.099。怎么均匀过渡
                // 也就是，随着步长变小，angleStep影响变弱。所以这个函数过点（0.1，0.15），并快速去掉0.15因子，（设到0.08的时候，变为1）用二次函数过渡的话，如下
                tStep = curtureRadius; // 步长选取必须与曲率半径有关，所以当曲率半径很小的时候，为了防止点过多，可以不要angleStep，但是还是要与半径有关，不能是固定的angleStep
            } else {
                MathError.warn('拟合的曲线自交！！');
                tStep = curtureRadius * 100;
            }

            const estimateT = t + tStep / dvts[1].getLength();
            t = estimateT;
        }
        params.push(this._range.max);
        pts.push(this.getPtAt(this._range.max));

        return { params, pts };
    }

    protected _tessellateByPoints(points: PointType[], name: string): types.IRenderEdge {
        const edges: types.numberArr3[][] = [];
        for (let index = 0; index < points.length - 1; index++) {
            edges.push([points[index].toArray3(), points[index + 1].toArray3()]);
        }

        return { edges };
    }

    protected _getSnapToPrevious(t: number, snapPre?: boolean): boolean {
        return snapPre === undefined ? Math.abs(t - this._range.min) > Tol.CALCULATE_EPS : snapPre;
    }

    protected _refineDegerateTangent(_t: number, _snapPre: boolean, tan: PointType): PointType {
        return tan;
    }
}

export { Curve };