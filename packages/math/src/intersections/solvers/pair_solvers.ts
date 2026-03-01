import { Vec2 } from '../../core/vec2'
import type { Arc2 } from '../../curves/arc2'
import type { Circle2 } from '../../curves/circle2'
import type { Curve2 } from '../../curves/curve2'
import type { Ellipse2 } from '../../curves/ellipse2'
import type { EllipseArc2 } from '../../curves/ellipse_arc2'
import type { Line2 } from '../../curves/line2'
import { Interval } from '../../curves/interval'
import { MathError } from '../../utils/math_error'
import { Precision } from '../../utils/precision'
import type { ICurvePairIntersector } from '../intersector'
import { curvePointTolerance } from '../internal/tolerance'
import type { CurveXInfo } from '../types'
import { LineLinePairSolver } from './line_line_pair_solver'
import { PolylinePairIntersector } from './polyline_pair_intersector'

type LineParamPoint = {
    point: Vec2
    uLine: number
}

function solveQuadratic(a: number, b: number, c: number) {
    const eps = Precision.CURVE_NEWTON_EPS
    if (Math.abs(a) <= eps) {
        if (Math.abs(b) <= eps) return []
        return [-c / b]
    }

    const disc = b * b - 4 * a * c
    if (disc < -eps) return []
    if (Math.abs(disc) <= eps) return [-b / (2 * a)]

    const sqrtDisc = Math.sqrt(Math.max(0, disc))
    const q = -0.5 * (b + Math.sign(b || 1) * sqrtDisc)
    const r1 = q / a
    const r2 = c / q
    return r1 <= r2 ? [r1, r2] : [r2, r1]
}

function assertLine(curve: Curve2): Line2 {
    MathError.assert(curve.isLine(), `Expected Line2, got ${curve.getType()}`)
    return curve
}

function assertCircle(curve: Curve2): Circle2 {
    MathError.assert(curve.isCircle(), `Expected Circle2, got ${curve.getType()}`)
    return curve
}

function assertArc(curve: Curve2): Arc2 {
    MathError.assert(curve.isArc(), `Expected Arc2, got ${curve.getType()}`)
    return curve
}

function assertEllipse(curve: Curve2): Ellipse2 {
    MathError.assert(curve.isEllipse(), `Expected Ellipse2, got ${curve.getType()}`)
    return curve
}

function assertEllipseArc(curve: Curve2): EllipseArc2 {
    MathError.assert(curve.isEllipseArc(), `Expected EllipseArc2, got ${curve.getType()}`)
    return curve
}

function tryParamOnCurve(curve: Curve2, point: Vec2) {
    const tol = curvePointTolerance(curve)
    const cp = safeClosestPoint(curve, point, tol)
    if (!cp) return undefined
    if (cp.distance > tol * 16) return undefined
    return curve.getRange().clamp(cp.param)
}

function safeClosestPoint(curve: Curve2, point: Vec2, tol: number) {
    try {
        return curve.closestPoint(point, tol)
    } catch {
        PolylinePairIntersector.recordAnalyticClosestFallback()
        return sampleClosestPoint(curve, point, 64)
    }
}

function sampleClosestPoint(curve: Curve2, point: Vec2, sampleCount: number) {
    const range = curve.getRange()
    let bestParam = range.start
    let bestPoint = curve.pointAt(bestParam)
    let bestDist = bestPoint.distanceTo(point)
    const total = Math.max(8, sampleCount)
    for (let i = 1; i <= total; i++) {
        const t = i / total
        const u = range.start + (range.end - range.start) * t
        const q = curve.pointAt(u)
        const d = q.distanceTo(point)
        if (d < bestDist) {
            bestDist = d
            bestParam = u
            bestPoint = q
        }
    }

    // Local Newton refinement around the best sampled parameter.
    let u = bestParam
    for (let i = 0; i < 12; i++) {
        const p = curve.pointAt(u)
        const d1 = curve.derivativeAt(u, 1)
        const d2 = curve.derivativeAt(u, 2)
        const cp = p.subtracted(point)
        const f = cp.dot(d1)
        const fp = d1.dot(d1) + cp.dot(d2)
        if (!Number.isFinite(f) || !Number.isFinite(fp) || Math.abs(fp) <= Precision.CURVE_NEWTON_EPS) break
        const next = range.clamp(u - f / fp)
        if (Math.abs(next - u) <= Precision.CURVE_PARAM_EPS * 4) {
            u = next
            break
        }
        u = next
    }
    bestParam = u
    bestPoint = curve.pointAt(bestParam)
    bestDist = bestPoint.distanceTo(point)

    return {
        point: bestPoint,
        param: bestParam,
        distance: bestDist,
    }
}

