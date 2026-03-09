import { describe, expect, it } from 'vitest'

import { Line2 } from '../src/curves/line2'
import { Interval } from '../src/curves/interval'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { Precision } from '../src/utils/precision'

describe('Line2', () => {
    it('constructs with length-based parameter range', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(3, 4))
        expect(line.getRange().equals(new Interval(0, 5))).toBe(true)
        expect(line.getDomain().start).toBe(Number.NEGATIVE_INFINITY)
        expect(line.getDomain().end).toBe(Number.POSITIVE_INFINITY)
        expect(line.getLength()).toBeCloseTo(5, 12)
        expect(line.getLength(new Interval(1, 3))).toBeCloseTo(2, 12)
        const s = line.start
        const e = line.end
        s.x = 100
        e.y = 100
        expect(line.start.equals(new Vec2(0, 0))).toBe(true)
        expect(line.end.equals(new Vec2(3, 4))).toBe(true)
    })

    it('throws on degenerate input', () => {
        expect(() => new Line2(new Vec2(1, 1), new Vec2(1, 1))).toThrow('Line2: start and end must not coincide')
    })

    it('evaluates point/tangent and validates range', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(10, 0))
        expect(line.getPtAt(0).equals(new Vec2(0, 0))).toBe(true)
        expect(line.getPtAt(10).equals(new Vec2(10, 0))).toBe(true)
        expect(line.getTangentAt(3).equals(new Vec2(1, 0))).toBe(true)
    })

    it('lengthAtParam and paramAtLength are linear', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(0, 8))
        expect(line.lengthAtParam(3)).toBeCloseTo(3, 12)
        expect(line.paramAtLength(7)).toBeCloseTo(7, 12)
        expect(line.getParamAt(new Vec2(0, 10))).toBeCloseTo(10, 12)
        expect(line.getParamAt(new Vec2(0, -2))).toBeCloseTo(-2, 12)
        expect(line.containsProjectedPt(new Vec2(0, 3))).toBe(true)
        expect(line.containsProjectedPt(new Vec2(0, 10))).toBe(false)
        expect(line.getProjectedPtBy(new Vec2(0, 3)).equals(new Vec2(0, 3), 1e-12)).toBe(true)
        expect(line.getProjectedPtBy(new Vec2(0, 10)).equals(new Vec2(0, 10), 1e-12)).toBe(true)
        expect(line.containsPt(new Vec2(0, 3))).toBe(true)
        expect(line.containsPt(new Vec2(Precision.CURVE_LENGTH_EPS * 0.5, 3))).toBe(true)
        expect(line.containsPt(new Vec2(0, 10))).toBe(false)
        expect(line.paramAtLength(-1e-10)).toBeCloseTo(0, 12)
        expect(line.paramAtLength(8 + 1e-10)).toBeCloseTo(8, 12)
        expect(() => line.paramAtLength(1, 0)).toThrow('Line2.paramAtLength: tol must be > 0')
        expect(() => line.paramAtLength(9)).toThrow('Line2.paramAtLength: s out of range')
    })

    it('split and trim follow strict rules', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(10, 0))
        expect(line.split(0)).toEqual([])
        expect(line.split(10)).toEqual([])

        const s = line.split(3)
        expect(s.length).toBe(2)
        expect(s[0].getLength()).toBeCloseTo(3, 12)
        expect(s[1].getLength()).toBeCloseTo(7, 12)

        const t = line.trim(new Interval(2, 8))
        expect(t.length).toBe(1)
        expect(t[0].getLength()).toBeCloseTo(6, 12)
        expect(() => line.trim(new Interval(-1, 2))).toThrow('Interval.assertContainsRange: range out of bounds')
    })

    it('reverse and transform', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(2, 0))
        const rev = line.clone().reverse().reverse()
        expect(rev.getPtAt(0).equals(line.getPtAt(0))).toBe(true)
        expect(rev.getPtAt(2).equals(line.getPtAt(2))).toBe(true)

        const moved = line.transformed(Mat3.translation(3, 4))
        expect(moved.getPtAt(0).equals(new Vec2(3, 4))).toBe(true)
        expect(() => line.transformed(Mat3.scaling(0, 0))).toThrow('Line2.transform: degenerate line after transform')
    })

    it('covers derivatives/curvature/isValid and trim edge cases', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(5, 0))
        const ds = line.getDerivatives(2, 3)
        expect(ds.length).toBe(4)
        expect(ds[2].equals(Vec2.zero(), 1e-12)).toBe(true)
        expect(ds[3].equals(Vec2.zero(), 1e-12)).toBe(true)
        expect(() => line.getDerivatives(2, -1)).toThrow('Line2.getDerivatives: n must be a non-negative integer')
        expect(line.curvatureAt(2)).toBe(0)

        expect(line.trim(new Interval(2, 2))).toEqual([])
        expect(line.trim(new Interval(2, 2 + 1e-12))).toEqual([])
        expect(line.trim(new Interval(2, 2 + 5e-9))).toEqual([])

        const cpHead = line.closestPoint(new Vec2(-10, 1))
        expect(new Vec2(cpHead.point).equals(new Vec2(0, 0), 1e-12)).toBe(true)
        const cpTail = line.closestPoint(new Vec2(10, 1))
        expect(new Vec2(cpTail.point).equals(new Vec2(5, 0), 1e-12)).toBe(true)

        const hacked = line as unknown as { _end: Vec2 }
        hacked._end = new Vec2(Number.NaN, 0)
        expect(line.isValid()).toBe(false)

        const hacked2 = line as unknown as { _start: Vec2; _end: Vec2 }
        hacked2._start = new Vec2(Number.NaN, 0)
        hacked2._end = new Vec2(0, 0)
        expect(line.isValid()).toBe(false)
        hacked2._start = new Vec2(0, 0)
        hacked2._end = new Vec2(1e-12, 0)
        expect(line.isValid()).toBe(false)
    })

    it('closestPoint and dump/load', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(10, 0))
        const c = line.closestPoint(new Vec2(3, 4))
        expect(new Vec2(c.point).equals(new Vec2(3, 0))).toBe(true)
        expect(c.param).toBeCloseTo(3, 12)
        expect(c.distance).toBeCloseTo(4, 12)

        const dumped = line.dump()
        const restored = Line2.load(dumped)
        expect(restored.getPtAt(5).equals(line.getPtAt(5))).toBe(true)
        expect(restored.equals(line)).toBe(true)

        const reversed = new Line2(new Vec2(10, 0), new Vec2(0, 0))
        expect(line.equals(reversed)).toBe(false)
        const box = line.getBBox()
        expect(box.minX).toBe(0)
        expect(box.maxX).toBe(10)
    })
})
