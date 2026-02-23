import { describe, expect, it } from 'vitest'

import { Box2 } from '../src/core/box2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { EN_GEO_TYPE } from '../src/constants/geom_type'
import { Curve2 } from '../src/curves/curve2'
import { Interval } from '../src/curves/interval'
import type { IDB } from '../src/serialize/dump_types'

class MockCurve2 extends Curve2 {
    constructor() {
        super()
        this.setRange(new Interval(0, 1))
    }

    public override pointAt(u: number) {
        return new Vec2(u, 0)
    }

    public override tangentAt(u: number) {
        void u
        return new Vec2(1, 0)
    }

    public override derivatives(u: number, n: number) {
        const ret = [this.pointAt(u)]
        for (let i = 1; i <= n; i++) {
            ret.push(new Vec2(i, 0))
        }
        return ret
    }

    public override curvatureAt(u: number) {
        void u
        return 0
    }

    public override length(range?: Interval) {
        void range
        return 1
    }

    public override lengthAtParam(u: number) {
        return u
    }

    public override paramAtLength(s: number) {
        return s
    }

    public override split(u: number) {
        void u
        return []
    }

    public override trim(range: Interval) {
        void range
        return [this.clone()]
    }

    public override reverse() {
        return this
    }

    public override transform(m: Mat3) {
        void m
        return this
    }

    public override transformed(m: Mat3) {
        void m
        return this.clone()
    }

    public override closestPoint(p: Vec2) {
        const point = new Vec2(p.x, 0)
        return { point, param: p.x, distance: Math.abs(p.y) }
    }

    public override boundingBox() {
        return new Box2(new Vec2(0, 0), new Vec2(1, 0))
    }

    public override isValid() {
        return true
    }

    public override clone() {
        return new MockCurve2()
    }

    public override dump(): IDB {
        return { type: EN_GEO_TYPE.Vec2 }
    }

    public setRangeForTest(range: Interval) {
        this.setRange(range)
    }
}

describe('Curve2 base methods', () => {
    it('stores param range in base class', () => {
        const c = new MockCurve2()
        const r = c.getRange()
        expect(r.equals(new Interval(0, 1))).toBe(true)
        expect(r).not.toBe(c.getRange())
    })

    it('getRange returns defensive copy', () => {
        const c = new MockCurve2()
        const r = c.getRange()
        r.expand(1)

        const current = c.getRange()
        expect(current.equals(new Interval(0, 1))).toBe(true)
    })

    it('setRange stores a defensive copy', () => {
        const c = new MockCurve2()
        const src = new Interval(2, 3)
        c.setRangeForTest(src)
        src.expand(1)
        expect(c.getRange().equals(new Interval(2, 3))).toBe(true)
    })

    it('derivativeAt derives from derivatives', () => {
        const c = new MockCurve2()
        const d2 = c.derivativeAt(0.3, 2)
        expect(d2.equals(new Vec2(2, 0))).toBe(true)
    })

    it('closestParam and distanceToPoint derive from closestPoint', () => {
        const c = new MockCurve2()
        const p = new Vec2(0.4, 3)
        expect(c.closestParam(p)).toBeCloseTo(0.4, 12)
        expect(c.distanceToPoint(p)).toBeCloseTo(3, 12)
    })

    it('derivativeAt validates order', () => {
        const c = new MockCurve2()
        expect(() => c.derivativeAt(0, -1)).toThrow()
    })
})
