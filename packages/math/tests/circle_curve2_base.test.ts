import { describe, expect, it } from 'vitest'

import { Box2 } from '../src/core/box2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { EN_GEO_TYPE } from '../src/constants/geom_type'
import { CircleCurve2 } from '../src/curves/circle_curve2'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import type { IDB } from '../src/serialize/dump_types'

class MockCircleCurve2 extends CircleCurve2 {
    constructor(center: Vec2, radius: number, periodic = true) {
        super(center, radius)
        this.setRange(periodic ? new PeriodInterval(0, Math.PI * 2, Math.PI * 2) : new Interval(0, 10))
    }

    public override getLength(range?: Interval) {
        if (!range) return this._range.length() * this._radius
        this._range.assertContainsRange(range)
        return range.length() * this._radius
    }

    public override lengthAtParam(u: number) {
        return this.normalizeParamForEval(u) - this._range.start
    }

    public override paramAtLength(s: number) {
        return this._range.start + s
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
        this._center = m.transformedPoint(this._center)
        return this
    }

    public override transformed(m: Mat3): this {
        return this.clone().transform(m)
    }

    public override closestPoint(p: Vec2) {
        const param = this._range.start
        const point = this.pointAt(param)
        return { point, param, distance: point.distanceTo(p) }
    }

    public override getParamAt(p: Vec2) {
        const angle = this.angleOfPoint(p)
        if (this._range instanceof PeriodInterval) {
            return PeriodInterval.normalizeParam(angle, this._range.period, this._range.start)
        }
        return angle
    }

    public override getBBox() {
        return new Box2(
            this._center.x - this._radius,
            this._center.y - this._radius,
            this._center.x + this._radius,
            this._center.y + this._radius,
        )
    }

    public override isValid() {
        return this.isCircleStructValid()
    }

    public override clone(): this {
        return new MockCircleCurve2(this._center, this._radius, this._range instanceof PeriodInterval) as this
    }

    public override dump(): IDB {
        return { type: EN_GEO_TYPE.Circle2 }
    }

    public angleOfPointForTest(p: Vec2) {
        return this.angleOfPoint(p)
    }

    public setRadiusForTest(radius: number) {
        this._radius = radius
    }

    public derivativeAtAngleForTest(theta: number, order: number, sign: 1 | -1) {
        return this.derivativeAtAngle(theta, order, sign)
    }
}

describe('CircleCurve2 base', () => {
    it('validates constructor parameters', () => {
        expect(() => new MockCircleCurve2(new Vec2(Number.NaN, 0), 1)).toThrow('CircleCurve2: center must be finite')
        expect(() => new MockCircleCurve2(new Vec2(0, 0), 0)).toThrow('CircleCurve2: radius must be > 0')
    })

    it('supports getters and defensive center copy', () => {
        const c = new MockCircleCurve2(new Vec2(1, 2), 3)
        const center = c.center
        center.setX(100)
        expect(c.center.equals(new Vec2(1, 2))).toBe(true)
        expect(c.radius).toBe(3)
    })

    it('evaluates point/tangent/derivatives for multiple orders', () => {
        const c = new MockCircleCurve2(new Vec2(0, 0), 2)
        expect(c.pointAt(0).equals(new Vec2(2, 0), 1e-9)).toBe(true)
        expect(c.getTangentAt(Math.PI / 2).equals(new Vec2(-2, 0), 1e-9)).toBe(true)

        const ds = c.getDerivatives(0.2, 4)
        expect(ds.length).toBe(5)
        expect(ds[1].len()).toBeCloseTo(2, 9)
        expect(ds[4].len()).toBeCloseTo(2, 9)
        expect(() => c.getDerivatives(0.1, -1)).toThrow('CircleCurve2.getDerivatives: n must be a non-negative integer')
    })

    it('supports periodic and non-periodic parameter normalization', () => {
        const periodic = new MockCircleCurve2(new Vec2(0, 0), 2, true)
        expect(periodic.pointAt(Math.PI * 2 + 0.5).equals(periodic.pointAt(0.5), 1e-9)).toBe(true)

        const bounded = new MockCircleCurve2(new Vec2(0, 0), 2, false)
        expect(() => bounded.pointAt(12)).toThrow('Interval.assertContains: parameter out of range')
        expect(bounded.pointAt(5).equals(periodic.pointAt(5), 1e-9)).toBe(true)
    })

    it('supports helper methods and validity checks', () => {
        const c = new MockCircleCurve2(new Vec2(0, 0), 2)
        expect(c.curvatureAt(0.3)).toBeCloseTo(0.5, 12)
        expect(c.angleOfPointForTest(new Vec2(0, 2))).toBeCloseTo(Math.PI / 2, 12)
        expect(c.derivativeAtAngleForTest(0.2, 2, -1).len()).toBeCloseTo(2, 12)
        expect(c.isValid()).toBe(true)

        c.setRadiusForTest(0)
        expect(c.isValid()).toBe(false)
    })
})
