import { describe, expect, it } from 'vitest'

import { Arc2 } from '../../src/curves/arc2'
import { BSpline2 } from '../../src/curves/bspline2'
import { Circle2 } from '../../src/curves/circle2'
import { Ellipse2 } from '../../src/curves/ellipse2'
import { EllipseArc2 } from '../../src/curves/ellipse_arc2'
import { Line2 } from '../../src/curves/line2'
import { Mat3 } from '../../src/core/mat3'
import { Vec2 } from '../../src/core/vec2'
import { Precision } from '../../src/utils/precision'
import { SeededRng } from '../helpers/rng'
import { sampleParams } from '../helpers/curve_sampling'

describe('Curve property invariants', () => {
    it('reverse twice keeps geometry equivalent at sampled params', () => {
        const curves = [
            new Line2(new Vec2(0, 0), new Vec2(4, 3)),
            new Circle2(new Vec2(1, -2), 3),
            new Arc2(new Vec2(0, 0), 2, -0.3, 1.8, false),
            new Ellipse2(new Vec2(0.5, -1), 4, 2, 0.3),
            new EllipseArc2(new Vec2(0, 0), 3, 1.5, 0.2, -0.4, 2.1, true),
            new BSpline2({
                controlPoints: [new Vec2(0, 0), new Vec2(1, 2), new Vec2(2, -1), new Vec2(3, 1)],
                degree: 2,
                knots: [0, 1, 2],
                multiplicities: [3, 1, 3],
            }),
        ]

        for (const c of curves) {
            const rr = c.clone().reverse().reverse()
            const r0 = c.getRange()
            const r1 = rr.getRange()
            for (let i = 0; i <= 6; i++) {
                const t = i / 6
                const u0 = r0.start + (r0.end - r0.start) * t
                const u1 = r1.start + (r1.end - r1.start) * t
                expect(rr.pointAt(u1).distanceTo(c.pointAt(u0))).toBeLessThanOrEqual(1e-6)
            }
        }
    })

    it('u -> s -> u round-trip holds in tolerance', () => {
        const curves = [
            new Line2(new Vec2(0, 0), new Vec2(4, 3)),
            new Circle2(new Vec2(1, -2), 3),
            new Arc2(new Vec2(0, 0), 2, -0.3, 1.8, false),
            new Ellipse2(new Vec2(0.5, -1), 4, 2, 0.3),
            new EllipseArc2(new Vec2(0, 0), 3, 1.5, 0.2, -0.4, 2.1, true),
            new BSpline2({
                controlPoints: [new Vec2(0, 0), new Vec2(1, 2), new Vec2(2, -1), new Vec2(3, 1)],
                degree: 2,
                knots: [0, 1, 2],
                multiplicities: [3, 1, 3],
            }),
        ]

        for (const c of curves) {
            for (const u of sampleParams(c.getRange(), 5)) {
                const s = c.lengthAtParam(u)
                const uu = c.paramAtLength(s, 1e-6)
                expect(Math.abs(uu - u)).toBeLessThanOrEqual(5e-4)
            }
        }
    })

    it('inverse transform round-trip is stable for invertible transforms', () => {
        const rng = new SeededRng(20260225)
        const base = new EllipseArc2(new Vec2(2, -1), 3, 2, 0.4, -0.5, 1.9, false)

        for (let i = 0; i < 10; i++) {
            const tx = rng.nextRange(-5, 5)
            const ty = rng.nextRange(-5, 5)
            const rot = rng.nextRange(-Math.PI, Math.PI)
            const sc = rng.nextRange(0.5, 3)
            const m = Mat3.translation(tx, ty).rotate(rot).scale(sc, sc)
            const inv = m.inverted()
            const rt = base.clone().transform(m).transform(inv)
            const r0 = base.getRange()
            const r1 = rt.getRange()
            for (let k = 0; k <= 6; k++) {
                const t = k / 6
                const u0 = r0.start + (r0.end - r0.start) * t
                const u1 = r1.start + (r1.end - r1.start) * t
                expect(rt.pointAt(u1).distanceTo(base.pointAt(u0))).toBeLessThanOrEqual(5e-4)
            }
        }
    })

    it('closest point is orthogonal to tangent in interior samples', () => {
        const c = new Ellipse2(new Vec2(2, -1), 4, 2, 0.3)

        const rng = new SeededRng(7)
        for (let i = 0; i < 8; i++) {
            const p = new Vec2(rng.nextRange(-2, 10), rng.nextRange(-4, 4))
            const cp = c.closestPoint(p, 1e-5)
            const d = new Vec2(cp.point).subtracted(p)
            const t = c.tangentAt(cp.param)
            expect(Math.abs(d.dot(t))).toBeLessThanOrEqual(2e-2 + Precision.CURVE_LENGTH_EPS)
        }
    })
})
