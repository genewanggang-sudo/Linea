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
import { Precision } from '../src/utils/precision'
import { SeededRng } from './helpers/rng'

type NamedCurveFactory = {
    name: string
    make: () => Curve2
}

function makeCurves(): NamedCurveFactory[] {
    return [
        { name: 'line', make: () => new Line2(new Vec2(-5, 0), new Vec2(5, 0)) },
        { name: 'circle', make: () => new Circle2(new Vec2(0, 0), 2) },
        { name: 'arc', make: () => new Arc2(new Vec2(0, 0), 2, 0, Math.PI, false) },
        { name: 'ellipse', make: () => new Ellipse2(new Vec2(0, 0), 3, 1.5, 0) },
        { name: 'ellipseArc', make: () => new EllipseArc2(new Vec2(0, 0), 3, 1.5, 0, 0, Math.PI, false) },
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
                { expandedKnots: [0, 0, 0, 1, 2, 2, 2] },
            ),
        },
    ]
}

function isFiniteHit(hit: ReturnType<typeof intersectCurveCurve>[number]) {
    return Number.isFinite(hit.point.x) &&
        Number.isFinite(hit.point.y) &&
        Number.isFinite(hit.u1) &&
        Number.isFinite(hit.u2) &&
        (!hit.range1 || (Number.isFinite(hit.range1.start) && Number.isFinite(hit.range1.end))) &&
        (!hit.range2 || (Number.isFinite(hit.range2.start) && Number.isFinite(hit.range2.end)))
}

function hitOnCurve(curve: Curve2, u: number, p: Vec2) {
    if (!curve.getRange().contains(u, Precision.CURVE_PARAM_EPS * 8)) return false
    return curve.pointAt(u).distanceTo(p) <= 1e-4
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

function serializeHits(hits: ReturnType<typeof intersectCurveCurve>) {
    return hits.map((h) => [
        round(h.point.x), round(h.point.y), round(h.u1), round(h.u2), h.isOverlap ? 1 : 0,
        h.range1 ? round(h.range1.start) : null,
        h.range1 ? round(h.range1.end) : null,
        h.range2 ? round(h.range2.start) : null,
        h.range2 ? round(h.range2.end) : null,
    ])
}

function round(x: number) {
    return Math.round(x * 1e8) / 1e8
}

function clamp01(x: number) {
    return Math.min(1, Math.max(0, x))
}

function randomCurve(rng: SeededRng): Curve2 {
    const kind = Math.floor(rng.nextRange(0, 6))
    switch (kind) {
        case 0: return randomLine(rng)
        case 1: return randomCircle(rng)
        case 2: return randomArc(rng)
        case 3: return randomEllipse(rng)
        case 4: return randomEllipseArc(rng)
        default: return randomBSpline(rng)
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
    return new Circle2(new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15)), rng.nextRange(0.5, 6))
}

function randomArc(rng: SeededRng) {
    const center = new Vec2(rng.nextRange(-15, 15), rng.nextRange(-15, 15))
    const radius = rng.nextRange(0.5, 6)
    const start = rng.nextRange(0, Math.PI * 2)
    const sweep = rng.nextRange(0.2, Math.PI * 1.8)
    const cw = rng.next() < 0.5
    return new Arc2(center, radius, start, cw ? start - sweep : start + sweep, cw)
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
    return new EllipseArc2(center, rx, ry, rotation, start, cw ? start - sweep : start + sweep, cw)
}

function randomBSpline(rng: SeededRng) {
    const cx = rng.nextRange(-12, 12)
    const cy = rng.nextRange(-12, 12)
    return new BSpline2(
        [
            new Vec2(cx + rng.nextRange(-4, -1), cy + rng.nextRange(-3, 3)),
            new Vec2(cx + rng.nextRange(-2, 1), cy + rng.nextRange(-3, 3)),
            new Vec2(cx + rng.nextRange(0, 3), cy + rng.nextRange(-3, 3)),
            new Vec2(cx + rng.nextRange(2, 5), cy + rng.nextRange(-3, 3)),
        ],
        2,
        { expandedKnots: [0, 0, 0, 1, 2, 2, 2] },
    )
}

function makeDegenerateCases() {
    return [
        {
            a: new Line2(new Vec2(-10, 1e-8), new Vec2(10, 1e-8)),
            b: new Line2(new Vec2(-10, 0), new Vec2(10, 0)),
        },
        {
            a: new Line2(new Vec2(-8, 2), new Vec2(8, 2)),
            b: new Circle2(new Vec2(0, 0), 2),
        },
        {
            a: new Arc2(new Vec2(0, 0), 3, 0, Math.PI, false),
            b: new Arc2(new Vec2(0, 0), 3, Math.PI * 0.999, Math.PI * 1.5, false),
        },
        {
            a: new Ellipse2(new Vec2(0, 0), 5, 2, 0.15),
            b: new Ellipse2(new Vec2(0.002, -0.001), 5, 2, 0.1502),
        },
        {
            a: new BSpline2(
                [new Vec2(-5, -1), new Vec2(-2, 3), new Vec2(2, -3), new Vec2(5, 1)],
                2,
                { expandedKnots: [0, 0, 0, 1, 2, 2, 2] },
            ),
            b: new BSpline2(
                [new Vec2(-5, 1), new Vec2(-2, -3), new Vec2(2, 3), new Vec2(5, -1)],
                2,
                { expandedKnots: [0, 0, 0, 1, 2, 2, 2] },
            ),
        },
    ]
}

