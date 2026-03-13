import { CONST } from '../type_define/const';
import { PeriodInterval } from '../base/period_inverval';
import { MathAssert } from '../util/assert';
import { Interval } from '../base/interval';
import { Util } from '../util/util';
import { Tol } from '../base/tol';
import { Vec } from '../base/vec';
import { IArc, IOffsetCurve } from '../type_define/i_geometry';
import { SolveEquationUtil } from '../solve_equations/solve_equation_util';
import { NonlinearSystem } from '../solve_equations/nonlinear_system';
import { types } from '../type_define/i_types';
import { OffsetCurve3 } from './offset_curve3';
import { Vec3 } from '../base/vec3';
import { Vec2 } from '../base/vec2';



interface IDomain {
    min: number;
    baseMin: number;
    length: number;
    isReversed: boolean;
}

enum ExtendType {
    None = 0,
    Previous = 1,
    Next = 2,
}

/**
 * 参数种类。当映射结果为周期域中的非线性映射、或非周期域中的中间非线性映射部分为 MidGap；当映射结果为非周期定义域时，若小于定义域最小值则为 StartGap，若大于定义域最大值则为 EndGap；
 */
export enum ParamType {
    Normal = 0,
    Reversed = 1,
    StartGap = 2, // period === 0 时，参数小于最小定义域
    MidGap = 3,
    EndGap = 4, // period === 0 时，参数
}

