import { EN_GEO_TYPE } from '../constants/geom_type'
import { MathConst } from '../constants/math_const'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBEllipseArc2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { EllipseCurve2 } from './ellipse_curve2'
import { Interval } from './interval'
import { PeriodInterval } from './period_interval'

@RegisterGeom
/**
 * 二维椭圆弧曲线。
 * 内部参数域统一为递增区间 `[s, s + sweep]`，方向由 `clockwise` 表示。
 */
export class EllipseArc2 extends EllipseCurve2 {
    public static readonly type = EN_GEO_TYPE.EllipseArc2

    private _clockwise: boolean

    /**
     * 构造椭圆弧。
     * @param center 中心点。
     * @param rx 长半轴。
     * @param ry 短半轴。
     * @param rotation 椭圆局部 x 轴相对全局 x 轴旋转角（弧度）。
     * @param startAngle 起始角（几何语义）。
     * @param endAngle 终止角（几何语义）。
     * @param clockwise 是否顺时针。
     */
    constructor(center: Vec2, rx: number, ry: number, rotation: number, startAngle: number, endAngle: number, clockwise = false) {
        super(center, rx, ry, rotation)
        MathError.assert(Number.isFinite(startAngle) && Number.isFinite(endAngle), 'EllipseArc2: startAngle/endAngle must be finite')
        this._clockwise = clockwise
        this.resetAngles(startAngle, endAngle, clockwise)
    }

    public get clockwise() {
        return this._clockwise
    }

    public get startAngle() {
        return this.normalizeAngle(this._range.start)
    }

    public get endAngle() {
        const sweep = this._range.length()
        const end = this._clockwise
            ? this._range.start - sweep
            : this._range.start + sweep
        return this.normalizeAngle(end)
    }

    public override split(u: number) {
        const parts = this._range.split(u, Precision.CURVE_PARAM_EPS)
        if (parts.length === 0) return []

        return parts
            .map((seg) => new EllipseArc2(
                this._center,
                this._rx,
                this._ry,
                this._rotation,
                this.paramToAngleChecked(seg.start),
                this.paramToAngleChecked(seg.end),
                this._clockwise,
            ))
            .filter((arc) => arc.getLength() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range)
        if (range.length() <= Precision.CURVE_LENGTH_EPS) return []

        const start = this.paramToAngleChecked(range.start)
        const end = this.paramToAngleChecked(range.end)
        const arc = new EllipseArc2(this._center, this._rx, this._ry, this._rotation, start, end, this._clockwise)
        return arc.getLength() <= Precision.CURVE_LENGTH_EPS ? [] : [arc]
    }

    public override reverse() {
        const s = this.startAngle
        const e = this.endAngle
        this.resetAngles(e, s, !this._clockwise)
        return this
    }

