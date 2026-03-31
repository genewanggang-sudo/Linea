import { Loader } from '../loader/loader';
import { Interval } from '../base/interval';
import { DiscreteParam } from '../base/discrete_param';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Curve2 } from './curve2';
import { Vec2 } from '../base/vec2';
import { Ln2 } from './ln2';
import { Box2 } from '../base/box2';
import { Tol } from '../base/tol';
import { ICurve2dTransformExtra, IExtendCurve } from '../type_define/i_geometry';
import { PtToCv2Distance } from '../algorithm/distance/pt_to_curve2_signed_distance';
import { NurbsCurve2 } from './nurbs_curve2';

interface IExtension2d {
    curve: Ln2;
    scale: number;
}

/**
 * 延长曲线，根据首尾切线向量生成，1阶连续。
 * 仅作为中间表达式内部使用，目前仅用于扫掠面以及扫掠过程中部分曲线的延长线使用
 */
@registerGeo
export class ExtendCurve2 extends Curve2 implements IExtendCurve<Vec2> {
    // #region init
    /**
     * 以 baseCurve 为基础，生成延长线
     * @param baseCurve
     * @param cloneCurve 为假时，将以 baseCurve 作为基线、或直接修改 baseCurve 作为返回结果
     */
    public static makeByCurve(baseCurve: Curve2, cloneCurve: boolean = true): Curve2 {
        const crv = cloneCurve ? baseCurve.clone() : baseCurve;

        if (baseCurve instanceof Ln2) {
            crv.getRange().setInfinit();
            return crv;
        }
        return new ExtendCurve2(crv);
    }

    // when curve changed, updateExtension should be called manually
    private _baseCurve!: Curve2;

    private _head!: IExtension2d;

    private _tail!: IExtension2d;

    constructor(baseCurve?: Curve2, range: types.IInterval = [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]) {
        super();
        if (baseCurve) {
            this._baseCurve = baseCurve;
            this.updateExtension();
            this._range = new Interval(range[0], range[1]);
        }
    }
    // #endregion

    // #region get
    public getBaseCurve(): Curve2 {
        return this._baseCurve;
    }

    public setBaseCurve(curve: Curve2) {
        this._baseCurve = curve;
        this.updateExtension();
    }

    public getSingularities(): number[] {
        const baseRange = this._baseCurve.getRange();
        return this._range.filterParams(baseRange.toArray());
    }

    public getHeadScale() {
        return this._head.scale;
    }

    public getTailScale() {
        return this._tail.scale;
    }

    public updateExtension() {
        const range = this._baseCurve.getRange();

        const headDs = this._baseCurve.getDerivatives(range.min, 1, false);
        {
            let tan = headDs[1];
            let scale = tan.getLength();

            if (scale < Tol.LENGTH) {
                tan = this._baseCurve.getTangentAt(range.min, false);
                scale = 1;
            }
            this._head = {
                curve: new Ln2(headDs[0], tan, [-CONST.MODEL_MAX_LENGTH, 0]),
                scale,
            };
        }

        const tailDs = this._baseCurve.getDerivatives(range.max, 1, true);
        {
            let tan = tailDs[1];
            let scale = tan.getLength();

            if (scale < Tol.LENGTH) {
                tan = this._baseCurve.getTangentAt(range.max, true);
                scale = 1;
            }

            this._tail = {
                curve: new Ln2(tailDs[0], tan, [0, CONST.MODEL_MAX_LENGTH]),
                scale,
            };
        }
    }
    // #endregion

    // #region evaluate
    /**
     * 判断该曲线是否为直线
     * @returns
     */
    public isLineLike(): boolean {
        return this._baseCurve.isLineLike();
    }

    public getPtAt(t: number): Vec2 {
        const base = this._getBase(t);
        return base.curve.getPtAt(base.param);
    }