export class OffsetParameterMapper {
    /**
     * 生成基于椭圆弧的偏置曲线的参数映射器
     * case 1. 正常周期曲线（dr > -rho_min || dr < -r_max）
     * case 2. 周期曲线，含 4 奇异点（-r_max < dr < -r_min)
     * case 3. 曲线自交，根据参数域进行裁剪和映射
     * case 3.1 两头裁剪的周期，含 2 奇异点
     * case 3.2 一端延长、一端裁剪的曲线，含 1 奇异点
     * case 3.3 两端延长的曲线
     * @param ofsCrv 待生成参数映射器的偏置曲线，需采用 Simple 映射器进行初始化。
     * @param arc
     * @param dr
     */
    public static ByArc<VectorType extends Vec>(
        ofsCrv: IOffsetCurve<VectorType>,
        arc: IArc<VectorType>,
        dr: number,
    ): OffsetParameterMapper {
        // 计算曲率半径
        const a = arc.getA();
        const b = arc.getB();
        const rhoA = (b * b) / a;
        const rhoB = (a * a) / b;

        // 1.1 正常周期曲线
        if (dr > -Math.min(rhoA, rhoB)) {
            return new OffsetParameterMapper(undefined, CONST.PI2, CONST.PI2, []);
        }

        // 1.2 反向周期曲线
        if (dr < -Math.max(a, b)) {
            const domain = { min: 0, baseMin: 0, length: CONST.PI2, isReversed: true };
            return new OffsetParameterMapper([domain], CONST.PI2, CONST.PI2, []);
        }

        // 2. 周期曲线，含 4 奇异点
        // （忽视奇异段自交）
        const func = (param: number): number => {
            return ofsCrv.getDerivatives(param, 1)[1].dot(arc.getTangentAt(param));
        };
        const solve = (t1: number, t2: number): number => {
            const _t2 = PeriodInterval.RegularizeParam(t2 - t1) + t1;
            return SolveEquationUtil.quadraticInterpolation(func, t1, _t2)!;
        };

        const sgl0 = solve(0, CONST.PI_2); // sigularity0
        const sgls = [sgl0, CONST.PI - sgl0, CONST.PI + sgl0, CONST.PI2 - sgl0, CONST.PI2 + sgl0];

        if (dr < -Math.min(a, b)) {
            const reverseMod = a > b ? 1 : 0;
            const domains: IDomain[] = [];
            for (let i = 0; i < 4; i++) {
                domains.push({
                    min: sgls[i],
                    baseMin: sgls[i],
                    length: sgls[i + 1] - sgls[i],
                    isReversed: i % 2 === reverseMod,
                });
            }
            return new OffsetParameterMapper(domains, CONST.PI2, CONST.PI2, sgls);
        }

        // 3. 曲线自交，根据周期域裁剪
        function extendDomainGap(domains: IDomain[], gapIndex: number, preSgl: number, curSgl: number): ExtendType {
            const n = domains.length;
            const preIndex = (gapIndex + n - 1) % n;
            const preDomain = domains[preIndex];
            const curDomain = domains[gapIndex];
            const preEnd = preDomain.baseMin + preDomain.length;
            const gapLen = PeriodInterval.RegularizeParam(curDomain.baseMin - preEnd);
            const range = arc.getRange();
            const stLen = PeriodInterval.RegularizeParam(range.min - preEnd);
            const edLen = PeriodInterval.RegularizeParam(range.max - preEnd);
            const stInGap = stLen > Tol.NUMBER && stLen < gapLen - Tol.NUMBER;
            const edInGap = edLen > Tol.NUMBER && edLen < gapLen - Tol.NUMBER;

            if (stInGap === edInGap) return ExtendType.None;

            if (stInGap) {
                const domainOfs = PeriodInterval.RegularizeParam(curDomain.baseMin - curSgl - Tol.NUMBER);
                curDomain.baseMin = curSgl;
                curDomain.length += domainOfs;

                for (let i = gapIndex + 1; i < n; i++) {
                    domains[i].min += domainOfs;
                }
                return ExtendType.Next;
            }

            // edInGap
            {
                const domainOfs = PeriodInterval.RegularizeParam(preSgl - preEnd - Tol.NUMBER);
                preDomain.length += domainOfs;

                for (let i = preIndex + 1; i < n; i++) {
                    domains[i].min += domainOfs;
                }
                return ExtendType.Previous;
            }
        }

        const r = -dr;
        let domains: IDomain[];
        let extended0: ExtendType;
        let extended1: ExtendType;

        if (a > b) {
            const sint2 = (((a / b) * r) ** 2 - b * b) / (a * a - b * b);
            const t = Math.asin(sint2 ** 0.5);
            const length = CONST.PI - 2 * t;
            domains = [
                { baseMin: t, min: 0, length, isReversed: false }, //
                { baseMin: CONST.PI + t, min: length, length, isReversed: false },
            ];
            extended0 = extendDomainGap(domains, 0, sgls[3], sgls[0]);
            extended1 = extendDomainGap(domains, 1, sgls[1], sgls[2]);
        } else {
            const cost2 = (((b / a) * r) ** 2 - a * a) / (b * b - a * a);
            const t = Math.acos(cost2 ** 0.5);
            domains = [
                { baseMin: CONST.PI - t, min: 0, length: t * 2, isReversed: false },
                { baseMin: CONST.PI2 - t, min: t * 2, length: t * 2, isReversed: false },
            ];
            extended0 = extendDomainGap(domains, 0, sgls[0], sgls[1]);
            extended1 = extendDomainGap(domains, 1, sgls[2], sgls[3]);
        }

        if (extended0 && extended1) {
            if (extended0 === ExtendType.Previous) {
                domains[1].min = 0;
                return new OffsetParameterMapper([domains[1]], 0, CONST.PI2, []);
            }
            return new OffsetParameterMapper([domains[0]], 0, CONST.PI2, []);
        }

        if (extended0) {
            return new OffsetParameterMapper(domains, 0, CONST.PI2, [domains[0].length]);
        }
        if (extended1) {
            domains[1].min = 0;
            domains[0].min = domains[1].length;
            domains[0].baseMin += CONST.PI2;
            return new OffsetParameterMapper([domains[1], domains[0]], 0, CONST.PI2, [domains[1].length]);
        }

        const len = domains[0].length;
        return new OffsetParameterMapper(domains, len * 2, CONST.PI2, [0, len]);
    }