describe('intersections quality gate', () => {
    it('scores functionality and robustness with explicit rules', () => {
        PolylinePairIntersector.resetDiagnostics()

        const defs = makeCurves()
        const matrixStart = Date.now()
        let pairTotal = 0
        let pairCallable = 0
        let contractChecks = 0
        let contractPass = 0
        for (let i = 0; i < defs.length; i++) {
            for (let j = i; j < defs.length; j++) {
                pairTotal++
                const a = defs[i].make()
                const b = defs[j].make()
                const hits = intersectCurveCurve(a, b)
                pairCallable++
                for (const h of hits) {
                    contractChecks++
                    const pass = isFiniteHit(h) && hitOnCurve(a, h.u1, h.point) && hitOnCurve(b, h.u2, h.point)
                    if (pass) contractPass++
                }
            }
        }
        const matrixMs = Date.now() - matrixStart

        const rng = new SeededRng(0x95a5c0de)
        let symTotal = 0
        let symPass = 0
        for (let i = 0; i < 50; i++) {
            const c1 = randomCurve(rng)
            const c2 = randomCurve(rng)
            const ab = intersectCurveCurve(c1, c2)
            const ba = intersectCurveCurve(c2, c1)
            let ok = true
            for (const h of ab) if (!hasSymmetricMatch(h, ba)) ok = false
            for (const h of ba) if (!hasSymmetricMatch(h, ab)) ok = false
            symTotal++
            if (ok) symPass++
        }

        const determinismPairs: Array<[Curve2, Curve2]> = [
            [defs[1].make(), defs[5].make()],
            [defs[3].make(), defs[5].make()],
            [defs[4].make(), defs[5].make()],
            [defs[5].make(), defs[5].make()],
        ]
        let detTotal = 0
        let detPass = 0
        for (const [a, b] of determinismPairs) {
            const h1 = serializeHits(intersectCurveCurve(a, b))
            const h2 = serializeHits(intersectCurveCurve(a, b))
            const h3 = serializeHits(intersectCurveCurve(a, b))
            detTotal++
            if (JSON.stringify(h1) === JSON.stringify(h2) && JSON.stringify(h2) === JSON.stringify(h3)) detPass++
        }

        const scales = [1e-6, 1e-3, 1, 1e3, 1e6]
        let scaleTotal = 0
        let scalePass = 0
        for (const s of scales) {
            const line = new Line2(new Vec2(-5 * s, 0.5 * s), new Vec2(5 * s, 0.5 * s))
            const circle = new Circle2(new Vec2(0, 0), 2 * s)
            const hits = intersectCurveCurve(line, circle)
            scaleTotal++
            const ok = hits.every((h) => hitOnCurve(line, h.u1, h.point) && hitOnCurve(circle, h.u2, h.point))
            if (ok) scalePass++
        }

        const degenerates = makeDegenerateCases()
        let degTotal = 0
        let degPass = 0
        for (const item of degenerates) {
            const hits = intersectCurveCurve(item.a, item.b)
            const ok = hits.every((h) =>
                isFiniteHit(h) &&
                hitOnCurve(item.a, h.u1, h.point) &&
                hitOnCurve(item.b, h.u2, h.point),
            )
            degTotal++
            if (ok) degPass++
        }

        const diag = PolylinePairIntersector.getDiagnostics()
        const missRate = diag.certificationMissCount / Math.max(1, diag.certificationMissCount + diag.certifiedPointCount + diag.certifiedOverlapCount)

        const coverage = pairCallable / Math.max(1, pairTotal)
        const contract = contractChecks > 0 ? contractPass / contractChecks : 1
        const symmetry = symPass / Math.max(1, symTotal)
        const failureSemantics = 1 - clamp01(missRate * 4)
        const performance = matrixMs <= 6000 ? 1 : (matrixMs <= 12000 ? 1 - (matrixMs - 6000) / 12000 : 0.5)
        const functionalityScore =
            10 * (0.25 * coverage + 0.20 * contract + 0.20 * symmetry + 0.20 * failureSemantics + 0.15 * performance)

        const degenerateStable = degPass / Math.max(1, degTotal)
        const scaleStable = scalePass / Math.max(1, scaleTotal)
        const certificationStrength = 1 - clamp01(missRate * 8)
        const determinism = detPass / Math.max(1, detTotal)
        const observability = (
            Number.isFinite(diag.recursiveNodesVisited) &&
            Number.isFinite(diag.refineFailureCount) &&
            Number.isFinite(diag.certificationRejectCount) &&
            Number.isFinite(diag.degenerateRescueCount)
        ) ? 1 : 0
        const robustnessScore =
            10 * (
                0.30 * degenerateStable +
                0.25 * scaleStable +
                0.20 * certificationStrength +
                0.15 * determinism +
                0.10 * observability
            )

        expect(functionalityScore).toBeGreaterThanOrEqual(9.5)
        expect(robustnessScore).toBeGreaterThanOrEqual(9.5)
    }, 30000)
})