    public getParamAt(point: types.IXYZ): number {
        const dist = PtToCv2Distance.execute(point, this._baseCurve);
        const d = dist.distance * dist.distance;
        const headT = this._head.curve.getParamAt(point);
        const headP = this._head.curve.getPtAt(headT);
        const headD = headP.subtracted(point).getSqLength();
        const tailT = this._tail.curve.getParamAt(point);
        const tailP = this._tail.curve.getPtAt(tailT);
        const tailD = tailP.subtracted(point).getSqLength();

        if (headT < 0 && headD <= tailD) {
            return d <= headD ? dist.param : headT / this._head.scale + this._baseCurve.getRange().min;
        }
        return d <= tailD || tailT <= 0 ? dist.param : tailT / this._tail.scale + this._baseCurve.getRange().max;
    }

    public getAllFootParams(point: types.IXY, lengthEps: number = Tol.LENGTH): number[] {
        const baseRange = this._baseCurve.getRange();
        const ts = this._baseCurve
            .getAllFootParams(point)
            .filter(_ => baseRange.containsPt(_))
            .sort();
        const headT = this._head.curve.getParamAt(point);
        const tailT = this._tail.curve.getParamAt(point);
        const ht = headT / this._head.scale + this._baseCurve.getRange().min;
        const tt = tailT / this._tail.scale + this._baseCurve.getRange().max;

        if (headT <= lengthEps) {
            if (ts.length === 0) {
                ts.push(ht);
            } else if (Math.abs(ht - ts[0]) * this._head.scale < lengthEps) {
                ts[0] = (ht + ts[0]) / 2;
            } else {
                ts.splice(0, 0, ht);
            }
        }

        if (tailT >= -lengthEps) {
            if (ts.length === 0) {
                ts.push(tt);
            } else if (Math.abs(tt - ts[ts.length - 1]) * this._tail.scale < lengthEps) {
                ts[ts.length - 1] = (tt + ts[ts.length - 1]) / 2;
            } else {
                ts.push(tt);
            }
        }
        return ts;
    }

    /**
     *  获取某参数处的切线
     * @param t 参数
     * @param snapToPreviousEnd 参数点在奇异点附近时，当输入为true时返回奇异点前的切向量，false时返回奇异点后的切向量。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public getTangentAt(t: number, snapToPreviousEnd?: boolean): Vec2 {
        const base = this._getBase(t, snapToPreviousEnd);
        return base.curve.getTangentAt(base.param, snapToPreviousEnd);
    }

    /**
     * 获取某参数t处的几阶导数，例如 n = 2 时，会返回曲线在参数t处的坐标、1阶导、2阶导
     * @param t 参数
     * @param n 需要计算的导数的最大阶数
     * @param snapToPreviousEnd 参数点在奇异点附近时，当输入为true时返回奇异点的前导数，false时返回奇异点的后导数。当 t === range.min 时，默认为 false，否则默认为 true。
     */
    public getDerivatives(t: number, nth: number, snapToPreviousEnd?: boolean): Vec2[] {
        const base = this._getBase(t, snapToPreviousEnd);
        const ds = base.curve.getDerivatives(base.param, nth, snapToPreviousEnd);
        for (let i = 1; i < ds.length; i++) {
            ds[i].multiply(base.scale);
        }
        return ds;
    }

    public getLength(range?: Interval): number {
        const r = range || this._range;

        const minBase = this._getBase(r.min);
        const maxBase = this._getBase(r.max);

        if (maxBase.curve === this._head.curve || minBase.curve === this._tail.curve) {
            const minPt = minBase.curve.getPtAt(minBase.param);
            const maxPt = maxBase.curve.getPtAt(maxBase.param);
            return minPt.subtract(maxPt).getLength();
        }

        let cMin: number;
        let cMax: number;
        let len = 0;

        if (minBase.curve === this._head.curve) {
            len += -minBase.param;
            cMin = this._baseCurve.getRange().min;
        } else {
            cMin = r.min;
        }
        if (maxBase.curve === this._tail.curve) {
            len += maxBase.param;
            cMax = this._baseCurve.getRange().max;
        } else {
            cMax = r.max;
        }

        len += this._baseCurve.getLength(new Interval(cMin, cMax));

        return len;
    }