    public static periodicBaseCurve<VectorType extends Vec>(
        ofsCrv: IOffsetCurve<VectorType>,
        offset: number,
    ): OffsetParameterMapper {
        const baseCurve = ofsCrv.getBaseCurve();
        const baseDomain = baseCurve.getDomain();
        let basePeriod: number;
        if (baseDomain instanceof PeriodInterval) {
            basePeriod = baseDomain.period;
        } else {
            return new OffsetParameterMapper();
        }

        const tangent0 = baseCurve.getTangentAt(baseDomain.min, false);
        const tangent1 = baseCurve.getTangentAt(baseDomain.max, true);
        if (tangent0.equals(tangent1)) {
            return new OffsetParameterMapper(undefined, basePeriod, basePeriod);
        }

        let angle: number;
        if (ofsCrv instanceof OffsetCurve3) {
            const dz = ofsCrv.getDz();
            //
            angle = (tangent1 as any as Vec3).angleTo(tangent0 as any as Vec3, dz);
        } else {
            //
            angle = (tangent1 as any as Vec2).angleTo(tangent0 as any as Vec2);
        }

        // 偏移之后自交，曲线还是封闭的，但是要处理自交
        if ((angle < CONST.PI && offset < 0) || (angle > CONST.PI && offset > 0)) {
            const stParam = baseDomain.min;
            const endParam = baseDomain.max;
            if (baseCurve.isNurbsCurve()) {
                ofsCrv.setRange(stParam, endParam); // （缩小）初始化一下参数域，防止无穷大参数域影响求交
            }

            let offCvDomain: IDomain | undefined;
            if (ofsCrv.isOffsetCurve3d()) {
                const xPtInfo = OffsetParameterMapper._calcSelfIntersect(ofsCrv, Tol.DEFAULT);
                if (xPtInfo) {
                    const params = [xPtInfo.param1, xPtInfo.param2];
                    if (params[0] > params[1]) {
                        [params[0], params[1]] = [params[1], params[0]];
                    }

                    const offCvPeirod = params[1] - params[0];
                    // 因为offset曲线是base曲线做offset得到的，因此，offset曲线的自交点处的参数，一定对应两个base curve的参数，
                    // 并且由于求交得到的正好自交位置两个参数，正好也就对应于base curve的两个参数。并且对应关系是一一对应的，因此参数值也一样。因此base curve的baseMin也就是params[0]
                    offCvDomain = { baseMin: params[0], min: 0, length: offCvPeirod, isReversed: false };
                }
            } else if (ofsCrv.isOffsetCurve2d()) {
                const xPtInfo = OffsetParameterMapper._calcSelfIntersect(ofsCrv, Tol.DEFAULT);
                if (xPtInfo) {
                    const params = [xPtInfo.param1, xPtInfo.param2];
                    if (params[0] > params[1]) {
                        [params[0], params[1]] = [params[1], params[0]];
                    }

                    const offCvPeirod = params[1] - params[0];
                    offCvDomain = { baseMin: params[0], min: 0, length: offCvPeirod, isReversed: false };
                }
            }

            if (offCvDomain) {
                return new OffsetParameterMapper([offCvDomain], offCvDomain.length, basePeriod, [offCvDomain.min]);
            }
        }

        // 偏移之后不自交，曲线就不能封闭了，不再是周期曲线
        return new OffsetParameterMapper();
    }

    public static Simple() {
        return new OffsetParameterMapper();
    }

