import { Loader } from '../loader/loader';
import { Vec2 } from '../base/vec2';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { OffsetParameterMapper, ParamType } from './offset_parameter_mapper';
import { Curve2 } from './curve2';
import { Ln2 } from './ln2';
import { Arc2 } from './arc2d';
import { PeriodInterval } from '../base/period_inverval';
import { ICurve2dTransformExtra, IOffsetCurve } from '../type_define/i_geometry';
import { Matrix3 } from '../base/matrix3';
import { Tol } from '../base/tol';
import { NurbsCurve2 } from './nurbs_curve2';
import { Util } from '../util/util';



@registerGeo
export class OffsetCurve2 extends Curve2 implements IOffsetCurve<Vec2> {
    public static makeByOffset(curve: Curve2, offset: number = 0): Curve2 {
        if (curve instanceof Ln2) {
            const o = curve.getOrigin();
            const dir = curve.getDirection();
            const o1 = { x: o.x + dir.y * offset, y: o.y - dir.x * offset };
            return new Ln2(o1, dir, curve.getRange().toArray());
        }

        if (curve instanceof Arc2 && curve.isEqualAB()) {
            const r = offset + (curve.getA() + curve.getB()) / 2;
            return new Arc2(curve.getCoord(), r, r, curve.isCCW(), curve.getRange().toArray());
        }

        if (curve instanceof OffsetCurve2) {
            const ofs = curve.getOffset() + offset;
            const ret = new OffsetCurve2(curve.getBaseCurve().clone(), ofs);

            if (!curve.getStartPt().equals(curve.getEndPt(), Tol.LENGTH)) {
                const mapper = curve.getParamMapper();
                const range0 = curve.getRange();

                const baseSt = mapper.getBaseParam(range0.min, false);
                const baseEd = mapper.getBaseParam(range0.max, true);

                const newMapper = ret.getParamMapper();
                const newSt = newMapper.getParam(baseSt);
                const newEd = newMapper.getParam(baseEd);

                ret.setRange(newSt, newEd);
            }

            return ret;
        }
        return new OffsetCurve2(curve.clone(), offset);
    }

    private _paramMapper: OffsetParameterMapper;

    private _baseCurve: Curve2;

    private _offset: number;

    constructor(curve?: Curve2, offset: number = 0, range?: types.IInterval) {
        super();
        if (curve) {
            this._baseCurve = curve;
            this._offset = offset;
            this._updateParamMapper();
            this._initRange(range);
        }
    }

    /**
     * curve should be emutable!
     */
    public getBaseCurve(): Curve2 {
        return this._baseCurve;
    }

    public getParamMapper(): OffsetParameterMapper {
        return this._paramMapper;
    }

    public getDomain(): Interval {
        if (this._baseCurve instanceof NurbsCurve2 && !this.isPeriodic()) {
            // 不是周期的，且是nurbs曲线，domain不能是无穷大的
            const baseDomain = this._baseCurve.getDomain();
            return new Interval(baseDomain.min, baseDomain.max);
        }
        return this._paramMapper.getDomain();
    }

    /**
     * 判断该曲线是否为周期曲线
     */
    public isPeriodic(): boolean {
        const baseCurve = this._baseCurve;
        if (
            baseCurve instanceof Arc2 &&
            Math.abs(baseCurve.getRange().getLength() - CONST.PI2) < Tol.ANGLE
        ) {
            return true;
        }
        if (baseCurve instanceof NurbsCurve2) {
            const ctrlPts = baseCurve.getControlPoints();
            if (ctrlPts[0].sqDistanceTo(ctrlPts[ctrlPts.length - 1]) < Tol.LENGTH_2) {
                return true;
            }
        }
        return false;
    }

    /**
     * 判断该曲线是否为直线
     * @returns
     */
    public isLineLike(): boolean {
        return this._baseCurve.isLineLike();
    }

    public getOffset(): number {
        return this._offset;
    }

