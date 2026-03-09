import { describe, expect, it } from 'vitest'

import { Box2 } from '../src/core/box2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { EN_GEO_TYPE } from '../src/constants/geom_type'
import { EllipseCurve2 } from '../src/curves/ellipse_curve2'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import { Precision } from '../src/utils/precision'
import type { IDB } from '../src/serialize/dump_types'

class MockEllipseCurve2 extends EllipseCurve2 {
    private readonly _sign: 1 | -1

    constructor(center: Vec2, rx: number, ry: number, rotation = 0, sign: 1 | -1 = 1, periodic = true) {
        super(center, rx, ry, rotation)
        this._sign = sign
        this.setRange(periodic ? new PeriodInterval(0, Math.PI * 2, Math.PI * 2) : new Interval(0, 4))
    }

    public override split() {
        return []
    }

    public override trim() {
        return []
    }

    public override reverse() {
        return this
    }

    public override transform(m: Mat3) {
        const next = this.transformedEllipseParams(m)
        this._center = next.center
        this._rx = next.rx
        this._ry = next.ry
        this._rotation = next.rotation
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override isValid() {
        return this.isEllipseStructValid()
    }

    public override getParamAt(p: Vec2) {
        const range = this._range instanceof PeriodInterval ? this._range : new PeriodInterval(this._range.start, this._range.start + Math.PI * 2, Math.PI * 2)
        const normalizeParam = (u: number) => PeriodInterval.normalizeParam(u, range.period, range.start)
        if (p.distanceToSq(this._center) <= Precision.CURVE_LENGTH_EPS_SQ) {
            return range.start
        }
        return this.solveProjectedParamOnSupport(
            p,
            range.start,
            range.start + range.period,
            (u) => this.pointAtAngle(this._sign === 1 ? normalizeParam(u) : -normalizeParam(u)),
            (u) => this.derivativeFromAngle(this._sign === 1 ? normalizeParam(u) : -normalizeParam(u), 1, this._sign),
            (u) => this.derivativeFromAngle(this._sign === 1 ? normalizeParam(u) : -normalizeParam(u), 2, this._sign),
            normalizeParam,
        )
    }

    public override clone(): this {
        return new MockEllipseCurve2(
            this._center,
            this._rx,
            this._ry,
            this._rotation,
            this._sign,
            this._range instanceof PeriodInterval,
        ) as this
    }

    public override dump(): IDB {
        return { type: EN_GEO_TYPE.Ellipse2 }
    }

    protected override paramToAngleUnchecked(u: number) {
        return this._sign === 1 ? u : -u
    }

    protected override angleToParam(theta: number) {
        return this._sign === 1 ? theta : -theta
    }

    protected override angleDerivativeSign(): 1 | -1 {
        return this._sign
    }

    public compareParamForTieBreakForTest(a: number, b: number) {
        return this.compareParamForTieBreak(a, b)
    }

    public transformedEllipseParamsForTest(m: Mat3) {
        return this.transformedEllipseParams(m)
    }

    public angleFromPointOnEllipseForTest(p: Vec2, center: Vec2, rx: number, ry: number, rotation: number) {
        return this.angleFromPointOnEllipse(p, center, rx, ry, rotation)
    }

    public derivativeFromAngleForTest(theta: number, order: number, sign: 1 | -1) {
        return this.derivativeFromAngle(theta, order, sign)
    }

    public integrateLengthForTest(u0: number, u1: number, depth = 0) {
        return this.integrateLength(u0, u1, depth)
    }

    public normalizeParamForEvalForTest(u: number) {
        return this.normalizeParamForEval(u)
    }
}

describe('EllipseCurve2 base', () => {
    it('validates constructor parameters', () => {
        expect(() => new MockEllipseCurve2(new Vec2(Number.NaN, 0), 1, 1)).toThrow('EllipseCurve2: center must be finite')
        expect(() => new MockEllipseCurve2(new Vec2(0, 0), 0, 1)).toThrow('EllipseCurve2: rx must be > 0')
        expect(() => new MockEllipseCurve2(new Vec2(0, 0), 1, 0)).toThrow('EllipseCurve2: ry must be > 0')
        expect(() => new MockEllipseCurve2(new Vec2(0, 0), 1, 1, Number.NaN)).toThrow('EllipseCurve2: rotation must be finite')
    })

    it('supports getters and eval methods', () => {
        const e = new MockEllipseCurve2(new Vec2(1, 2), 4, 2, 0.1)
        expect(e.center.equals(new Vec2(1, 2))).toBe(true)
        expect(e.rx).toBe(4)
        expect(e.ry).toBe(2)
        expect(e.rotation).toBeCloseTo(0.1, 12)

        expect(e.pointAt(0).distanceTo(new Vec2(1 + 4 * Math.cos(0.1), 2 + 4 * Math.sin(0.1)))).toBeLessThan(1e-9)
        expect(e.tangentAt(0).len()).toBeGreaterThan(0)
        expect(e.derivatives(0.3, 4).length).toBe(5)
        expect(() => e.derivatives(0.3, -1)).toThrow('EllipseCurve2.derivatives: n must be a non-negative integer')
    })

    it('supports length and inverse length mapping', () => {
        const e = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0)
        const total = e.length()
        expect(total).toBeGreaterThan(0)
        expect(e.lengthAtParam(e.startParam())).toBeCloseTo(0, 8)

        const u = e.paramAtLength(total * 0.3)
        expect(u).toBeGreaterThanOrEqual(e.startParam())
        expect(u).toBeLessThanOrEqual(e.endParam())

        expect(e.paramAtLength(0, 1e-8)).toBeCloseTo(e.startParam(), 12)
        expect(e.paramAtLength(total, 1e-8)).toBeCloseTo(e.endParam(), 12)

        expect(() => e.paramAtLength(1, 0)).toThrow('EllipseCurve2.paramAtLength: tol must be > 0')
        expect(e.length(new Interval(-1, 0))).toBeGreaterThan(0)
        const nonPeriodic = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0, 1, false)
        expect(() => nonPeriodic.length(new Interval(-1, 0))).toThrow('Interval.assertContainsRange: range out of bounds')
        expect(nonPeriodic.normalizeParamForEvalForTest(2)).toBe(2)
        expect(e.integrateLengthForTest(1, 0)).toBe(0)
        expect(e.integrateLengthForTest(0, 1, Precision.CURVE_INTEGRAL_MAX_DEPTH)).toBeGreaterThan(0)
    })

