import { describe, expect, it } from 'vitest'

import { Arc2 } from '../src/curves/arc2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import { Precision } from '../src/utils/precision'

describe('Arc2', () => {
    it('supports empty and full-span semantics', () => {
        const empty = new Arc2(new Vec2(0, 0), 2, 0, 0, false)
        expect(empty.getLength()).toBeCloseTo(0, 12)
        expect(empty.getDomain().equals(new PeriodInterval(0, Math.PI * 2, Math.PI * 2))).toBe(true)

        const full = new Arc2(new Vec2(0, 0), 2, 0, Math.PI * 2, false)
        expect(full.getLength()).toBeCloseTo(4 * Math.PI, 10)
        expect(() => new Arc2(new Vec2(0, 0), 1, Number.NaN, 0)).toThrow('Arc2: startAngle/endAngle must be finite')
    })

    it('evaluates clockwise and counter-clockwise arcs', () => {
        const ccw = new Arc2(new Vec2(0, 0), 1, 0, Math.PI / 2, false)
        expect(ccw.pointAt(ccw.startParam()).equals(new Vec2(1, 0), 1e-9)).toBe(true)
        expect(ccw.pointAt(ccw.endParam()).equals(new Vec2(0, 1), 1e-9)).toBe(true)
        expect(ccw.tangentAt(ccw.startParam()).equals(new Vec2(0, 1), 1e-9)).toBe(true)
        const ds = ccw.derivatives(ccw.startParam(), 4)
        expect(ds.length).toBe(5)
        expect(ds[2].x).toBeCloseTo(-1, 9)

        const cw = new Arc2(new Vec2(0, 0), 1, 0, -Math.PI / 2, true)
        expect(cw.pointAt(cw.startParam()).equals(new Vec2(1, 0), 1e-9)).toBe(true)
        expect(cw.pointAt(cw.endParam()).equals(new Vec2(0, -1), 1e-9)).toBe(true)
        expect(cw.tangentAt(cw.startParam()).equals(new Vec2(0, -1), 1e-9)).toBe(true)
        expect(cw.derivatives(cw.startParam(), 2)[1].y).toBeLessThan(0)
        expect(() => cw.derivatives(0, -1)).toThrow('Arc2.derivatives: n must be a non-negative integer')
        expect(cw.curvatureAt(cw.startParam())).toBeCloseTo(1, 12)
    })

    it('split/trim/reverse', () => {
        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI, false)
        expect(arc.split(arc.startParam())).toEqual([])

        const mid = (arc.startParam() + arc.endParam()) * 0.5
        const parts = arc.split(mid)
        expect(parts.length).toBe(2)
        expect(parts[0].getLength() + parts[1].getLength()).toBeCloseTo(arc.getLength(), 9)

        const trimmed = arc.trim(new Interval(arc.startParam(), mid))
        expect(trimmed.length).toBe(1)
        expect(arc.trim(new Interval(mid, mid))).toEqual([])
        expect(arc.trim(new Interval(mid, mid + 2e-9))).toEqual([])
        expect(() => arc.trim(new Interval(-1, 0))).toThrow('Interval.assertContainsRange: range out of bounds')

        const reversed = arc.clone().reverse()
        expect(reversed.clockwise).toBe(true)
        expect(reversed.getLength()).toBeCloseTo(arc.getLength(), 12)
    })

    it('closestPoint and strict range behavior', () => {
        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI / 2, false)
        const result = arc.closestPoint(new Vec2(3, 0))
        expect(new Vec2(result.point).equals(new Vec2(2, 0), 1e-9)).toBe(true)
        expect(arc.getParamAt(new Vec2(-3, 0))).toBeCloseTo(Math.PI, 12)
        const opposite = arc.closestPoint(new Vec2(-3, 0))
        expect(new Vec2(opposite.point).equals(new Vec2(0, 2), 1e-9)).toBe(true)
        const nearCenter = arc.closestPoint(new Vec2(0, 0))
        expect(nearCenter.param).toBeCloseTo(arc.startParam(), 9)
        expect(arc.getParamAt(new Vec2(0, 0))).toBeCloseTo(arc.startParam(), 12)
        expect(arc.getLength(new Interval(arc.startParam(), arc.endParam()))).toBeCloseTo(arc.getLength(), 10)
        expect(arc.lengthAtParam(arc.endParam())).toBeCloseTo(arc.getLength(), 10)
        expect(() => arc.paramAtLength(1, 0)).toThrow('Arc2.paramAtLength: tol must be > 0')
        expect(() => arc.pointAt(arc.endParam() + 1)).toThrow('Interval.assertContains: parameter out of range')

        const oldLenEps = Precision.CURVE_LENGTH_EPS
        try {
            Precision.CURVE_LENGTH_EPS = 10
            const tie = arc.closestPoint(new Vec2(2, 2))
            expect(tie.param).toBeCloseTo(arc.startParam(), 9)
        } finally {
            Precision.CURVE_LENGTH_EPS = oldLenEps
        }
    })

    it('containsParam supports periodic equivalent parameters', () => {
        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI / 2, false)
        expect(arc.containsParam(Math.PI / 4)).toBe(true)
        expect(arc.containsParam(Math.PI * 2 + Math.PI / 4)).toBe(true)
        expect(arc.containsParam(Math.PI * 2 + Math.PI)).toBe(false)
        expect(arc.getDomain().contains(Math.PI * 2 + Math.PI / 4)).toBe(true)
    })

    it('transform requires similarity and mirror flips clockwise', () => {
        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI / 2, false)
        const mirrored = arc.transformed(Mat3.scaling(-1, 1))
        expect(mirrored.clockwise).toBe(true)
        const moved = arc.transformed(Mat3.translation(1, 2))
        expect(moved.clockwise).toBe(false)

        const shear = new Mat3(
            1, 0.5, 0,
            0, 1, 0,
            0, 0, 1,
        )
        expect(() => arc.transformed(shear)).toThrow('Arc2.transform: matrix must be a 2D similarity transform')

        const full = new Arc2(new Vec2(0, 0), 2, 0, Math.PI * 2, false)
        const transformedFull = full.transformed(Mat3.scaling(-1, 1))
        expect(transformedFull.clockwise).toBe(true)
        const fullNonMirror = new Arc2(new Vec2(0, 0), 2, 0, Math.PI * 2, false)
        fullNonMirror.transform(Mat3.translation(1, 0))
        expect(fullNonMirror.clockwise).toBe(false)

        const forcedFull = new Arc2(new Vec2(0, 0), 2, 0, 1, false)
        ;(forcedFull as unknown as { _range: PeriodInterval })._range = new PeriodInterval(0, Math.PI * 2, Math.PI * 2)
        forcedFull.transform(Mat3.scaling(-1, 1))
        expect(forcedFull.clockwise).toBe(true)
    })

    it('dump/load round-trip', () => {
        const arc = new Arc2(new Vec2(1, 2), 3, 0.2, 1.3, true)
        const restored = Arc2.load(arc.dump())
        expect(restored.clockwise).toBe(true)
        expect(restored.getLength()).toBeCloseTo(arc.getLength(), 10)
        expect(restored.equals(arc)).toBe(true)
        expect(arc.equals(new Arc2(new Vec2(1, 2), 3, 0.2, 1.3, false))).toBe(false)
        const box = arc.boundingBox()
        expect(box.minX).toBeLessThanOrEqual(box.maxX)
        const tiny = new Arc2(new Vec2(0, 0), 2, 0.1, 0.11, false)
        expect(tiny.boundingBox().isFinite()).toBe(true)
        expect(arc.isValid()).toBe(true)

        const hacked = arc as unknown as { _radius: number }
        hacked._radius = 0
        expect(arc.isValid()).toBe(false)
    })
})