    public setOffset(offset: number) {
        const info = this._startSettingChange();
        this._offset = offset;
        this._updateParamMapper();
        this._endSettingChange(info);
    }

    public getPtAt(t: number): Vec2 {
        const bt = this._paramMapper.getBaseParam(t);
        const p0 = this._baseCurve.getPtAt(bt);
        const tan = this._baseCurve.getTangentAt(bt).normalize();
        return p0.add({ x: tan.y * this._offset, y: -tan.x * this._offset });
    }

    public getParamAt(point: types.IXY): number {
        const possibleParams = [this._range.min, this._range.max];
        possibleParams.push(...this.getSingularities());
        if (this._baseCurve.isPeriodic() && !this.isPeriodic()) {
            // 如果baseCurve是周期的，offsetCurve是非周期的，在offsetCurve的起点或者终点位置，反求参数可能求在0或者peirod位置
            const domain = this._baseCurve.getDomain();
            possibleParams.push(domain.min, domain.max);
        }
        for (const t of possibleParams) {
            if (this.getPtAt(t).equals(point)) {
                return t;
            }
        }

        const bt = this._baseCurve.getParamAt(point);
        const ret = this._paramMapper.getParam(bt);
        const range = this._range;
        return range instanceof PeriodInterval ? range.getRegularParam(ret) : ret;
    }

    public getAllFootParams(point: types.IXY, lengthEps = Tol.LENGTH): number[] {
        const baseTs = this._baseCurve.getAllFootParams(point, lengthEps);
        const ret: number[] = [];
        for (const baseT of baseTs) {
            const info = this._paramMapper.getParamInfo(baseT);
            if (info.type === ParamType.Normal) ret.push(info.param);
        }
        return ret;
    }