    it('supports closestPoint and tie-break compare helper', () => {
        const e = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0)
        const cp = e.closestPoint(new Vec2(10, 0))
        expect(new Vec2(cp.point).x).toBeCloseTo(4, 3)
        expect(() => e.closestPoint(new Vec2(0, 0), 0)).toThrow('EllipseCurve2.closestPoint: tol must be > 0')

        expect(e.compareParamForTieBreakForTest(0.1, 0.2)).toBeLessThan(0)
        const nonPeriodic = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0, 1, false)
        expect(nonPeriodic.compareParamForTieBreakForTest(3, 1)).toBeGreaterThan(0)
    })

    it('supports transform helper functions and sign branch', () => {
        const mirrored = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0, -1)
        expect(mirrored.derivatives(0.2, 1)[1].len()).toBeGreaterThan(0)
        const signPos = mirrored.derivativeFromAngleForTest(0.3, 1, 1)
        const signNeg = mirrored.derivativeFromAngleForTest(0.3, 1, -1)
        expect(signPos.dot(signNeg)).toBeLessThan(0)
        const evenSignPos = mirrored.derivativeFromAngleForTest(0.3, 2, 1)
        const evenSignNeg = mirrored.derivativeFromAngleForTest(0.3, 2, -1)
        expect(evenSignPos.equals(evenSignNeg, 1e-12)).toBe(true)

        const e = new MockEllipseCurve2(new Vec2(1, -2), 4, 2, 0.3)
        const params = e.transformedEllipseParamsForTest(new Mat3(
            1, 0.5, 3,
            0.2, 1, -4,
            0, 0, 1,
        ))
        expect(params.rx).toBeGreaterThan(0)
        expect(params.ry).toBeGreaterThan(0)
        expect(params.center.equals(new Vec2(3, -5.8), 1e-9)).toBe(true)

        const pt = new Vec2(4, 0)
        const theta = e.angleFromPointOnEllipseForTest(pt, new Vec2(0, 0), 4, 2, 0)
        expect(theta).toBeCloseTo(0, 12)

        const swapped = new MockEllipseCurve2(new Vec2(0, 0), 1, 4, 0)
        const s = swapped.transformedEllipseParamsForTest(Mat3.identity())
        expect(s.rx).toBeGreaterThanOrEqual(s.ry)
    })

    it('can force non-convergent branches via bounded iteration', () => {
        const e = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, 0)
        const oldIter = Precision.CURVE_MAX_ITER
        Precision.CURVE_MAX_ITER = 0
        expect(() => e.paramAtLength(1)).toThrow('EllipseCurve2.paramAtLength: failed to converge')
        expect(() => e.closestPoint(new Vec2(10, 0))).toThrow('EllipseCurve2.closestPoint: failed to converge')
        Precision.CURVE_MAX_ITER = oldIter
    })

    it('boundingBox and validity checks', () => {
        const e = new MockEllipseCurve2(new Vec2(0, 0), 4, 2, Math.PI / 6)
        const box = e.boundingBox()
        expect(box).toBeInstanceOf(Box2)
        expect(e.isValid()).toBe(true)

        const hacked = e as unknown as { _rx: number }
        hacked._rx = 0
        expect(e.isValid()).toBe(false)
    })
})