function tryBuildPointInfo(c1: Curve2, c2: Curve2, point: Vec2): CurveXInfo | undefined {
    const u1 = tryParamOnCurve(c1, point)
    const u2 = tryParamOnCurve(c2, point)
    if (u1 === undefined || u2 === undefined) return undefined
    return {
        point,
        u1,
        u2,
        isOverlap: false,
    }
}

function pushUniqueResult(items: CurveXInfo[], candidate: CurveXInfo | undefined) {
    if (!candidate) return
    for (const item of items) {
        if (
            Math.abs(item.u1 - candidate.u1) <= Precision.CURVE_PARAM_EPS * 8 &&
            Math.abs(item.u2 - candidate.u2) <= Precision.CURVE_PARAM_EPS * 8 &&
            item.isOverlap === candidate.isOverlap
        ) {
            return
        }
    }
    items.push(candidate)
}

function lineCircleParamIntersections(line: Line2, center: Vec2, radius: number): LineParamPoint[] {
    const p0 = line.start
    const p1 = line.end
    const v = p1.subtracted(p0)
    const len = v.len()
    if (len <= Precision.CURVE_LENGTH_EPS) return []

    const d = v.scaled(1 / len)
    const f = p0.subtracted(center)
    const b = 2 * d.dot(f)
    const c = f.lenSq() - radius * radius
    const roots = solveQuadratic(1, b, c)
    const ret: LineParamPoint[] = []

    for (const s of roots) {
        if (s < -Precision.CURVE_LENGTH_EPS || s > len + Precision.CURVE_LENGTH_EPS) continue
        const uLine = Math.min(len, Math.max(0, s))
        const point = p0.added(d.scaled(uLine))
        ret.push({ point, uLine })
    }

    return ret
}

function lineEllipseParamIntersections(line: Line2, ellipse: Ellipse2 | EllipseArc2): LineParamPoint[] {
    const p0 = line.start
    const p1 = line.end
    const v = p1.subtracted(p0)
    const len = v.len()
    if (len <= Precision.CURVE_LENGTH_EPS) return []

    const d = v.scaled(1 / len)
    const c = Math.cos(ellipse.rotation)
    const s = Math.sin(ellipse.rotation)

    const rel0 = p0.subtracted(ellipse.center)
    const x0 = c * rel0.x + s * rel0.y
    const y0 = -s * rel0.x + c * rel0.y
    const dx = c * d.x + s * d.y
    const dy = -s * d.x + c * d.y

    const invRx2 = 1 / (ellipse.rx * ellipse.rx)
    const invRy2 = 1 / (ellipse.ry * ellipse.ry)

    const a = dx * dx * invRx2 + dy * dy * invRy2
    const b = 2 * (x0 * dx * invRx2 + y0 * dy * invRy2)
    const cc = x0 * x0 * invRx2 + y0 * y0 * invRy2 - 1
    const roots = solveQuadratic(a, b, cc)

    const ret: LineParamPoint[] = []
    for (const sLine of roots) {
        if (sLine < -Precision.CURVE_LENGTH_EPS || sLine > len + Precision.CURVE_LENGTH_EPS) continue
        const uLine = Math.min(len, Math.max(0, sLine))
        const point = p0.added(d.scaled(uLine))
        ret.push({ point, uLine })
    }
    return ret
}

