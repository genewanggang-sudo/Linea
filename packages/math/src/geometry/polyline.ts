import { ArrayUtil } from '../util/array_util';
import { MathAssert } from '../util/assert';



export abstract class Polyline<PointType> {
    protected _points: PointType[];

    protected _ts: number[];

    constructor(points: PointType[], ts: number[]) {
        MathAssert.assert(points.length === ts.length, '控制顶点与参数个数不同');
        this._points = points;
        this._ts = ts;
    }

    protected abstract _getInterpolator(): (p1: PointType, p2: PointType, ratio: number) => PointType;

    public get ts(): ReadonlyArray<number> {
        return this._ts;
    }

    public get points(): ReadonlyArray<PointType> {
        return this._points;
    }

    public getPtAt(t: number): PointType {
        const segI = ArrayUtil.binarySearch(this._ts, t);
        const st = this._ts[segI];
        const ed = this._ts[segI + 1];
        const ratio = (t - st) / (ed - st);
        return this._getInterpolator()(this._points[segI], this._points[segI + 1], ratio);
    }
}

export class PolylineFunction extends Polyline<number> {
    protected _getInterpolator(): (p1: number, p2: number, ratio: number) => number {
        return (p1: number, p2: number, ratio: number) => p1 + (p2 - p1) * ratio;
    }
}