    private static _calcSelfIntersect<VectorType extends Vec>(
        ofsCrv: IOffsetCurve<VectorType>,
        tol: Tol,
    ): { point: Vec; param1: number; param2: number } | undefined {
        const baseCv = ofsCrv.getBaseCurve();
        const baseDomain = baseCv.getDomain() as PeriodInterval;
        const stParam = baseDomain.min;
        const endParam = baseDomain.max;

        const func = (params: number[]): number[] => {
            // 因为base curve是周期性的，所以拉不拉回无所谓，都能计算偏导数。最好不要拉回，因为在0和1的位置有差别，第一次传入1会直接被拉回到0。
            // params[0] = ofsCrv.getDomain().clamp(params[0]);
            // params[1] = ofsCrv.getDomain().clamp(params[1]);
            const pts1 = ofsCrv.getDerivatives(params[0], 1);
            const pts2 = ofsCrv.getDerivatives(params[1], 1);
            const refVect = pts1[0].subtracted(pts2[0]);
            const fx: number[] = [refVect.dot(pts1[1]), refVect.dot(pts2[1])];
            return fx;
        };
        const calcJacbiFunc = (params: number[]): number[][] => {
            const pts1 = ofsCrv.getDerivatives(params[0], 2);
            const pts2 = ofsCrv.getDerivatives(params[1], 2);

            const refVect = pts1[0].subtracted(pts2[0]);
            const df1 = [pts1[1].dot(pts1[1]) + refVect.dot(pts1[2]), -pts2[1].dot(pts1[1])];
            const df2 = [pts1[1].dot(pts2[1]), -pts2[1].dot(pts2[1]) + refVect.dot(pts2[2])];
            return [df1, df2];
        };
        const validFunc = (params: number[], eps: number): boolean => {
            // 因为base curve是周期性的，只在最后处理一下，防止出现不再[0, 1]参数域的参数
            params[0] = PeriodInterval.RegularizeParam(params[0], baseDomain.period);
            params[1] = PeriodInterval.RegularizeParam(params[1], baseDomain.period);

            const pt1 = ofsCrv.getPtAt(params[0]);
            const pt2 = ofsCrv.getPtAt(params[1]);
            const sqrDist = pt1.sqDistanceTo(pt2);
            return sqrDist < eps * eps;
        };

        const deltaT = baseCv.getDomain().getLength() / 11;
        for (let i = 0; i < 5; i++) {
            const ti = stParam + i * deltaT;
            for (let j = 0; j < 5; j++) {
                const tj = endParam - j * deltaT;
                if (ofsCrv.isOffsetCurve3d()) {
                    const resParams = NonlinearSystem.execute(
                        func,
                        calcJacbiFunc,
                        [ti, tj],
                        tol.lengthEps,
                        tol.angleEps,
                        validFunc,
                    );
                    if (resParams.length > 0 && Math.abs(resParams[1] - resParams[0]) > Tol.NUMBER) {
                        const pt = ofsCrv.getPtAt(resParams[0]);
                        return { point: pt, param1: resParams[0], param2: resParams[1] };
                    }
                } else if (ofsCrv.isOffsetCurve2d()) {
                    const resParams = NonlinearSystem.execute(
                        func,
                        calcJacbiFunc,
                        [ti, tj],
                        tol.lengthEps,
                        tol.angleEps,
                        validFunc,
                    );
                    if (resParams.length > 0 && Math.abs(resParams[1] - resParams[0]) > Tol.NUMBER) {
                        const pt = ofsCrv.getPtAt(resParams[0]);
                        return { point: pt, param1: resParams[0], param2: resParams[1] };
                    }
                }
            }
        }

        return undefined;
    }

    constructor(
        private _domains?: IDomain[],
        private _period = 0,
        private _basePeriod = 0,
        private _singularities: number[] = [],
    ) { }

    /**
     * 计算在基曲线上的参数
     * @param t 在映射曲线上的参数
     * @param snapToPreviousEnd true时吸附到前一段domain的末尾，false时吸附到后一段domain的起始
     */
    public getBaseParam(t: number, snapToPreviousEnd: boolean = true, eps = Tol.CALCULATE_EPS): number {
        if (!this._domains) return t;

        const t0 = this._period > 0 ? PeriodInterval.RegularizeParam(t, this._period) : t;

        let domainOffset;

        if (snapToPreviousEnd) {
            if (this._period > 0 && t0 < eps) {
                const last = this._domains[this._domains.length - 1];
                return last.baseMin + last.length;
            }
            domainOffset = eps;
        } else {
            if (this._period > 0 && t0 > this._period - eps) {
                return this._domains[0].baseMin;
            }
            domainOffset = -eps;
        }

        for (const domain of this._domains) {
            const dt = t0 - domain.min;
            if (dt < domain.length + domainOffset) {
                return domain.baseMin + dt;
            }
        }

        MathAssert.warn(true, 'Invalid t', t);

        const last = this._domains[this._domains.length - 1];
        return t - last.min + last.baseMin;
    }