    /**
     * 获取某参数t处的几阶导数，例如 n = 2 时，会返回曲线在参数t处的坐标、1阶导、2阶导
     * @param t 参数
     * @param n 需要计算的导数的最大阶数
     * @param snapToPreviousEnd true时吸附到前一段domain的末尾，false时吸附到后一段domain的起始。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public getDerivatives(t: number, nth: number, snapToPreviousEnd?: boolean): Vec2[] {
        const snapPre = this._getSnapToPrevious(t, snapToPreviousEnd);
        const bt = this._paramMapper.getBaseParam(t, snapPre);
        const ds = this._baseCurve.getDerivatives(bt, nth + 1, snapPre);

        const L = (x: Vec2, k: number): Vec2 => {
            const r = this._offset * k;
            return new Vec2(x.y * r, -x.x * r);
        };
        const sqr = ds[1].getSqLength();
        const sqrt = Math.sqrt(sqr);
        const part01 = L(ds[1], 1 / sqrt);
        const ret = [ds[0].added(part01)];
        if (nth <= 0) return ret;

        const sum = ds[1].dot(ds[2]);
        const num = L(ds[2], sqr).subtract(L(ds[1], sum));
        const den = sqr * sqrt;
        ret.push(ds[1].added(num.multiplied(1 / den)));
        if (nth <= 1) return ret;

        const dsum = ds[1].dot(ds[3]) + ds[2].dot(ds[2]);
        const dnum = L(ds[3], sqr).add(L(ds[2], sum)).add(L(ds[1], -dsum));
        const dden = 3 * sqrt * sum;
        const part2 = dnum
            .multiplied(den)
            .subtract(num.multiplied(dden))
            .multiply(1 / (den * den));
        ret.push(ds[2].added(part2));

        if (nth <= 2) return ret;

        const ddsum = ds[1].dot(ds[4]) + 3 * ds[2].dot(ds[3]);
        const ddnum = L(ds[4], sqr)
            .add(L(ds[3], 3 * sum))
            .subtract(L(ds[1], ddsum));
        const ddden = (3 * sum * sum) / sqrt + 3 * sqrt * ddsum;
        const part31 = ddnum
            .multiplied(den)
            .subtract(num.multiplied(ddden))
            .multiply(1 / (den * den));
        const part32 = part2.multiplied((-2 * dden) / den);
        ret.push(ds[3].added(part31).add(part32));
        if (nth <= 3) return ret;

        throw new Error('unimplemented: Offset Curve derivatives: nth > 3 not supported yet');
    }

    public getSingularities(): number[] {
        const sgls = this._paramMapper.getSingularities();
        return this._range.filterParams(sgls);
    }

    public getContinuousRanges(): Interval[] {
        const ps = this._paramMapper.getSingularities();
        return this._range.splited(...ps);
    }

    public reverse(): this {
        const isClosed = this._range instanceof PeriodInterval && this._range.isClosed();
        const { min: oldMin, max: oldMax } = this._range;
        const stBasePt = this._baseCurve.getPtAt(this._paramMapper.getBaseParam(oldMin));
        const edBasePt = this._baseCurve.getPtAt(this._paramMapper.getBaseParam(oldMax));

        this._baseCurve.reverse();
        this._offset = -this._offset;
        this._updateParamMapper();

        const baseMin = this._baseCurve.getParamAt(edBasePt);
        const min = this._paramMapper.getParam(baseMin, false);
        const period = this._paramMapper.getPeriod();
        if (isClosed) {
            this._range = new PeriodInterval(min, min + period, period);
        } else {
            let newBaseMax = this._baseCurve.getParamAt(stBasePt);
            const baseRange = this._baseCurve.getRange();
            if (Util.isNearlyBiggerOrEqual(baseMin, newBaseMax) && baseRange instanceof PeriodInterval) {
                newBaseMax += baseRange.period;
            }
            const max = this._paramMapper.getParam(newBaseMax, true);
            this._range = period > 0 ? new PeriodInterval(min, max, period) : new Interval(min, max);
        }
        return this;
    }

    public offset(dDist: number): boolean {
        this._offset += dDist;
        return true;
    }

    /**
     * 拟合成nurbscurve2d
     */
    public toNurbs(degree = 3, lengthEps = Tol.LENGTH) {
        const singulars = this.getSingularities();
        singulars.sort();
        const range = this._range;
        const origRange = range.clone();
        const ranges: Interval[] = [];
        let tmpRange = range;
        for (const t of singulars) {
            const splitRanges = tmpRange.splited(t);
            ranges.push(splitRanges[0]);
            tmpRange = splitRanges[1];
        }
        ranges.push(tmpRange);

        const nurbss: NurbsCurve2[] = [];
        for (const r of ranges) {
            this.setRange(r);
            const pts = this.getInterpPts(lengthEps).pts;
            const nurbs = NurbsCurve2.makeByInterpolationPts(pts, degree);
            nurbss.push(nurbs);
        }
        this.setRange(origRange);

        if (nurbss.length === 1) {
            return nurbss[0];
        }

        let knots: number[] = [];
        let pts: Vec2[] = [];
        let weights: number[] = [];
        for (const cv of nurbss) {
            if (pts.length === 0) {
                pts = cv.getControlPoints();
                weights = cv.getWeights();
                knots = cv.getKnots();
            } else {
                knots.pop();
                pts.pop();
                weights.pop();

                pts = pts.concat(cv.getControlPoints());
                weights = weights.concat(cv.getWeights());
                const lastKnot = knots[knots.length - 1];
                for (let i = degree + 1; i < cv.getKnots().length; i++) {
                    knots.push(cv.getKnots()[i] + lastKnot);
                }
            }
        }

        const nurbs2d = NurbsCurve2.makeByControlPoints(pts, degree, knots, weights);
        return nurbs2d;
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): this {
        const _svd = extra?.svd || Matrix3.make(m, false).decompose();
        Matrix3.assertScaleEqual(_svd.scale);

        this._baseCurve.transform(m, extra);

        this._offset *= _svd.scale.x;
        return this;
    }