type CircleCircleResult =
    | { kind: 'none' }
    | { kind: 'overlap' }
    | { kind: 'points'; points: Vec2[] }

function circleCircleIntersections(
    c1Center: Vec2,
    c1Radius: number,
    c2Center: Vec2,
    c2Radius: number,
): CircleCircleResult {
    const delta = c2Center.subtracted(c1Center)
    const d = delta.len()
    const eps = Precision.CURVE_LENGTH_EPS

    if (d <= eps && Math.abs(c1Radius - c2Radius) <= eps) {
        return { kind: 'overlap' }
    }
    if (d <= eps) return { kind: 'none' }

    if (d > c1Radius + c2Radius + eps) return { kind: 'none' }
    if (d < Math.abs(c1Radius - c2Radius) - eps) return { kind: 'none' }

    const a = (c1Radius * c1Radius - c2Radius * c2Radius + d * d) / (2 * d)
    const h2 = c1Radius * c1Radius - a * a
    if (h2 < -eps) return { kind: 'none' }

    const base = c1Center.added(delta.scaled(a / d))
    if (Math.abs(h2) <= eps) return { kind: 'points', points: [base] }

    const h = Math.sqrt(Math.max(0, h2))
    const offset = new Vec2(-delta.y / d, delta.x / d).scale(h)
    return {
        kind: 'points',
        points: [base.added(offset), base.subtracted(offset)],
    }
}

function isSameSupportCircle(a: { center: Vec2; radius: number }, b: { center: Vec2; radius: number }) {
    return a.center.distanceTo(b.center) <= Precision.CURVE_LENGTH_EPS &&
        Math.abs(a.radius - b.radius) <= Precision.CURVE_LENGTH_EPS
}

function createOverlapInfo(c1: Curve2, c2: Curve2, point: Vec2, range1?: Interval, range2?: Interval): CurveXInfo | undefined {
    const u1 = tryParamOnCurve(c1, point)
    const u2 = tryParamOnCurve(c2, point)
    if (u1 === undefined || u2 === undefined) return undefined
    return {
        point,
        u1,
        u2,
        isOverlap: true,
        range1,
        range2,
    }
}

function sampleRangeContains(curve: Curve2, other: Curve2, sampleCount: number) {
    const range = curve.getRange()
    let hit = 0
    let representative: Vec2 | undefined
    for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount
        const u = range.start + (range.end - range.start) * t
        const p = curve.pointAt(u)
        const uOther = tryParamOnCurve(other, p)
        if (uOther === undefined) continue
        hit++
        representative = p
    }
    return { hit, representative }
}

function estimateOverlapRange(base: Curve2, other: Curve2, sampleCount: number) {
    const range = base.getRange()
    let start: number | undefined
    let end: number | undefined
    for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount
        const u = range.start + (range.end - range.start) * t
        const p = base.pointAt(u)
        if (tryParamOnCurve(other, p) === undefined) continue
        if (start === undefined) start = u
        end = u
    }
    if (start === undefined || end === undefined) return undefined
    if (Math.abs(end - start) <= Precision.CURVE_PARAM_EPS * 8) return undefined
    return new Interval(start, end)
}

