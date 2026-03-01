import { describe, expect, it } from 'vitest'
import { Arc2 } from '../src/curves/arc2'
import { BSpline2 } from '../src/curves/bspline2'
import { Circle2 } from '../src/curves/circle2'
import type { Curve2 } from '../src/curves/curve2'
import { Ellipse2 } from '../src/curves/ellipse2'
import { Line2 } from '../src/curves/line2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { intersectCurveCurve } from '../src/intersections'

function transformSimilarity() {
    return Mat3.identity()
        .scale(1.8, 1.8)
        .rotate(0.7)
        .translate(12, -9)
}

function pointSetMatch(pointsA: Vec2[], pointsB: Vec2[], tol: number) {
    for (const pa of pointsA) {
        const ok = pointsB.some((pb) => pa.distanceTo(pb) <= tol)
        if (!ok) return false
    }
    for (const pb of pointsB) {
        const ok = pointsA.some((pa) => pa.distanceTo(pb) <= tol)
        if (!ok) return false
    }
    return true
}

function verifyInvariant(c1: Curve2, c2: Curve2) {
    const m = transformSimilarity()
    const inv = m.inverted()

    const ref = intersectCurveCurve(c1, c2)
    const c1t = c1.transformed(m)
    const c2t = c2.transformed(m)
    const transformedHits = intersectCurveCurve(c1t, c2t)

    const refPoints = ref.map((h) => h.point)
    const invPoints = transformedHits.map((h) => inv.transformedPoint(h.point))
    expect(pointSetMatch(refPoints, invPoints, 3e-4)).toBe(true)
}

describe('intersections transform invariance', () => {
    it('line-circle', () => {
        const l = new Line2(new Vec2(-4, 1.5), new Vec2(4, 1.5))
        const c = new Circle2(new Vec2(0, 0), 2)
        verifyInvariant(l, c)
    })

    it('arc-arc', () => {
        const a1 = new Arc2(new Vec2(0, 0), 3, 0, Math.PI * 1.1, false)
        const a2 = new Arc2(new Vec2(1.5, 0), 2.2, Math.PI * 0.2, Math.PI * 1.4, false)
        verifyInvariant(a1, a2)
    })

    it('ellipse-line', () => {
        const e = new Ellipse2(new Vec2(0, 0), 5, 2, 0.4)
        const l = new Line2(new Vec2(-8, 0), new Vec2(8, 0))
        verifyInvariant(e, l)
    })

    it('circle-bspline', () => {
        const c = new Circle2(new Vec2(1, -1), 2.5)
        const b = new BSpline2(
            [
                new Vec2(-3, -2),
                new Vec2(-1, 2),
                new Vec2(2, -2),
                new Vec2(4, 1),
            ],
            2,
            { expandedKnots: [0, 0, 0, 1, 2, 2, 2] },
        )
        verifyInvariant(c, b)
    })
})