    /**
     * split into simple curves
     */
    public toSimpleCurves(): Curve2[] {
        const ret: Curve2[] = [];

        const headT = (this._range.min - this._baseCurve.getRange().min) * this._head.scale;
        const tailT = (this._range.max - this._baseCurve.getRange().max) * this._tail.scale;
        let { min, max } = this._baseCurve.getRange();

        if (headT < -Tol.EDGE_LENGTH_EPS) {
            const crv = this._head.curve;
            ret.push(new Ln2(crv.getOrigin(), crv.getDirection(), [headT, 0]));
            min = this._baseCurve.getRange().min;
        } else if (this._range.min > min) {
            min = this._range.min;
        }

        let tailCrv: Curve2 | undefined;
        if (tailT > Tol.EDGE_LENGTH_EPS) {
            const crv = this._tail.curve;
            tailCrv = new Ln2(crv.getOrigin(), crv.getDirection(), [0, tailT]);
        } else if (this._range.max < max) {
            max = this._range.max;
        }

        const baseCrv = this._baseCurve.clone();
        if (min < max) {
            ret.push(baseCrv.setRange(min, max));
        }
        if (tailCrv) {
            ret.push(tailCrv);
        }

        return ret;
    }
    // #endregion

    // #region shape
    public offset(dist: number): boolean {
        throw new Error('not supported');
    }

    public reverse(): this {
        const dmax = this._range.max - this._baseCurve.getRange().max;
        const dmin = this._range.min - this._baseCurve.getRange().min;
        this._baseCurve.reverse();
        this.updateExtension();

        const baseRange = this._baseCurve.getRange();
        this._range.set(baseRange.min - dmax, baseRange.max - dmin);

        return this;
    }

    public transform(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): this {
        if (this._baseCurve.isLine3d()) {
            throw new Error('未实现的转换');
        }

        this._baseCurve.transform(m, extra);
        this.updateExtension();
        return this;
    }