    public override transform(m: Mat3) {
        const oldSweep = this._range.length()

        const startPoint = this.pointAt(this._range.start)
        const endPoint = this.pointAt(this._range.end)

        const next = this.transformedEllipseParams(m)
        MathError.assert(next.rx > Precision.CURVE_LENGTH_EPS && next.ry > Precision.CURVE_LENGTH_EPS, 'EllipseArc2.transform: degenerate ellipse after transform')

        const nextStartPoint = m.transformedPoint(startPoint)
        const nextEndPoint = m.transformedPoint(endPoint)

        const startAngle = this.angleFromPointOnEllipse(nextStartPoint, next.center, next.rx, next.ry, next.rotation)
        let endAngle = this.angleFromPointOnEllipse(nextEndPoint, next.center, next.rx, next.ry, next.rotation)

        const nextClockwise = next.mirrored ? !this._clockwise : this._clockwise
        if (Math.abs(oldSweep - MathConst.PI2) <= Precision.CURVE_PARAM_EPS) {
            endAngle = startAngle + (nextClockwise ? -MathConst.PI2 : MathConst.PI2)
        }

        this._center = next.center
        this._rx = next.rx
        this._ry = next.ry
        this._rotation = next.rotation
        this.resetAngles(startAngle, endAngle, nextClockwise)
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override getParamAt(p: Vec2) {
        const range = this._range as PeriodInterval
        if (p.distanceToSq(this._center) <= Precision.CURVE_LENGTH_EPS_SQ) {
            return range.start
        }

        const normalizeParam = (u: number) => PeriodInterval.normalizeParam(u, range.period, range.start)
        const evalAngle = (u: number) => {
            const uu = normalizeParam(u)
            return this._clockwise ? (2 * range.start - uu) : uu
        }
        return this.solveProjectedParamOnSupport(
            p,
            range.start,
            range.start + range.period,
            (u) => this.pointAtAngle(evalAngle(u)),
            (u) => this.derivativeFromAngle(evalAngle(u), 1, this._clockwise ? -1 : 1),
            (u) => this.derivativeFromAngle(evalAngle(u), 2, this._clockwise ? -1 : 1),
            normalizeParam,
        )
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        return this.isEllipseStructValid(eps) && this._range.length() >= 0 && this._range.length() <= MathConst.PI2 + Precision.CURVE_PARAM_EPS
    }

    public override isClosed(): boolean {
        return Precision.equal(this._range.length(), MathConst.PI2, Precision.CURVE_PARAM_EPS)
    }

    public override isEllipseArc(): this is EllipseArc2 {
        return true
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比椭圆弧。
     * @param eps 数值容差。
     * @returns 中心、轴长、旋转、方向与起终角参数近似相等时返回 `true`。
     */
    public equals(other: EllipseArc2, eps = Precision.EPS) {
        return this._clockwise === other._clockwise &&
            this._center.equals(other._center, eps) &&
            Precision.equal(this._rx, other._rx, eps) &&
            Precision.equal(this._ry, other._ry, eps) &&
            Precision.equal(this._rotation, other._rotation, eps) &&
            Precision.equal(this.startAngle, other.startAngle, eps) &&
            Precision.equal(this.endAngle, other.endAngle, eps)
    }

    public override clone(): this {
        return new EllipseArc2(
            this._center,
            this._rx,
            this._ry,
            this._rotation,
            this.startAngle,
            this.endAngle,
            this._clockwise,
        ) as this
    }

    public override dump(): IDBEllipseArc2 {
        return {
            type: EllipseArc2.type,
            center: { x: this._center.x, y: this._center.y },
            rx: this._rx,
            ry: this._ry,
            rotation: this._rotation,
            startAngle: this.startAngle,
            endAngle: this.endAngle,
            clockwise: this._clockwise,
        }
    }

    public static load(data: IDBEllipseArc2) {
        return new EllipseArc2(
            new Vec2(data.center.x, data.center.y),
            data.rx,
            data.ry,
            data.rotation,
            data.startAngle,
            data.endAngle,
            data.clockwise,
        )
    }

    protected override paramToAngleUnchecked(u: number) {
        if (!this._clockwise) return u
        return this._range.start - (u - this._range.start)
    }

    protected override angleToParam(theta: number) {
        const range = this._range as PeriodInterval
        if (!this._clockwise) {
            return PeriodInterval.normalizeParam(theta, range.period, range.start)
        }
        const reflected = 2 * range.start - theta
        return PeriodInterval.normalizeParam(reflected, range.period, range.start)
    }

    protected override angleDerivativeSign(): 1 | -1 {
        return this._clockwise ? -1 : 1
    }

    private resetAngles(startAngle: number, endAngle: number, clockwise: boolean) {
        const s = this.normalizeAngle(startAngle)
        const startEqEnd = Precision.equal(startAngle, endAngle, Precision.CURVE_PARAM_EPS)
        let sweep = 0

        if (!startEqEnd) {
            const raw = clockwise ? (startAngle - endAngle) : (endAngle - startAngle)
            sweep = this.positiveMod(raw)
            if (Precision.equal(sweep, 0, Precision.CURVE_PARAM_EPS)) {
                sweep = MathConst.PI2
            }
        }

        this._clockwise = clockwise
        this.setRange(new PeriodInterval(s, s + sweep, MathConst.PI2))
    }

    private normalizeAngle(a: number) {
        const r = a % MathConst.PI2
        return r < 0 ? r + MathConst.PI2 : r
    }

    private positiveMod(x: number) {
        const r = x % MathConst.PI2
        return r < 0 ? r + MathConst.PI2 : r
    }
}
