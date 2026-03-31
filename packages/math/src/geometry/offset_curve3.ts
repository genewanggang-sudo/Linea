import { Loader } from '../loader/loader';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { MathError, MathErrorType } from '../util/math_error';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { DiscreteUtil } from '../algorithm/discrete/discrete_util';
import { OffsetParameterMapper, ParamType } from './offset_parameter_mapper';
import { Curve3 } from './curve3d';
import { Vec3 } from '../base/vec3';
import { Arc3 } from './arc3d';
import { Ln3 } from './ln3';
import { PeriodInterval } from '../base/period_inverval';
import { ICurve3dTransformExtra, IOffsetCurve } from '../type_define/i_geometry';
import { Matrix4 } from '../base/matrix4';
import { PtToCurve3Distance } from '../algorithm/distance/pt_to_curve3_distance';
import { CurveUtil } from '../util/curve_util';
import { Tol } from '../base/tol';
import { NurbsCurve3 } from './nurbs_curve3';
import { Util } from '../util/util';
import { CONST } from '../type_define/const';
import { verb } from '../verb/export_verb';

/**
 * 仅支持三维空间中的平面曲线
 */
@registerGeo
export class OffsetCurve3 extends Curve3 implements IOffsetCurve<Vec3> {
    // #region init
    /**
     * 基于给定曲线，根据偏移量生成偏置曲线
     * @param curve 基曲线
     * @param dz 偏移的 z 轴方向
     * @param offsetXY 在 xy 平面上的偏移量
     * @param offsetZ 在 z 轴方向上的偏移量
     */
    public static makeByOffset(curve: Curve3, dz: Vec3, offsetXY: number, offsetZ: number = 0): Curve3 {
        if (curve instanceof Ln3) {
            const dir = curve.getDirection();
            const dp = dz.multiplied(offsetZ).add(dir.cross(dz).multiply(offsetXY));
            return new Ln3(curve.getOrigin().added(dp), curve.getDirection(), curve.getRange().toArray());
        }

        if (curve instanceof Arc3 && curve.isEqualAB() && dz.isParallel(curve.getNormal())) {
            const sign = dz.dot(curve.getNormal());
            const r = curve.getRadius() + offsetXY * sign;
            return new Arc3(curve.getCoord().translated(dz.multiplied(offsetZ)), r, r, curve.getRange().toArray());
        }

        if (curve instanceof OffsetCurve3) {
            MathError.warn(
                () => curve.getDz().isParallel(dz),
                'Offset: none parralleled offset unsupported',
                MathErrorType.Unimplemented,
            );

            const sign = curve.getDz().dot(dz);
            const ofsXY = curve.getOffsetXY() + sign * offsetXY;
            const ofsZ = curve.getOffsetZ() + sign * offsetZ;
            if (Math.abs(ofsXY) < Tol.CALCULATE_EPS && Math.abs(ofsZ) < Tol.CALCULATE_EPS) {
                return curve.getBaseCurve().clone();
            }

            const ret = new OffsetCurve3(curve.getBaseCurve().clone(), dz, ofsXY, ofsZ);

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

        return new OffsetCurve3(curve.clone(), dz, offsetXY, offsetZ);
    }

    /**
     * 基于给定曲线，生成一条过给定目标点的偏置曲线
     * @param curve 基曲线
     * @param point 给定的目标点
     */
    public static makeByTargetPoint(curve: Curve3, point: types.IXYZ): Curve3 {
        // 处理直线
        if (curve instanceof Ln3) {
            const t = curve.getParamAt(point);
            const p0 = curve.getPtAt(t);
            const dp = new Vec3(point).subtract(p0);
            return new Ln3(curve.getStartPt().added(dp), curve.getStartTangent(), curve.getRange().toArray());
        }

        // 计算位移
        let dist = PtToCurve3Distance.execute(point, curve);
        let tan: Vec3;
        const range = curve.getRange();

        if (Util.isNearlyEqual(dist.param, range.min)) {
            tan = curve.getStartTangent();
            const line = new Ln3(curve.getStartPt(), tan, Interval.infinitArray());
            dist = PtToCurve3Distance.simple(point, line);
        } else if (Util.isNearlyEqual(dist.param, range.max)) {
            tan = curve.getEndTangent();
            const line = new Ln3(curve.getEndPt(), curve.getEndTangent(), Interval.infinitArray());
            dist = PtToCurve3Distance.simple(point, line);
        } else {
            tan = curve.getTangentAt(dist.param);
        }

        const dp = new Vec3(point).subtract(dist.foot);
        const dz = CurveUtil.getDzByCurve(curve, dp);
        const ofsZ = dz.dot(dp);
        const ofsXY = tan.cross(dz).dot(dp);

        return OffsetCurve3.makeByOffset(curve, dz, ofsXY, ofsZ);
    }

    private _paramMapper: OffsetParameterMapper;

    private _baseCurve: Curve3;

    private _dz: Vec3;

    private _offsetXY: number;

    private _offsetZ: number;

    constructor();

    /**
     * 基于 curve 创建一条偏置曲线
     * @param curve 基曲线
     * @param dz 基曲线所在平面的法向
     * @param offsetXY 偏置后在所在平面上的偏移量
     * @param offsetZ 偏置后在所在平面法向上的偏移量
     */
    constructor(curve: Curve3, dz: Vec3, offsetXY?: number, offsetZ?: number, range?: types.IInterval);

    constructor(curve?: Curve3, dz?: Vec3, offsetXY: number = 0, offsetZ: number = 0, range?: types.IInterval) {
        super();
        if (curve && dz) {
            this._baseCurve = curve;
            this._dz = dz.clone();
            this._offsetXY = offsetXY;
            this._offsetZ = offsetZ;
            this._updateParamMapper();
            this._initRange(range);
        }
    }
    // #endregion

    // #region get
    public getBaseCurve(): Curve3 {
        return this._baseCurve;
    }

    public getParamMapper(): OffsetParameterMapper {
        return this._paramMapper;
    }

    public getDomain(): Interval {
        if (this._baseCurve instanceof NurbsCurve3 && !this.isPeriodic()) {
            // 不是周期的，且是nurbs曲线，domain不能是无穷大的
            const baseDomain = this._baseCurve.getDomain();
            return new Interval(baseDomain.min, baseDomain.max);
        }
        return this._paramMapper.getDomain();
    }

    /**
     * 判断该曲线是否为直线
     * @returns
     */
    public isLineLike(): boolean {
        return this._baseCurve.isLineLike();
    }

    public toVerbNurbs(): verb.geom.NurbsCurve {
        return (this.toNurbs() as any)._verbCurve;
    }

    public getOffsetXY(): number {
        return this._offsetXY;
    }

    public setOffsetXY(offsetXY: number) {
        const info = this._startSettingChange();
        this._offsetXY = offsetXY;
        this._updateParamMapper();
        this._endSettingChange(info);
    }

    public getOffsetZ(): number {
        return this._offsetZ;
    }

    public setOffsetZ(offsetZ: number) {
        this._offsetZ = offsetZ;
    }

    public getDz(): Vec3 {
        return this._dz.clone();
    }
    // #endregion

    // #region evaluate

    public getPtAt(t: number): Vec3 {
        const bt = this._paramMapper.getBaseParam(t);
        const p0 = this._baseCurve.getPtAt(bt);
        const tan = this._baseCurve.getTangentAt(bt).normalize();
        const dxy = tan.cross(this._dz).multiply(this._offsetXY);
        return p0.add(dxy).add(this._dz.multiplied(this._offsetZ));
    }

    public getParamAt(point: types.IXYZ): number {
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

        const range = this._range;

        const bt = this._baseCurve.getParamAt(point);
        const ret = this._paramMapper.getParam(bt);
        // const tangent = this._baseCurve.getTangentAt(bt);
        // const vect = this.getPtAt(ret).subtracted(point);
        // if (Math.abs(vect.dot(tangent)) > Tol.NUMBER) {
        //     // 继续迭代求精？
        //     const param = this.getFootByIterate(point, ret, Tol.LENGTH, Tol.ANGLE);
        //     if (param) {
        //         return range instanceof PeriodInterval ? range.getRegularParam(param) : param;
        //     }
        // }
        return range instanceof PeriodInterval ? range.getRegularParam(ret) : ret;
    }

    /**
     * 判断Curve3d是否是平面曲线
     * 如果是平面曲线：并且能构造一个平面，则返回平面的法向；不能构造平面的，例如是一条直线的，只返回true；如果不是平面曲线(即空间曲线)，返回false
     */
    public isPlaneCurve3d(angleTol = Tol.ANGLE): boolean | Vec3 {
        return this.getBaseCurve().isPlaneCurve3d(angleTol);
    }

    public getAllFootParams(point: types.IXYZ, lengthEps = Tol.LENGTH): number[] {
        const baseTs = this._baseCurve.getAllFootParams(point, lengthEps);
        const ret: number[] = [];
        for (const baseT of baseTs) {
            const info = this._paramMapper.getParamInfo(baseT);
            if (info.type === ParamType.Normal) ret.push(info.param);
        }
        return ret;
    }

    // sqr = x'x'
    // sum = sqr' / 2 =  x'x"
    // L(x) = x * dz * ofsXY
    // x^ = x + L(x') / sqr^0.5 + dz * ofsZ
    // num = L(x") * sqr - L(x') * sum
    // den = sqr^ 1.5
    // x^' = x' + num / den
    // sum' = x'x"' + x"x"
    // num' = L(x"') * sqr + L(x") * sum - L(x') * sum'
    // den' = 3 * sqr^0.5 * sum
    // part2 = (num' * den - num * den') / den^2
    // x^" = x" + part2
    // sum" = x'x"" + 3 x"x"'
    // num" = L(x"") * sqr + L(x"') * 3 sum - L(x') * sum"
    // den" = 3 sum^2 * sqr^-0.5 + 3 * sqr^0.5 * sum'
    // x^"' = x"' + (num" * den - num * den") / den^2 - 2 part2 * (den' / den)

    /**
     * 获取某参数t处的几阶导数，例如 n = 2 时，会返回曲线在参数t处的坐标、1阶导、2阶导
     * @param t 参数
     * @param n 需要计算的导数的最大阶数
     * @param snapToPreviousEnd true时吸附到前一段domain的末尾，false时吸附到后一段domain的起始。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public getDerivatives(t: number, nth: number, snapToPreviousEnd?: boolean): Vec3[] {
        const snapPre = this._getSnapToPrevious(t, snapToPreviousEnd);
        const bt = this._paramMapper.getBaseParam(t, snapPre);
        const ds = this._baseCurve.getDerivatives(bt, nth + 1, snapPre);

        const L = (x: Vec3, k: number): Vec3 => {
            return x.cross(this._dz).multiply(this._offsetXY * k);
        };
        const sqr = ds[1].getSqLength();
        const sqrt = Math.sqrt(sqr);
        const part01 = L(ds[1], 1 / sqrt);
        const part02 = this._dz.multiplied(this._offsetZ);
        const ret = [ds[0].added(part01).add(part02)];
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
    // #endregion

    // #region shape
    public reverse(): this {
        const isClosed = this._range instanceof PeriodInterval && this._range.isClosed();
        const { min: oldMin, max: oldMax } = this._range;
        const stBasePt = this._baseCurve.getPtAt(this._paramMapper.getBaseParam(oldMin));
        const edBasePt = this._baseCurve.getPtAt(this._paramMapper.getBaseParam(oldMax));

        this._baseCurve.reverse();
        this._offsetXY = -this._offsetXY;
        this._updateParamMapper();

        const newBaseMin = this._baseCurve.getParamAt(edBasePt);
        const min = this._paramMapper.getParam(newBaseMin, false);
        const period = this._paramMapper.getPeriod();
        if (isClosed) {
            this._range = new PeriodInterval(min, min + period, period);
        } else {
            let newBaseMax = this._baseCurve.getParamAt(stBasePt);
            const baseRange = this._baseCurve.getRange();
            if (Util.isNearlyBiggerOrEqual(newBaseMin, newBaseMax) && baseRange instanceof PeriodInterval) {
                newBaseMax += baseRange.period;
            }
            const max = this._paramMapper.getParam(newBaseMax, true);
            this._range = period > 0 ? new PeriodInterval(min, max, period) : new Interval(min, max);
        }
        return this;
    }

    /**
     * 拟合成nurbscurve3d
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

        const nurbss: NurbsCurve3[] = [];
        for (const r of ranges) {
            this.setRange(r);
            const pts = this.getInterpPts(lengthEps).pts as Vec3[];
            const nurbs = NurbsCurve3.makeByInterpolationPts(pts, degree);
            nurbss.push(nurbs);
        }
        this.setRange(origRange);

        if (nurbss.length === 1) {
            return nurbss[0];
        }

        let knots: number[] = [];
        let pts: Vec3[] = [];
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

        const nurbs3d = NurbsCurve3.makeByControlPoints(pts, degree, knots, weights);
        return nurbs3d;
    }

    public transform(m: types.IMatrix4 | types.numberArrs4X4, extra?: ICurve3dTransformExtra): this {
        const _svd = extra?.svd || Matrix4.make(m, false).decompose();
        Matrix4.assertScaleEqual(_svd.scale);

        this._baseCurve.transform(m, extra);

        this._dz.vecTransform(m).normalize();
        this._offsetXY *= _svd.scale.x;
        this._offsetZ *= _svd.scale.y;

        return this;
    }

    public transformed(m: types.IMatrix4 | types.numberArrs4X4, extra?: ICurve3dTransformExtra): Curve3 {
        const _svd = extra?.svd || Matrix4.make(m, false).decompose();
        const isScaleEqual = Matrix4.isScaleEqual(_svd.scale);
        if (isScaleEqual) {
            const cloneBaseCv = this._baseCurve.clone();
            cloneBaseCv.transform(m, extra);
            const cloneDz = this._dz.vecTransformed(m).normalize();
            const offsetXY = this._offsetXY * _svd.scale.x;
            const offsetZ = this._offsetZ * _svd.scale.y;

            return new OffsetCurve3(cloneBaseCv, cloneDz, offsetXY, offsetZ);
        }

        const nurbs = this.toNurbs();
        nurbs.transform(m);
        return nurbs;
    }

    public discrete(params = DiscreteParam.NORMAL): Vec3[] {
        const ranges = this.getContinuousRanges();
        const r0 = this._range;
        const ptCrvs = ranges.map(r => {
            this._range = r;
            return DiscreteUtil.discreteCurve3d(this, params);
        });
        const ret: Vec3[] = ptCrvs.length ? ptCrvs[0] : [];
        for (let i = 1; i < ptCrvs.length; i++) {
            ret.push(...ptCrvs[i].slice(1));
        }
        this._range = r0;
        return ret;
    }
    // #endregion

    // #region io
    public getType(): EN_GEO_TYPE.OFFSET_CURVE_3D {
        return EN_GEO_TYPE.OFFSET_CURVE_3D;
    }

    public clone(): OffsetCurve3 {
        const obj = new OffsetCurve3(
            this._baseCurve.clone(),
            this._dz,
            this._offsetXY,
            this._offsetZ,
            this._range.toArray(),
        );
        obj.userData = this.userData;
        return obj;
    }

    public dump(): types.IDBOffsetCurve3d {
        return {
            ...super.dump(),
            data: [this._baseCurve.dump(), this._dz.toArray3(), this._offsetXY, this._offsetZ, this._range.toArray()],
        };
    }

    public load(json: types.IDBOffsetCurve3d) {
        const { data: [curve, dz, offsetXY, offsetZ, range] } = json;
        this._baseCurve = Loader.load(curve) as Curve3;
        this._dz = new Vec3(dz);
        this._offsetXY = offsetXY;
        this._offsetZ = offsetZ;
        this._updateParamMapper();
        this._initRange(range);
        return super.load(json);
    }
    // #endregion

    // #region _
    protected _refineDegerateTangent(t: number, snapPre: boolean, tan: Vec3): Vec3 {
        const baseT = this._paramMapper.getBaseParam(t, snapPre);
        const baseTan = this._baseCurve.getTangentAt(baseT, snapPre);
        const isParallel = baseTan.isParallel(tan, Tol.ROUGH_ANGLE_EPS);
        return isParallel ? baseTan.multiplied(Math.sign(baseTan.dot(tan))) : tan;
    }

    private _updateParamMapper() {
        // 构造offset curve时必须有OffsetParameterMapper
        this._paramMapper = new OffsetParameterMapper();

        // 对于一些类型，需要对mapper做一些特殊处理
        if (this._baseCurve instanceof Arc3) {
            const arc = this._baseCurve;
            const dr = this._offsetXY * this._dz.dot(arc.getNormal());
            this._paramMapper = OffsetParameterMapper.ByArc(this, arc, dr);
        } else if (this._baseCurve.isPeriodic()) {
            this._paramMapper = OffsetParameterMapper.periodicBaseCurve(this, this._offsetXY);
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

    /**
     * 参数域发生变化时，可调用该 start/end 方法，以保留原 range
     */
    private _startSettingChange(): types.IInterval {
        if (this._range instanceof PeriodInterval && this._range.isClosed()) {
            return this._baseCurve.getRange().toArray();
        }
        const baseMin = this._paramMapper.getBaseParam(this._range.min, false);
        const baseMax = this._paramMapper.getBaseParam(this._range.max, true);
        return [baseMin, baseMax];
    }

    /**
     * 参数域发生变化时，可调用该 start/end 方法，以保留原 range
     */
    private _endSettingChange(info: types.IInterval) {
        this._range = this._paramMapper.getRange(info);
    }
    // #endregion
}
