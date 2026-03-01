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
import { Precision } from '../src/utils/precision'

type NamedCurveFactory = {
    name: string
    make: () => Curve2
}

function makeCurves(): NamedCurveFactory[] {
    return [
        {
            name: 'line',
            make: () => new Line2(new Vec2(-5, 0), new Vec2(5, 0)),
        },
        {
            name: 'circle',
            make: () => new Circle2(new Vec2(0, 0), 2),
        },
        {
            name: 'arc',
            make: () => new Arc2(new Vec2(0, 0), 2, 0, Math.PI, false),
        },
        {
            name: 'ellipse',
            make: () => new Ellipse2(new Vec2(0, 0), 3, 1.5, 0),
        },
        {
            name: 'ellipseArc',
            make: () => new EllipseArc2(new Vec2(0, 0), 3, 1.5, 0, 0, Math.PI, false),
        },
        {
            name: 'bspline',
            make: () => new BSpline2(
                [
                    new Vec2(-4, -1),
                    new Vec2(-1, 2),
                    new Vec2(2, -2),
                    new Vec2(5, 1),
                ],
                2,
                {
                    expandedKnots: [0, 0, 0, 1, 2, 2, 2],
                },
            ),
        },
    ]
}

function isFiniteResult(result: ReturnType<typeof intersectCurveCurve>[number]) {
    if (!Number.isFinite(result.point.x) || !Number.isFinite(result.point.y)) return false
    if (!Number.isFinite(result.u1) || !Number.isFinite(result.u2)) return false
    if (result.range1 && (!Number.isFinite(result.range1.start) || !Number.isFinite(result.range1.end))) return false
    if (result.range2 && (!Number.isFinite(result.range2.start) || !Number.isFinite(result.range2.end))) return false
    return true
}

function hasSymmetricMatch(
    target: ReturnType<typeof intersectCurveCurve>[number],
    candidates: ReturnType<typeof intersectCurveCurve>,
) {
    const tolPoint = 1e-5
    const tolParam = 1e-5
    return candidates.some((item) =>
        item.isOverlap === target.isOverlap &&
        item.point.distanceTo(target.point) <= tolPoint &&
        Math.abs(item.u1 - target.u2) <= tolParam &&
        Math.abs(item.u2 - target.u1) <= tolParam,
    )
}

function inRange(curve: Curve2, u: number) {
    return curve.getRange().contains(u, Precision.CURVE_PARAM_EPS * 8)
}

function isPointOnCurveByParam(curve: Curve2, u: number, p: Vec2) {
    if (!inRange(curve, u)) return false
    return curve.pointAt(u).distanceTo(p) <= 1e-5
}

describe('intersections: curve-curve matrix', () => {
    it('all 21 lower-triangle pairs are callable and return finite values', () => {
        const defs = makeCurves()
        for (let i = 0; i < defs.length; i++) {
            for (let j = i; j < defs.length; j++) {
                const a = defs[i].make()
                const b = defs[j].make()
                const result = intersectCurveCurve(a, b)
                expect(Array.isArray(result), `${defs[i].name}|${defs[j].name}`).toBe(true)
                for (const item of result) {
                    expect(isFiniteResult(item), `${defs[i].name}|${defs[j].name}`).toBe(true)
                    expect(isPointOnCurveByParam(a, item.u1, item.point), `${defs[i].name}|${defs[j].name}`).toBe(true)
                    expect(isPointOnCurveByParam(b, item.u2, item.point), `${defs[i].name}|${defs[j].name}`).toBe(true)
                    if (item.isOverlap) {
                        expect(item.range1, `${defs[i].name}|${defs[j].name}`).toBeDefined()
                        expect(item.range2, `${defs[i].name}|${defs[j].name}`).toBeDefined()
                    }
                }
            }
        }
    })

    it('is symmetric for swapped inputs', () => {
        const defs = makeCurves()
        for (let i = 0; i < defs.length; i++) {
            for (let j = i; j < defs.length; j++) {
                const a = defs[i].make()
                const b = defs[j].make()
                const ab = intersectCurveCurve(a, b)
                const ba = intersectCurveCurve(b, a)

                for (const item of ab) {
                    expect(hasSymmetricMatch(item, ba), `${defs[i].name}|${defs[j].name}`).toBe(true)
                }
                for (const item of ba) {
                    expect(hasSymmetricMatch(item, ab), `${defs[j].name}|${defs[i].name}`).toBe(true)
                }
            }
        }
    }, 20000)

    it('captures tangent contact (line-circle)', () => {
        const line = new Line2(new Vec2(-5, 2), new Vec2(5, 2))
        const circle = new Circle2(new Vec2(0, 0), 2)
        const hits = intersectCurveCurve(line, circle)
        expect(hits.length).toBeGreaterThan(0)
        const hasTangent = hits.some((h) => h.point.distanceTo(new Vec2(0, 2)) <= 1e-4)
        expect(hasTangent).toBe(true)
    })

    it('captures overlap (line-line)', () => {
        const l1 = new Line2(new Vec2(-2, 0), new Vec2(2, 0))
        const l2 = new Line2(new Vec2(-1, 0), new Vec2(3, 0))
        const hits = intersectCurveCurve(l1, l2)
        expect(hits.some((h) => h.isOverlap)).toBe(true)
    })

    it('captures overlap (circle-arc)', () => {
        const circle = new Circle2(new Vec2(0, 0), 2)
        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI * 0.5, false)
        const hits = intersectCurveCurve(circle, arc)
        expect(hits.some((h) => h.isOverlap)).toBe(true)
    })

    it('captures overlap (arc-arc)', () => {
        const a1 = new Arc2(new Vec2(0, 0), 3, 0, Math.PI, false)
        const a2 = new Arc2(new Vec2(0, 0), 3, Math.PI * 0.5, Math.PI * 1.5, false)
        const hits = intersectCurveCurve(a1, a2)
        expect(hits.some((h) => h.isOverlap)).toBe(true)
    })
})
