import { EN_GEO_TYPE } from '../constants/geom_type'
import { MathConst } from '../constants/math_const'
import { Box2 } from '../core/box2'
import { Mat3 } from '../core/mat3'
import { Vec2 } from '../core/vec2'
import type { IDBEllipse2 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { EllipseArc2 } from './ellipse_arc2'
import { EllipseCurve2 } from './ellipse_curve2'
import { Interval } from './interval'
import { PeriodInterval } from './period_interval'

@RegisterGeom
/**
 * 二维整椭圆曲线。
 * 参数域固定为 `PeriodInterval(0, 2π, 2π)`。
 */
export class Ellipse2 extends EllipseCurve2 {
    public static readonly type = EN_GEO_TYPE.Ellipse2

    /**
     * 构造整椭圆。
     * @param center 中心点。
     * @param rx 长半轴。
     * @param ry 短半轴。
     * @param rotation 椭圆局部 x 轴相对全局 x 轴旋转角（弧度）。
     */
    constructor(center: Vec2, rx: number, ry: number, rotation = 0) {
        super(center, rx, ry, rotation)
        this.setRange(new PeriodInterval(0, MathConst.PI2, MathConst.PI2))
    }

    public override split(u: number) {
        const range = this._range as PeriodInterval
        const parts = range.split(u, Precision.CURVE_PARAM_EPS)
        if (parts.length === 0) return []

        return parts
            .map((seg) => new EllipseArc2(this._center, this._rx, this._ry, this._rotation, seg.start, seg.end, false))
            .filter((arc) => arc.getLength() > Precision.CURVE_LENGTH_EPS)
    }

    public override trim(range: Interval) {
        this._range.assertContainsRange(range)
        if (range.length() <= Precision.CURVE_LENGTH_EPS) return []

        return [new EllipseArc2(this._center, this._rx, this._ry, this._rotation, range.start, range.end, false)]
    }

    public override reverse() {
        // 整椭圆反转后几何与参数域等价，保持不变即可。
        return this
    }

    public override transform(m: Mat3) {
        const next = this.transformedEllipseParams(m)
        MathError.assert(next.rx > Precision.CURVE_LENGTH_EPS && next.ry > Precision.CURVE_LENGTH_EPS, 'Ellipse2.transform: degenerate ellipse after transform')

        this._center = next.center
        this._rx = next.rx
        this._ry = next.ry
        this._rotation = next.rotation
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
        const evalAngle = (u: number) => normalizeParam(u)
        return this.solveProjectedParamOnSupport(
            p,
            range.start,
            range.start + range.period,
            (u) => this.pointAtAngle(evalAngle(u)),
            (u) => this.derivativeFromAngle(evalAngle(u), 1, 1),
            (u) => this.derivativeFromAngle(evalAngle(u), 2, 1),
            normalizeParam,
        )
    }

    public override boundingBox() {
        const c = Math.cos(this._rotation)
        const s = Math.sin(this._rotation)
        const ex = Math.hypot(this._rx * c, this._ry * s)
        const ey = Math.hypot(this._rx * s, this._ry * c)
        return new Box2(
            this._center.x - ex,
            this._center.y - ey,
            this._center.x + ex,
            this._center.y + ey,
        )
    }

    public override isValid(eps = Precision.CURVE_LENGTH_EPS) {
        return this.isEllipseStructValid(eps)
    }

    public override isClosed(): boolean {
        return true
    }

    public override isEllipse(): this is Ellipse2 {
        return true
    }

    /**
     * 结构等价判断（字段级）。
     * @param other 对比椭圆。
     * @param eps 数值容差。
     * @returns 中心、长短半轴和旋转角近似相等时返回 `true`。
     */
    public equals(other: Ellipse2, eps = Precision.EPS) {
        return this._center.equals(other._center, eps) &&
            Precision.equal(this._rx, other._rx, eps) &&
            Precision.equal(this._ry, other._ry, eps) &&
            Precision.equal(this._rotation, other._rotation, eps)
    }

    public override clone(): this {
        return new Ellipse2(this._center, this._rx, this._ry, this._rotation) as this
    }

    public override dump(): IDBEllipse2 {
        return {
            type: Ellipse2.type,
            center: { x: this._center.x, y: this._center.y },
            rx: this._rx,
            ry: this._ry,
            rotation: this._rotation,
        }
    }

    public static load(data: IDBEllipse2) {
        return new Ellipse2(
            new Vec2(data.center.x, data.center.y),
            data.rx,
            data.ry,
            data.rotation,
        )
    }

    protected override paramToAngleUnchecked(u: number) {
        const range = this._range as PeriodInterval
        return PeriodInterval.normalizeParam(u, range.period, range.start)
    }

    protected override angleToParam(theta: number) {
        const range = this._range as PeriodInterval
        return PeriodInterval.normalizeParam(theta, range.period, range.start)
    }

    protected override angleDerivativeSign(): 1 | -1 {
        return 1
    }
}
