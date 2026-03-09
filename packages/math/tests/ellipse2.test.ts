import { describe, expect, it } from 'vitest'

import { Ellipse2 } from '../src/curves/ellipse2'
import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'

describe('Ellipse2', () => {
    it('evaluates points and basic properties', () => {
        const e = new Ellipse2(new Vec2(0, 0), 4, 2, 0)
        expect(e.getDomain().equals(new PeriodInterval(0, Math.PI * 2, Math.PI * 2))).toBe(true)
        expect(e.getPtAt(0).equals(new Vec2(4, 0), 1e-9)).toBe(true)
        expect(e.getPtAt(Math.PI / 2).equals(new Vec2(0, 2), 1e-9)).toBe(true)
        expect(e.getLength()).toBeGreaterThan(0)
        expect(e.curvatureAt(0)).toBeGreaterThan(0)
    })

    it('split and trim return ellipse arcs', () => {
        const e = new Ellipse2(new Vec2(0, 0), 4, 2, 0)
        const parts = e.split(Math.PI)
        expect(parts.length).toBe(2)
        expect(parts[0] instanceof EllipseArc2).toBe(true)
        expect(e.split(0)).toEqual([])

        const trimmed = e.trim(new Interval(0, Math.PI / 2))
        expect(trimmed.length).toBe(1)
        expect(trimmed[0] instanceof EllipseArc2).toBe(true)
        expect(e.trim(new Interval(1, 1))).toEqual([])
    })

    it('closestPoint and paramAtLength', () => {
        const e = new Ellipse2(new Vec2(0, 0), 4, 2, 0)
        const cp = e.closestPoint(new Vec2(10, 0))
        expect(new Vec2(cp.point).equals(new Vec2(4, 0), 1e-6)).toBe(true)
        expect(e.getParamAt(new Vec2(10, 0))).toBeCloseTo(0, 3)
        expect(e.getParamAt(new Vec2(0, 0))).toBeCloseTo(e.getStartParam(), 12)

        const half = e.getLength() * 0.5
        const u = e.paramAtLength(half)
        expect(u).toBeGreaterThanOrEqual(e.getStartParam())
        expect(u).toBeLessThanOrEqual(e.getEndParam())
    })

    it('supports generic affine transform', () => {
        const e = new Ellipse2(new Vec2(0, 0), 4, 2, 0)
        const sheared = e.transformed(new Mat3(
            1, 0.5, 2,
            0.2, 1, -3,
            0, 0, 1,
        ))
        expect(sheared.isValid()).toBe(true)
        expect(sheared.center.equals(new Vec2(2, -3), 1e-9)).toBe(true)
        expect(e.reverse()).toBe(e)
        expect(() => e.transformed(Mat3.scaling(0, 0))).toThrow('Ellipse2.transform: degenerate ellipse after transform')
    })

    it('dump/load round-trip', () => {
        const e = new Ellipse2(new Vec2(1, 2), 4, 2, 0.3)
        const restored = Ellipse2.load(e.dump())
        expect(restored.getPtAt(Math.PI / 3).equals(e.getPtAt(Math.PI / 3), 1e-6)).toBe(true)
        expect(restored.equals(e)).toBe(true)
        expect(e.equals(new Ellipse2(new Vec2(1, 2), 4, 2, 0.31))).toBe(false)
        const normalized = (e as unknown as { angleToParam: (theta: number) => number }).angleToParam(Math.PI * 3)
        expect(normalized).toBeCloseTo(Math.PI, 9)
        const box = e.getBBox()
        expect(box.minX).toBeLessThan(box.maxX)

        const hacked = e as unknown as { _rx: number }
        hacked._rx = 0
        expect(e.isValid()).toBe(false)
    })
})
