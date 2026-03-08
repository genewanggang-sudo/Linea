import { describe, expect, it } from 'vitest'

import { Arc2 } from '../src/curves/arc2'
import { Circle2 } from '../src/curves/circle2'
import { Interval } from '../src/curves/interval'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'

describe('Circle2', () => {
    it('uses periodic range and analytic evaluation', () => {
        const c = new Circle2(new Vec2(1, 2), 3)
        expect(c.getRange().length()).toBeCloseTo(Math.PI * 2, 12)
        expect(c.pointAt(0).equals(new Vec2(4, 2), 1e-12)).toBe(true)
        expect(c.length()).toBeCloseTo(6 * Math.PI, 12)
        expect(c.curvatureAt(1.2)).toBeCloseTo(1 / 3, 12)
        expect(c.length(new Interval(0, Math.PI))).toBeCloseTo(3 * Math.PI, 12)
        expect(c.lengthAtParam(Math.PI)).toBeCloseTo(3 * Math.PI, 12)
        expect(c.pointAt(Math.PI * 4 + Math.PI / 3).equals(c.pointAt(Math.PI / 3), 1e-9)).toBe(true)
    })

    it('split/trim return arcs', () => {
        const c = new Circle2(new Vec2(0, 0), 2)
        expect(c.split(0)).toEqual([])
        expect(c.split(Math.PI * 2)).toEqual([])

        const parts = c.split(Math.PI)
        expect(parts.length).toBe(2)
        expect(parts[0] instanceof Arc2).toBe(true)
        expect(parts[1] instanceof Arc2).toBe(true)

        const trimmed = c.trim(new Interval(0, Math.PI / 2))
        expect(trimmed.length).toBe(1)
        expect(trimmed[0] instanceof Arc2).toBe(true)
        expect(trimmed[0].length()).toBeCloseTo(Math.PI, 12)
        expect(c.trim(new Interval(1, 1))).toEqual([])
        expect(c.trim(new Interval(0, 5e-10))).toEqual([])
    })

    it('closestPoint tie-break at center picks range start', () => {
        const c = new Circle2(new Vec2(0, 0), 2)
        const result = c.closestPoint(new Vec2(0, 0))
        expect(result.param).toBeCloseTo(c.startParam(), 12)
        expect(c.getParamAt(new Vec2(0, 0))).toBeCloseTo(c.startParam(), 12)
        expect(c.getParamAt(new Vec2(0, 3))).toBeCloseTo(Math.PI / 2, 12)
    })

    it('transform requires similarity and supports mirror', () => {
        const c = new Circle2(new Vec2(0, 0), 2)
        const moved = c.transformed(Mat3.translation(3, 4).scale(2, 2))
        expect(moved.length()).toBeCloseTo(c.length() * 2, 10)

        const mirror = c.transformed(Mat3.scaling(-1, 1))
        expect(mirror.length()).toBeCloseTo(c.length(), 12)
        expect(c.reverse()).toBe(c)
        expect(() => c.paramAtLength(1, 0)).toThrow('Circle2.paramAtLength: tol must be > 0')
        expect(c.paramAtLength(-1e-10)).toBeCloseTo(0, 12)
        expect(c.paramAtLength(c.length() + 1e-10)).toBeCloseTo(Math.PI * 2, 12)

        const shear = new Mat3(
            1, 1, 0,
            0, 1, 0,
            0, 0, 1,
        )
        expect(() => c.transformed(shear)).toThrow('Circle2.transform: matrix must be a 2D similarity transform')
        expect(() => c.transformed(Mat3.scaling(0, 0))).toThrow('Circle2.transform: matrix must be a 2D similarity transform')
    })

    it('dump/load round-trip', () => {
        const c = new Circle2(new Vec2(1, -2), 5)
        const restored = Circle2.load(c.dump())
        expect(restored.pointAt(Math.PI / 3).equals(c.pointAt(Math.PI / 3), 1e-9)).toBe(true)
        expect(restored.equals(c)).toBe(true)
        expect(c.equals(new Circle2(new Vec2(1, -2), 4.9))).toBe(false)

        const cp = c.closestPoint(new Vec2(6, -2))
        expect(cp.param).toBeCloseTo(0, 9)
        const box = c.boundingBox()
        expect(box.minX).toBeCloseTo(-4, 12)
        expect(box.maxY).toBeCloseTo(3, 12)

        const hacked = c as unknown as { _radius: number }
        hacked._radius = 0
        expect(c.isValid()).toBe(false)
    })
})
