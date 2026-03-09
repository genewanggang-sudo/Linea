import { describe, expect, it } from 'vitest'

import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'

describe('EllipseArc2', () => {
    it('handles clockwise and counter-clockwise mapping', () => {
        const ccw = new EllipseArc2(new Vec2(0, 0), 4, 2, 0, 0, Math.PI / 2, false)
        expect(ccw.getDomain().equals(new PeriodInterval(0, Math.PI * 2, Math.PI * 2))).toBe(true)
        expect(ccw.pointAt(ccw.getStartParam()).equals(new Vec2(4, 0), 1e-9)).toBe(true)
        expect(ccw.pointAt(ccw.getEndParam()).equals(new Vec2(0, 2), 1e-9)).toBe(true)
        expect(new EllipseArc2(new Vec2(0, 0), 4, 2, 0, -0.2, 0.3, false).startAngle).toBeGreaterThan(0)

        const cw = new EllipseArc2(new Vec2(0, 0), 4, 2, 0, 0, -Math.PI / 2, true)
        expect(cw.pointAt(cw.getEndParam()).equals(new Vec2(0, -2), 1e-9)).toBe(true)
        expect(cw.getTangentAt(cw.getStartParam()).y).toBeLessThan(0)
        expect(cw.endAngle).toBeLessThanOrEqual(Math.PI * 2)
        expect(() => new EllipseArc2(new Vec2(0, 0), 4, 2, 0, Number.NaN, 0)).toThrow('EllipseArc2: startAngle/endAngle must be finite')
    })

    it('split/trim/reverse', () => {
        const arc = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.2, 0, Math.PI, false)
        expect(arc.split(arc.getStartParam())).toEqual([])
        const mid = (arc.getStartParam() + arc.getEndParam()) * 0.5
        const parts = arc.split(mid)
        expect(parts.length).toBe(2)

        const trimmed = arc.trim(new Interval(arc.getStartParam(), mid))
        expect(trimmed.length).toBe(1)
        expect(arc.trim(new Interval(mid, mid))).toEqual([])
        expect(arc.trim(new Interval(mid, mid + 2e-9))).toEqual([])

        const rev = arc.clone().reverse()
        expect(rev.clockwise).toBe(true)
        expect(rev.getLength()).toBeCloseTo(arc.getLength(), 10)
    })

    it('transform updates orientation on mirror', () => {
        const arc = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.1, 0, Math.PI / 2, false)
        const mirrored = arc.transformed(Mat3.scaling(-1, 1))
        expect(mirrored.clockwise).toBe(true)
        const moved = arc.transformed(Mat3.translation(1, 2))
        expect(moved.clockwise).toBe(false)

        const full = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.1, 0, Math.PI * 2, false)
        const transformedFull = full.transformed(Mat3.scaling(-1, 1))
        expect(transformedFull.clockwise).toBe(true)
        const fullNonMirror = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.1, 0, Math.PI * 2, false)
        fullNonMirror.transform(Mat3.translation(1, 2))
        expect(fullNonMirror.clockwise).toBe(false)

        const forcedFull = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.1, 0, 1, false)
        ;(forcedFull as unknown as { _range: PeriodInterval })._range = new PeriodInterval(0, Math.PI * 2, Math.PI * 2)
        forcedFull.transform(Mat3.scaling(-1, 1))
        expect(forcedFull.clockwise).toBe(true)
    })

    it('strict range and dump/load', () => {
        const arc = new EllipseArc2(new Vec2(1, 2), 4, 2, 0.1, 0, 1.2, false)
        expect(arc.containsProjectedPt(arc.getStartPt())).toBe(true)
        expect(arc.containsProjectedPt(new Vec2(-10, 2))).toBe(false)
        expect(arc.getProjectedPtBy(arc.getStartPt()).equals(arc.getStartPt(), 1e-9)).toBe(true)
        expect(arc.getProjectedPtBy(new Vec2(-10, 2)).equals(
            arc.getPtAt(arc.getParamAt(new Vec2(-10, 2))),
            1e-9,
        )).toBe(true)
        expect(arc.containsPt(arc.getProjectedPtBy(new Vec2(-10, 2)))).toBe(false)
        expect(arc.containsPt(arc.getStartPt())).toBe(true)
        expect(arc.containsPt(arc.getPtAt((arc.getStartParam() + arc.getEndParam()) * 0.5))).toBe(true)
        expect(arc.containsPt(new Vec2(-10, 2))).toBe(false)
        expect(() => arc.pointAt(arc.getEndParam() + 0.5)).toThrow('Interval.assertContains: parameter out of range')
        expect(arc.getParamAt(new Vec2(-10, 2))).toBeGreaterThan(arc.getEndParam())
        expect(arc.getParamAt(new Vec2(1, 2))).toBeCloseTo(arc.getStartParam(), 12)

        const restored = EllipseArc2.load(arc.dump())
        expect(restored.getLength()).toBeCloseTo(arc.getLength(), 10)
        expect(restored.equals(arc)).toBe(true)
        expect(arc.equals(new EllipseArc2(new Vec2(1, 2), 4, 2, 0.1, 0, 1.2, true))).toBe(false)
        const ccw = new EllipseArc2(new Vec2(0, 0), 4, 2, 0, 0, Math.PI / 2, false)
        const mappedCcw = (ccw as unknown as { angleToParam: (theta: number) => number }).angleToParam(Math.PI * 3)
        expect(mappedCcw).toBeGreaterThanOrEqual(ccw.getStartParam())
        expect(mappedCcw).toBeLessThanOrEqual((ccw.getDomain() as PeriodInterval).end)
        const cw = new EllipseArc2(new Vec2(0, 0), 4, 2, 0, 0, -Math.PI / 2, true)
        const mapped = (cw as unknown as { angleToParam: (theta: number) => number }).angleToParam(-Math.PI / 4)
        expect(mapped).toBeGreaterThanOrEqual(cw.getStartParam())
        expect(cw.getBBox().isFinite()).toBe(true)
        expect(arc.isValid()).toBe(true)

        const hacked = arc as unknown as { _rx: number }
        hacked._rx = 0
        expect(arc.isValid()).toBe(false)
    })
})