    /**
     * 计算在映射曲线上的参数
     * @param baseT 在基曲线上的参数
     * @param snapToPreviousEnd true时吸附到前一段domain的末尾，false时吸附到后一段domain的起始
     */
    public getParam(baseT: number, snapToPreviousEnd: boolean = true): number {
        return this.getParamInfo(baseT, snapToPreviousEnd).param;
    }

    /**
     * 计算在映射曲线上的参数，并返回参数种类信息
     * @param baseT
     * @param snapToPreviousEnd 当基曲线为周期曲线时，若 bastT 位于首尾 gap 处：当传入参数为 true 时吸附到前一段domain的末尾，false时吸附到后一段domain的起始
     */
    public getParamInfo(baseT: number, snapToPreviousEnd: boolean = true): { param: number; type: ParamType } {
        if (!this._domains) {
            return { param: baseT, type: ParamType.Normal };
        }

        const baseT0 =
            this._basePeriod > 0
                ? PeriodInterval.RegularizeParam(baseT, this._basePeriod, this._domains[0].baseMin)
                : baseT;

        const periodOfs = this._basePeriod > 0 ? ((baseT - baseT0) / this._basePeriod) * this._period : 0;

        for (let i = 0; i < this._domains.length; i++) {
            const domain = this._domains[i];
            const dbt = baseT0 - domain.baseMin;
            if (dbt < 0) {
                return {
                    param: domain.min + periodOfs,
                    type: i === 0 ? ParamType.StartGap : ParamType.MidGap,
                };
            }
            if (dbt <= domain.length) {
                return {
                    param: dbt + domain.min + periodOfs,
                    type: domain.isReversed ? ParamType.Reversed : ParamType.Normal,
                };
            }
        }

        if (this._basePeriod === 0 || snapToPreviousEnd) {
            const lastD = this._domains[this._domains.length - 1];
            return {
                param: lastD.min + lastD.length + periodOfs,
                type: this._period === 0 ? ParamType.EndGap : ParamType.MidGap,
            };
        }
        return {
            param: this._domains[0].min + periodOfs,
            type: this._period === 0 ? ParamType.StartGap : ParamType.MidGap,
        };
    }

    public isPeriod(): boolean {
        return this._period > 0;
    }

    public getPeriod(): number {
        return this._period;
    }

    public getBasePeriod(): number {
        return this._basePeriod;
    }

    public getRange(baseRange: Interval | types.IInterval): Interval {
        const [bMin, bMax] = baseRange instanceof Interval ? baseRange.toArray() : baseRange;
        const min = this.getParam(bMin, false);
        const max = this.getParam(bMax, true);

        if (this._period > 0) {
            const ma =
                Util.isNearlyEqual(min, max, Tol.NUMBER) && bMax - bMin > this._basePeriod / 2
                    ? min + this._period
                    : max;
            return new PeriodInterval(min, ma, this._period);
        }
        return new Interval(min, max);
    }

    public getSingularities(): number[] {
        return this._singularities.slice(0);
    }

    public getDomain(): Interval {
        if (!this._domains) {
            return this._period ? new PeriodInterval(0, this._period, this._period) : Interval.infinit();
        }

        const domain = this._domains[this._domains.length - 1];

        if (this._period) {
            return new PeriodInterval(this._domains[0].min, domain.min + domain.length, this._period);
        }

        return new Interval(this._domains[0].min, domain.min + domain.length);
    }

    public clone(): OffsetParameterMapper {
        const domains = this._domains?.map(d => {
            return { min: d.min, baseMin: d.baseMin, length: d.length, isReversed: d.isReversed };
        });
        return new OffsetParameterMapper(domains, this._period, this._basePeriod, this._singularities.slice(0));
    }
}