    public transformed(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): Curve2 {
        const _svd = extra?.svd || Matrix3.make(m, false).decompose();
        const isScaleEqual = Math.abs(Math.abs(_svd.scale.y / _svd.scale.x) - 1) < Tol.NUMBER;
        if (isScaleEqual) {
            const cloneBaseCv = this._baseCurve.clone();
            cloneBaseCv.transform(m, extra);
            const offset = this._offset * _svd.scale.x;

            return new OffsetCurve2(cloneBaseCv, offset);
        }

        const nurbs = this.toNurbs();
        nurbs.transform(m);
        return nurbs;
    }

    public discrete(params = DiscreteParam.NORMAL): Vec2[] {
        const ranges = this.getContinuousRanges();
        const r0 = this._range;
        const ptCrvs = ranges.map(r => {
            this._range = r;
            return DiscreteUtil.discreteCurve2d(this, params);
        });
        const ret: Vec2[] = ptCrvs.length ? ptCrvs[0] : [];
        for (let i = 1; i < ptCrvs.length; i++) {
            ret.push(...ptCrvs[i].slice(1));
        }
        this._range = r0;
        return ret;
    }

    public getType(): EN_GEO_TYPE.OFFSET_CURVE_2D {
        return EN_GEO_TYPE.OFFSET_CURVE_2D;
    }

    public clone(): OffsetCurve2 {
        const obj = new OffsetCurve2(this._baseCurve.clone(), this._offset, this._range.toArray());
        obj.userData = this.userData;
        return obj;
    }

    public dump(): types.IDBOffsetCurve2d {
        return {
            ...super.dump(),
            data: [this._baseCurve.dump(), this._offset, this._range.toArray()],
        };
    }

    public load(json: types.IDBOffsetCurve2d) {
        const { data: [curve, offset, range] } = json;
        this._offset = offset;
        this._baseCurve = Loader.load(curve) as Curve2;
        this._updateParamMapper();
        this._initRange(range);
        return super.load(json);
    }

    protected _refineDegerateTangent(t: number, snapPre: boolean, tan: Vec2): Vec2 {
        const baseT = this._paramMapper.getBaseParam(t, snapPre);
        const baseTan = this._baseCurve.getTangentAt(baseT, snapPre);
        const isParallel = baseTan.isParallel(tan, Tol.ROUGH_ANGLE_EPS);
        return isParallel ? baseTan.multiply(Math.sign(baseTan.dot(tan))) : tan;
    }

    private _updateParamMapper() {
        // 构造offset curve时必须有OffsetParameterMapper
        this._paramMapper = new OffsetParameterMapper();

        if (this._baseCurve instanceof Arc2) {
            const arc = this._baseCurve;
            const dr = this._baseCurve.isCCW() ? this._offset : -this._offset;
            this._paramMapper = OffsetParameterMapper.ByArc(this, arc, dr);
        } else if (this._baseCurve.isPeriodic()) {
            this._paramMapper = OffsetParameterMapper.periodicBaseCurve(this, this._offset);
        }
        // 不是周期性的，默认offset之后也不是周期的。如果以后出现不是周期性的offset之后首尾相接了再处理
    }

    private _initRange(range?: types.IInterval) {
        if (range) {
            this._range = PeriodInterval.make(range[0], range[1], this._paramMapper.getPeriod());
        } else {
            const baseRange = this._baseCurve.getRange();
            this._range = this._paramMapper.getRange(baseRange);
        }
    }

    private _startSettingChange(): types.IInterval {
        if (this._range instanceof PeriodInterval && this._range.isClosed()) {
            return this._baseCurve.getRange().toArray();
        }
        const baseMin = this._paramMapper.getBaseParam(this._range.min, false);
        const baseMax = this._paramMapper.getBaseParam(this._range.max, true);
        return [baseMin, baseMax];
    }

    private _endSettingChange(info: types.IInterval) {
        this._range = this._paramMapper.getRange(info);
    }
}