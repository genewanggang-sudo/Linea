import { Vec2 } from '../core/vec2'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Curve2 } from './curve2'
import { PeriodInterval } from './period_interval'

/**
 * 圆族曲线基类（整圆与圆弧）。
 * 参数含义为角度参数。
 */
export abstract class CircleCurve2 extends Curve2 {
    protected _center: Vec2
    protected _radius: number

    constructor(center: Vec2, radius: number) {
        super()
        MathError.assert(Number.isFinite(center.x) && Number.isFinite(center.y), 'CircleCurve2: center must be finite')
        MathError.assert(Number.isFinite(radius) && radius > 0, 'CircleCurve2: radius must be > 0')
        this._center = center.clone()
        this._radius = radius
    }

    /** 圆心（返回副本） */
    public get center() {
        return this._center.clone()
    }

    /** 半径 */
    public get radius() {
        return this._radius
    }

    public override pointAt(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.pointAtAngle(uu)
    }

    public override getPtAt(u: number) {
        MathError.assert(Number.isFinite(u), 'CircleCurve2.getPtAt: u must be finite')
        return this.pointAtAngle(u)
    }

    public override getTangentAt(u: number) {
        const uu = this.normalizeParamForEval(u)
        return this.derivativeAtAngle(uu, 1, 1)
    }

    public override getDerivatives(u: number, n: number) {
        MathError.assert(Number.isInteger(n) && n >= 0, 'CircleCurve2.getDerivatives: n must be a non-negative integer')
        const uu = this.normalizeParamForEval(u)

        const ret: Vec2[] = [this.pointAtAngle(uu)]
        for (let i = 1; i <= n; i++) {
            ret.push(this.derivativeAtAngle(uu, i, 1))
        }
        return ret
    }

    public override curvatureAt(u: number) {
        this.normalizeParamForEval(u)
        return 1 / this._radius
    }

    /** 圆族结构有效性检查 */
    protected isCircleStructValid(eps = Precision.CURVE_LENGTH_EPS) {
        return Number.isFinite(this._center.x) &&
            Number.isFinite(this._center.y) &&
            Number.isFinite(this._radius) &&
            this._radius > eps
    }

    /** 由角度参数计算圆上点 */
    protected pointAtAngle(theta: number) {
        return new Vec2(
            this._center.x + this._radius * Math.cos(theta),
            this._center.y + this._radius * Math.sin(theta),
        )
    }

    /**
     * 按角参数计算导数（不含 0 阶点坐标）。
     * @param theta 角参数。
     * @param order 导数阶次（>=1）。
     * @param sign d(theta)/d(u) 的符号，逆向参数化取 -1。
     */
    protected derivativeAtAngle(theta: number, order: number, sign: 1 | -1) {
        const phase = order % 4
        let x = 0
        let y = 0
        switch (phase) {
            case 0:
                x = Math.cos(theta)
                y = Math.sin(theta)
                break
            case 1:
                x = -Math.sin(theta)
                y = Math.cos(theta)
                break
            case 2:
                x = -Math.cos(theta)
                y = -Math.sin(theta)
                break
            default:
                x = Math.sin(theta)
                y = -Math.cos(theta)
                break
        }
        // d^k/d u^k = d^k/d theta^k * (d theta / d u)^k
        // 当 sign = -1 时，奇数阶导翻转符号，偶数阶不变。
        const signPow = sign === 1 ? 1 : (order % 2 === 0 ? 1 : -1)
        return new Vec2(x, y).scale(this._radius * signPow)
    }

    /** 计算点相对圆心的极角 */
    protected angleOfPoint(p: Vec2) {
        return Math.atan2(p.y - this._center.y, p.x - this._center.x)
    }

    /**
     * 参数校验并归一化，保证端点求值稳定。
     * 对周期区间会归一化到当前区间窗口内。
     */
    protected normalizeParamForEval(u: number) {
        this._range.assertContains(u, Precision.CURVE_PARAM_EPS)

        const start = this._range.start
        const end = this._range.end
        if (Math.abs(u - start) <= Precision.CURVE_PARAM_EPS) return start
        if (Math.abs(u - end) <= Precision.CURVE_PARAM_EPS) return end

        if (this._range instanceof PeriodInterval) {
            return this._range.clamp(u)
        }
        return u
    }
}
