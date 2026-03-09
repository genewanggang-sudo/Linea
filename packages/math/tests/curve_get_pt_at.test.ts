import { describe, expect, it } from 'vitest'

import { Arc2 } from '../src/curves/arc2'
import { BSpline2 } from '../src/curves/bspline2'
import { Circle2 } from '../src/curves/circle2'
import { Ellipse2 } from '../src/curves/ellipse2'
import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'

describe('Curve2.getPtAt', () => {
    it('matches pointAt on-domain and rejects non-finite input', () => {
        const line = new Line2(new Vec2(1, 2), new Vec2(4, 6))
        expect(line.getPtAt(2.5).equals(line.pointAt(2.5), 1e-9)).toBe(true)
        expect(() => line.getPtAt(Number.NaN)).toThrow('Line2.getPtAt: u must be finite')
    })

    it('extends Line2 over its support line', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(3, 4))
        expect(line.getPtAt(0).equals(new Vec2(0, 0), 1e-9)).toBe(true)
        expect(line.getPtAt(5).equals(new Vec2(3, 4), 1e-9)).toBe(true)
        expect(line.getPtAt(10).equals(new Vec2(6, 8), 1e-9)).toBe(true)
        expect(line.getPtAt(-5).equals(new Vec2(-3, -4), 1e-9)).toBe(true)
    })

    it('evaluates circle-like curves on support geometry outside range', () => {
        const circle = new Circle2(new Vec2(1, 1), 2)
        expect(circle.getPtAt(Math.PI / 3).equals(circle.pointAt(Math.PI / 3), 1e-9)).toBe(true)
        expect(circle.getPtAt(MathConstLike.PI2 + Math.PI / 2).equals(new Vec2(1, 3), 1e-9)).toBe(true)

        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI / 2, true)
        expect(arc.getPtAt(arc.startParam()).equals(arc.pointAt(arc.startParam()), 1e-9)).toBe(true)
        const p = arc.getPtAt(arc.endParam() + Math.PI / 2)
        expect(p.equals(new Vec2(2, 0), 1e-9)).toBe(true)
    })

    it('evaluates ellipse-like curves on support geometry outside range', () => {
        const ellipse = new Ellipse2(new Vec2(0, 0), 4, 2, Math.PI / 6)
        const u = Math.PI / 4
        expect(ellipse.getPtAt(u).equals(ellipse.pointAt(u), 1e-9)).toBe(true)

        const arc = new EllipseArc2(new Vec2(0, 0), 3, 2, Math.PI / 8, 0, Math.PI / 2, true)
        expect(arc.getPtAt(arc.startParam()).equals(arc.pointAt(arc.startParam()), 1e-9)).toBe(true)
        const out = arc.getPtAt(arc.endParam() + Math.PI / 3)
        expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true)
    })

    it('normalizes periodic bspline and extrapolates non-periodic bspline', () => {
        const periodic = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0)],
            degree: 2,
            knots: [0, 1],
            multiplicities: [3, 3],
            isPeriodic: true,
        })
        expect(periodic.getPtAt(1.25).equals(periodic.pointAt(0.25), 1e-9)).toBe(true)

        const linear = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(3, 0)],
            degree: 1,
            knots: [0, 1],
            multiplicities: [2, 2],
        })
        expect(linear.getPtAt(0.5).equals(linear.pointAt(0.5), 1e-9)).toBe(true)
        expect(linear.getPtAt(-1).equals(new Vec2(-3, 0), 1e-9)).toBe(true)
        expect(linear.getPtAt(2).equals(new Vec2(6, 0), 1e-9)).toBe(true)
    })

    it('keeps non-linear bspline extrapolation finite and continuous near boundary', () => {
        const curve = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 2), new Vec2(3, 1), new Vec2(4, 0)],
            degree: 2,
            knots: [0, 1, 2],
            multiplicities: [3, 1, 3],
        })
        const start = curve.startParam()
        const end = curve.endParam()
        const left = curve.getPtAt(start - 1e-4)
        const right = curve.getPtAt(end + 1e-4)
        expect(Number.isFinite(left.x) && Number.isFinite(left.y)).toBe(true)
        expect(Number.isFinite(right.x) && Number.isFinite(right.y)).toBe(true)
        expect(left.distanceTo(curve.getPtAt(start))).toBeLessThan(1e-2)
        expect(right.distanceTo(curve.getPtAt(end))).toBeLessThan(1e-2)
    })
})

const MathConstLike = {
    PI2: Math.PI * 2,
}
