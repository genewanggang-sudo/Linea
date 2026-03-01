import { Vec2 } from '../../core/vec2'
import { Precision } from '../../utils/precision'

export type Segment = {
    p0: Vec2
    p1: Vec2
    v: Vec2
    len: number
    unit: Vec2
    minX: number
    minY: number
    maxX: number
    maxY: number
}

export type SegmentHit =
    | { kind: 'none' }
    | { kind: 'point'; t1: number; t2: number }
    | { kind: 'overlap'; t1s: number; t1e: number; t2s: number; t2e: number }

export function makeSegment(p0: Vec2, p1: Vec2): Segment {
    const v = p1.subtracted(p0)
    const len = v.len()
    const unit = len > Precision.CURVE_LENGTH_EPS ? v.scaled(1 / len) : Vec2.zero()
    const minX = Math.min(p0.x, p1.x)
    const minY = Math.min(p0.y, p1.y)
    const maxX = Math.max(p0.x, p1.x)
    const maxY = Math.max(p0.y, p1.y)
    return {
        p0: p0.clone(),
        p1: p1.clone(),
        v,
        len,
        unit,
        minX,
        minY,
        maxX,
        maxY,
    }
}

export function segmentBoxesMayIntersect(s1: Segment, s2: Segment, pad = Precision.CURVE_LENGTH_EPS) {
    return !(s1.maxX + pad < s2.minX || s2.maxX + pad < s1.minX || s1.maxY + pad < s2.minY || s2.maxY + pad < s1.minY)
}

export function segmentDistance(s1: Segment, s2: Segment) {
    if (s1.len <= Precision.CURVE_LENGTH_EPS && s2.len <= Precision.CURVE_LENGTH_EPS) {
        return s1.p0.distanceTo(s2.p0)
    }
    if (s1.len <= Precision.CURVE_LENGTH_EPS) {
        return pointSegmentDistance(s1.p0, s2)
    }
    if (s2.len <= Precision.CURVE_LENGTH_EPS) {
        return pointSegmentDistance(s2.p0, s1)
    }

    const hit = intersectSegments(s1, s2)
    if (hit.kind !== 'none') return 0

    return Math.min(
        pointSegmentDistance(s1.p0, s2),
        pointSegmentDistance(s1.p1, s2),
        pointSegmentDistance(s2.p0, s1),
        pointSegmentDistance(s2.p1, s1),
    )
}

export function intersectSegments(s1: Segment, s2: Segment): SegmentHit {
    if (s1.len <= Precision.CURVE_LENGTH_EPS || s2.len <= Precision.CURVE_LENGTH_EPS) {
        return { kind: 'none' }
    }

    const cross = s1.v.cross(s2.v)
    const delta = s2.p0.subtracted(s1.p0)
    const collinear = delta.cross(s1.v)
    const crossTol = crossTolerance(s1, s2)
    const collinearTol = collinearTolerance(s1, s2, delta.len())
    const rangeTol = paramRangeTolerance(s1, s2)

    if (Math.abs(cross) <= crossTol) {
        if (Math.abs(collinear) > collinearTol) return { kind: 'none' }
        return intersectCollinearSegments(s1, s2, rangeTol)
    }

    const t1Raw = delta.cross(s2.v) / cross
    const t2Raw = delta.cross(s1.v) / cross
    if (!inRange01(t1Raw, rangeTol) || !inRange01(t2Raw, rangeTol)) return { kind: 'none' }
    return { kind: 'point', t1: clamp01(t1Raw), t2: clamp01(t2Raw) }
}

export function pointAtSegmentUnit(seg: Segment, t: number) {
    return seg.p0.added(seg.v.scaled(t))
}

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
}

function intersectCollinearSegments(s1: Segment, s2: Segment, tol: number): SegmentHit {
    const x0 = s2.p0.subtracted(s1.p0).dot(s1.unit)
    const x1 = s2.p1.subtracted(s1.p0).dot(s1.unit)
    const os = Math.max(0, Math.min(x0, x1))
    const oe = Math.min(s1.len, Math.max(x0, x1))
    if (oe < os - tol) return { kind: 'none' }

    if (Math.abs(oe - os) <= tol) {
        const pos1 = clamp(os, 0, s1.len)
        const p = s1.p0.added(s1.unit.scaled(pos1))
        const pos2 = clamp(p.subtracted(s2.p0).dot(s2.unit), 0, s2.len)
        return {
            kind: 'point',
            t1: s1.len > 0 ? pos1 / s1.len : 0,
            t2: s2.len > 0 ? pos2 / s2.len : 0,
        }
    }

    const p1s = clamp(os, 0, s1.len)
    const p1e = clamp(oe, 0, s1.len)
    const ps = s1.p0.added(s1.unit.scaled(p1s))
    const pe = s1.p0.added(s1.unit.scaled(p1e))
    const p2s = clamp(ps.subtracted(s2.p0).dot(s2.unit), 0, s2.len)
    const p2e = clamp(pe.subtracted(s2.p0).dot(s2.unit), 0, s2.len)
    return {
        kind: 'overlap',
        t1s: s1.len > 0 ? p1s / s1.len : 0,
        t1e: s1.len > 0 ? p1e / s1.len : 0,
        t2s: s2.len > 0 ? p2s / s2.len : 0,
        t2e: s2.len > 0 ? p2e / s2.len : 0,
    }
}

function inRange01(t: number, eps: number) {
    return t >= -eps && t <= 1 + eps
}

function clamp01(t: number) {
    return clamp(t, 0, 1)
}

function clamp(x: number, min: number, max: number) {
    return Math.min(max, Math.max(min, x))
}

function pointSegmentDistance(p: Vec2, s: Segment) {
    if (s.len <= Precision.CURVE_LENGTH_EPS) return p.distanceTo(s.p0)
    const t = clamp(p.subtracted(s.p0).dot(s.v) / (s.len * s.len), 0, 1)
    const q = pointAtSegmentUnit(s, t)
    return p.distanceTo(q)
}

function segmentScale(s1: Segment, s2: Segment) {
    const maxCoord = Math.max(
        Math.abs(s1.p0.x), Math.abs(s1.p0.y), Math.abs(s1.p1.x), Math.abs(s1.p1.y),
        Math.abs(s2.p0.x), Math.abs(s2.p0.y), Math.abs(s2.p1.x), Math.abs(s2.p1.y),
        1,
    )
    return {
        maxLen: Math.max(s1.len, s2.len, 1),
        maxCoord,
    }
}

function crossTolerance(s1: Segment, s2: Segment) {
    const { maxLen, maxCoord } = segmentScale(s1, s2)
    const lenProd = Math.max(s1.len * s2.len, 1)
    const base = Math.max(Precision.CURVE_LENGTH_EPS * maxLen, maxCoord * 1e-12 * maxLen)
    return Math.max(base, lenProd * 1e-12)
}

function collinearTolerance(s1: Segment, s2: Segment, deltaLen: number) {
    const { maxLen, maxCoord } = segmentScale(s1, s2)
    const lever = Math.max(deltaLen, maxLen, 1)
    const base = Math.max(Precision.CURVE_LENGTH_EPS * lever, maxCoord * 1e-12 * lever)
    return Math.max(base, maxLen * lever * 1e-12)
}

function paramRangeTolerance(s1: Segment, s2: Segment) {
    const { maxLen } = segmentScale(s1, s2)
    return Math.max(Precision.CURVE_PARAM_EPS, 1e-10 / maxLen)
}
