import { describe, expect, it } from 'vitest'
import { Arc2 } from '../src/curves/arc2'
import { BSpline2 } from '../src/curves/bspline2'
import { Circle2 } from '../src/curves/circle2'
import type { Curve2 } from '../src/curves/curve2'
import { Ellipse2 } from '../src/curves/ellipse2'
import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'
import { intersectCurveCurve } from '../src/intersections'
import { PolylinePairIntersector } from '../src/intersections/solvers/polyline_pair_intersector'
import { SeededRng } from './helpers/rng'

function randomCurve(rng: SeededRng): Curve2 {
    const kind = Math.floor(rng.nextRange(0, 6))
    switch (kind) {
        case 0:
            return randomLine(rng)
        case 1:
            return randomCircle(rng)
        case 2:
            return randomArc(rng)
        case 3:
            return randomEllipse(rng)
        case 4:
            return randomEllipseArc(rng)
        default:
            return randomBSpline(rng)
    }
}

function randomLine(rng: SeededRng) {
    while (true) {
        const p0 = new Vec2(rng.nextRange(-20, 20), rng.nextRange(-20, 20))
        const p1 = new Vec2(rng.nextRange(-20, 20), rng.nextRange(-20, 20))
        if (p0.distanceTo(p1) > 0.5) return new Line2(p0, p1)
    }
}

function randomCircle(rng: SeededRng) {
    return new Circle2(
        new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15)),
        rng.nextRange(0.5, 6),
    )
}

function randomArc(rng: SeededRng) {
    const center = new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15))
    const radius = rng.nextRange(0.5, 6)
    const start = rng.nextRange(0, Math.PI * 2)
    const sweep = rng.nextRange(0.2, Math.PI * 1.8)
    const cw = rng.next() < 0.5
    const end = cw ? (start - sweep) : (start + sweep)
    return new Arc2(center, radius, start, end, cw)
}

function randomEllipse(rng: SeededRng) {
    return new Ellipse2(
        new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15)),
        rng.nextRange(1, 7),
        rng.nextRange(0.5, 5),
        rng.nextRange(-Math.PI, Math.PI),
    )
}

function randomEllipseArc(rng: SeededRng) {
    const center = new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15))
    const rx = rng.nextRange(1, 7)
    const ry = rng.nextRange(0.5, 5)
    const rotation = rng.nextRange(-Math.PI, Math.PI)
    const start = rng.nextRange(0, Math.PI * 2)
    const sweep = rng.nextRange(0.2, Math.PI * 1.8)
    const cw = rng.next() < 0.5
    const end = cw ? (start - sweep) : (start + sweep)
    return new EllipseArc2(center, rx, ry, rotation, start, end, cw)
}

function randomBSpline(rng: SeededRng) {
    const cx = rng.nextRange(-12, 12)
    const cy = rng.nextRange(-12, 12)
    const cps = [
        new Vec2(cx + rng.nextRange(-4, -1), cy + rng.nextRange(-3, 3)),
        new Vec2(cx + rng.nextRange(-2, 1), cy + rng.nextRange(-3, 3)),
        new Vec2(cx + rng.nextRange(0, 3), cy + rng.nextRange(-3, 3)),
        new Vec2(cx + rng.nextRange(2, 5), cy + rng.nextRange(-3, 3)),
    ]
    return new BSpline2(cps, 2, {
        expandedKnots: [0, 0, 0, 1, 2, 2, 2],
    })
}

function hasSymmetricMatch(
    target: ReturnType<typeof intersectCurveCurve>[number],
    candidates: ReturnType<typeof intersectCurveCurve>,
) {
    const tolPoint = 2e-4
    const tolParam = 2e-3
    return candidates.some((item) =>
        item.isOverlap === target.isOverlap &&
        item.point.distanceTo(target.point) <= tolPoint &&
        Math.abs(item.u1 - target.u2) <= tolParam &&
        Math.abs(item.u2 - target.u1) <= tolParam,
    )
}

describe('intersections stability (randomized)', () => {
    it('keeps finite results and low residual under random stress', () => {
        const rng = new SeededRng(0x5eed1234)
        PolylinePairIntersector.resetDiagnostics()
        let tested = 0
        let maxResidual = 0

        for (let i = 0; i < 120; i++) {
            const c1 = randomCurve(rng)
            const c2 = randomCurve(rng)
            const hits = intersectCurveCurve(c1, c2)
            tested++
            for (const h of hits) {
                expect(Number.isFinite(h.point.x) && Number.isFinite(h.point.y)).toBe(true)
                expect(Number.isFinite(h.u1) && Number.isFinite(h.u2)).toBe(true)
                const p1 = c1.pointAt(h.u1)
                const p2 = c2.pointAt(h.u2)
                const residual = Math.max(p1.distanceTo(h.point), p2.distanceTo(h.point), p1.distanceTo(p2))
                maxResidual = Math.max(maxResidual, residual)
                expect(residual).toBeLessThanOrEqual(2e-4)
            }
        }

        expect(tested).toBe(120)
        expect(maxResidual).toBeLessThanOrEqual(2e-4)

        const diag = PolylinePairIntersector.getDiagnostics()
        expect(diag.recursiveNodesVisited).toBeGreaterThan(0)
        expect(diag.numericClosestFallbackCount).toBeGreaterThanOrEqual(0)
        expect(diag.analyticClosestFallbackCount).toBeGreaterThanOrEqual(0)
        expect(diag.recursiveAbortCount).toBeGreaterThanOrEqual(0)
    }, 20000)

    it('keeps A/B symmetry under random stress', () => {
        const rng = new SeededRng(0x13572468)
        for (let i = 0; i < 80; i++) {
            const c1 = randomCurve(rng)
            const c2 = randomCurve(rng)
            const ab = intersectCurveCurve(c1, c2)
            const ba = intersectCurveCurve(c2, c1)
            for (const h of ab) {
                expect(hasSymmetricMatch(h, ba)).toBe(true)
            }
            for (const h of ba) {
                expect(hasSymmetricMatch(h, ab)).toBe(true)
            }
        }
    }, 20000)
})