    public transformed(m: types.IMatrix3 | types.numberArrs3X3, extra?: ICurve2dTransformExtra): Curve2 {
        if (this._baseCurve.isLine3d()) {
            throw new Error('未实现的转换');
        }

        const tBaseCurve = this._baseCurve.transformed(m, extra);
        const newExdCv = new ExtendCurve2(tBaseCurve, this._range.toArray());
        if (!(this._baseCurve.isOffsetCurve2d() && tBaseCurve.isNurbsCurve2d())) {
            return newExdCv;
        }

        // 如果是offset curve，并且非等比缩放后，拟合nurbs曲线，参数域和切向大小会发生较大变化，并且起点终点切向不准，会导致延伸后误差较大。Todo
        const bRange = this._baseCurve.getRange();
        const tBRange = tBaseCurve.getRange();
        if (this._range.min < bRange.min - Tol.NUMBER) {
            const stPt = this.getPtAt(this._range.min);
            const tStPt = stPt.transformed(m);
            const sBStPt = tBaseCurve.getStartPt();

            const tStDvts = tBaseCurve.getDerivatives(tBRange.min, 1);
            const length = sBStPt.subtracted(tStPt).getLength() / tStDvts[1].getLength();
            const param1 = tBRange.min - length;
            newExdCv.getRange().min = param1;
        }

        if (this._range.max > bRange.max + Tol.NUMBER) {
            const endPt = this.getPtAt(this._range.max);
            const tEndtPt = endPt.transformed(m);
            const sBEndPt = tBaseCurve.getEndPt();

            const tEndDvts = tBaseCurve.getDerivatives(tBRange.max, 1);
            const length = tEndtPt.subtracted(sBEndPt).getLength() / tEndDvts[1].getLength();
            const param2 = tBRange.max + length;
            newExdCv.getRange().max = param2;
        }
        return newExdCv;
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

    /**
     * 计算曲线在给定参数区间的包围盒，如果没有传入参数域则计算曲线默认参数域的包围盒
     */
    public getBBox(range?: Interval): Box2 {
        const r = range || this._range;

        const minBase = this._getBase(r.min);
        const maxBase = this._getBase(r.max);

        const minPt = minBase.curve.getPtAt(minBase.param);
        const maxPt = maxBase.curve.getPtAt(maxBase.param);

        if (maxBase.curve === this._head.curve || minBase.curve === this._tail.curve) {
            return new Box2([minPt, maxPt]);
        }

        let cMin: number;
        let cMax: number;
        const ret = new Box2();

        if (minBase.curve === this._head.curve) {
            ret.expandByPoint(minPt);
            cMin = this._baseCurve.getRange().min;
        } else {
            cMin = r.min;
        }
        if (maxBase.curve === this._tail.curve) {
            ret.expandByPoint(maxPt);
            cMax = this._baseCurve.getRange().max;
        } else {
            cMax = r.max;
        }

        const bRange = this._baseCurve.getRange().clone();
        this._baseCurve.setRange(cMin, cMax);
        ret.union(this._baseCurve.getBBox());
        this._baseCurve.setRange(bRange);

        return ret;
    }

    public discrete(params = DiscreteParam.NORMAL): Vec2[] {
        const r = this._range;

        const minBase = this._getBase(r.min);
        const maxBase = this._getBase(r.max);

        const minPt = minBase.curve.getPtAt(minBase.param);
        const maxPt = maxBase.curve.getPtAt(maxBase.param);

        if (maxBase.curve === this._head.curve || minBase.curve === this._tail.curve) {
            return [minPt, maxPt];
        }

        let cMin: number;
        let cMax: number;
        const ret: Vec2[] = [];
        let insertPos: number;
        let popHead = false;
        let popEnd = false;

        if (minBase.curve === this._head.curve) {
            ret.push(minPt);
            cMin = this._baseCurve.getRange().min;
            insertPos = 1;
            popHead = cMin - this._range.min < Tol.EDGE_LENGTH_EPS;
        } else {
            cMin = r.min;
            insertPos = 0;
        }

        if (maxBase.curve === this._tail.curve) {
            ret.push(maxPt);
            cMax = this._baseCurve.getRange().max;
            popEnd = this._range.max - cMax < Tol.EDGE_LENGTH_EPS;
        } else {
            cMax = r.max;
        }

        const bRange = this._baseCurve.getRange().clone();
        this._baseCurve.setRange(cMin, cMax);
        const pts = this._baseCurve.discrete(params);
        if (popHead) pts.shift();
        if (popEnd) pts.pop();
        ret.splice(insertPos, 0, ...pts);
        this._baseCurve.setRange(bRange);

        return ret;
    }
    // #endregion

    // #region io
    public getType(): EN_GEO_TYPE.EXTEND_CURVE_2D {
        return EN_GEO_TYPE.EXTEND_CURVE_2D;
    }

    public clone(): ExtendCurve2 {
        const obj = new ExtendCurve2(this._baseCurve.clone(), this._range.toArray());
        obj.userData = this.userData;
        return obj;
    }

    public dump(): types.IDBExtendCurve2d {
        return {
            ...super.dump(),
            data: [this._baseCurve.dump(), this._range.toArray()],
        };
    }

    public load(json: types.IDBExtendCurve2d) {
        const { data: [curve, range] } = json;
        this._baseCurve = Loader.load(curve) as Curve2;
        this.updateExtension();
        this._range = new Interval(range[0], range[1]);
        return super.load(json);
    }
    // #endregion

    // #region _
    private _getBase(t: number, snapToPreviousEnd = true): { curve: Curve2; param: number; scale: number } {
        const range = this._baseCurve.getRange();
        const domainOffset = snapToPreviousEnd ? Tol.CALCULATE_EPS : -Tol.CALCULATE_EPS;

        if (t < range.min + domainOffset) {
            const ext = this._head;
            return {
                curve: ext.curve,
                param: (t - range.min) * ext.scale,
                scale: ext.scale,
            };
        }
        if (t > range.max + domainOffset) {
            const ext = this._tail;
            return {
                curve: ext.curve,
                param: (t - range.max) * ext.scale,
                scale: ext.scale,
            };
        }

        return {
            curve: this._baseCurve,
            param: t,
            scale: 1,
        };
    }
    // #endregion
}