export class LineCirclePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const circle = assertCircle(c2)
        const candidates = lineCircleParamIntersections(line, circle.center, circle.radius)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uCircle = tryParamOnCurve(circle, c.point)
            if (uCircle === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uCircle,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const arc = assertArc(c2)
        const candidates = lineCircleParamIntersections(line, arc.center, arc.radius)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uArc = tryParamOnCurve(arc, c.point)
            if (uArc === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uArc,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineEllipsePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const ellipse = assertEllipse(c2)
        const candidates = lineEllipseParamIntersections(line, ellipse)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uEllipse = tryParamOnCurve(ellipse, c.point)
            if (uEllipse === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uEllipse,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineEllipseArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const ellipseArc = assertEllipseArc(c2)
        const candidates = lineEllipseParamIntersections(line, ellipseArc)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uArc = tryParamOnCurve(ellipseArc, c.point)
            if (uArc === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uArc,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(320, 64) }
}

export class CircleCirclePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const circle1 = assertCircle(c1)
        const circle2 = assertCircle(c2)
        const hit = circleCircleIntersections(circle1.center, circle1.radius, circle2.center, circle2.radius)
        if (hit.kind === 'none') return []

        if (hit.kind === 'overlap') {
            const p = circle1.pointAt(circle1.getRange().start)
            const overlap = createOverlapInfo(circle1, circle2, p, circle1.getRange(), circle2.getRange())
            return overlap ? [overlap] : []
        }

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            pushUniqueResult(out, tryBuildPointInfo(circle1, circle2, p))
        }
        return out
    }
}

export class CircleArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const circle = assertCircle(c1)
        const arc = assertArc(c2)

        if (isSameSupportCircle(circle, arc)) {
            const p = arc.pointAt(arc.getRange().start)
            const uStart = tryParamOnCurve(circle, arc.pointAt(arc.getRange().start))
            const uEnd = tryParamOnCurve(circle, arc.pointAt(arc.getRange().end))
            const range1 = (uStart !== undefined && uEnd !== undefined)
                ? new Interval(uStart, uEnd)
                : undefined
            const overlap = createOverlapInfo(circle, arc, p, range1, arc.getRange())
            return overlap ? [overlap] : []
        }

        const hit = circleCircleIntersections(circle.center, circle.radius, arc.center, arc.radius)
        if (hit.kind !== 'points') return []

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            const uArc = tryParamOnCurve(arc, p)
            if (uArc === undefined) continue
            pushUniqueResult(out, tryBuildPointInfo(circle, arc, p))
        }
        return out
    }
}

export class CircleEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class CircleEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class CircleBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(352, 64) }
}

export class ArcArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const arc1 = assertArc(c1)
        const arc2 = assertArc(c2)

        if (isSameSupportCircle(arc1, arc2)) {
            const sample1 = sampleRangeContains(arc1, arc2, 64)
            const sample2 = sampleRangeContains(arc2, arc1, 64)
            const sharedCount = Math.max(sample1.hit, sample2.hit)
            if (sharedCount >= 3) {
                const p = sample1.representative ?? sample2.representative ?? arc1.pointAt(arc1.getRange().start)
                const range1 = estimateOverlapRange(arc1, arc2, 128)
                const range2 = estimateOverlapRange(arc2, arc1, 128)
                const overlap = createOverlapInfo(arc1, arc2, p, range1, range2)
                if (overlap) return [overlap]
            }

            const out: CurveXInfo[] = []
            const endpoints = [
                arc1.pointAt(arc1.getRange().start),
                arc1.pointAt(arc1.getRange().end),
                arc2.pointAt(arc2.getRange().start),
                arc2.pointAt(arc2.getRange().end),
            ]
            for (const p of endpoints) {
                if (tryParamOnCurve(arc1, p) === undefined || tryParamOnCurve(arc2, p) === undefined) continue
                pushUniqueResult(out, tryBuildPointInfo(arc1, arc2, p))
            }
            return out
        }

        const hit = circleCircleIntersections(arc1.center, arc1.radius, arc2.center, arc2.radius)
        if (hit.kind !== 'points') return []

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            if (tryParamOnCurve(arc1, p) === undefined || tryParamOnCurve(arc2, p) === undefined) continue
            pushUniqueResult(out, tryBuildPointInfo(arc1, arc2, p))
        }
        return out
    }
}

export class ArcEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class ArcEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class ArcBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(352, 64) }
}
export class EllipseEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(384, 64) }
}
export class EllipseArcEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseArcBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(384, 64) }
}
export class BSplineBSplinePairSolver extends PolylinePairIntersector {
    constructor() { super(448, 64) }
}

export { LineLinePairSolver }
