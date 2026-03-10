import type { BSpline2 } from '../../curves/bspline2'
import type { Curve2 } from '../../curves/curve2'
import { Precision } from '../../utils/precision'
import type { CurveXInfo } from '../types'
import { collectIntervalClipSeeds } from '../internal/interval_clipping'
import { sampleCurveAdaptive } from '../internal/sampling'
import { curvePointTolerance } from '../internal/tolerance'
import { intersectSegments, lerp, makeSegment, segmentBoxesMayIntersect, segmentDistance } from '../internal/segment'

type SegmentSample = {
    i: number
    u0: number
    u1: number
    seg: ReturnType<typeof makeSegment>
}

type Seed = {
    u1: number
    u2: number
}

type RefinedPair = {
    u1: number
    u2: number
    pointDist: number
}

export class BSplineSelfSolver {
    public intersect(curve: BSpline2): CurveXInfo[] {
        const pointTol = curvePointTolerance(curve)
        const acceptTol = selfAcceptTol(curve, pointTol)
        const seedNearTol = Math.max(acceptTol * 0.5, pointTol * 16)
        const sepTol = Math.max(Precision.CURVE_PARAM_EPS * 64, curve.getRange().length() * 1e-6)
        const adaptiveSegments = buildSegmentSamples(curve, 512)
        if (adaptiveSegments.length < 4) return []

        // Primary pipeline uses dual seeding:
        // 1) adaptive geometric segments (shape-aware)
        // 2) uniform parameter segments (coverage-aware)
        // This is not a fallback; it addresses seed completeness for oscillatory spans.
        const uniformSegments = buildUniformSegmentSamples(curve, 1200)
        const seedsA = collectSelfSeeds(adaptiveSegments, seedNearTol, sepTol)
        const seedsU = collectSelfSeeds(uniformSegments, seedNearTol, sepTol)
        const seedsB = collectSelfSeedsByIntervalClip(curve, acceptTol, sepTol)
        const seeds = mergeSeeds(mergeSeeds(seedsA, seedsU, sepTol), seedsB, sepTol)
        return refineSeedsToResults(curve, seeds, acceptTol, pointTol, sepTol)
    }
}

const defaultBSplineSelfSolver = new BSplineSelfSolver()

export function intersectBSplineSelf(curve: BSpline2): CurveXInfo[] {
    return defaultBSplineSelfSolver.intersect(curve)
}

function refineSeedsToResults(curve: BSpline2, seeds: Seed[], acceptTol: number, pointTol: number, sepTol: number) {
    const out: CurveXInfo[] = []
    const diagonalParamTol = Math.max(sepTol * 8, curve.getRange().length() * 1e-3)
    const dedupPointTol = Math.max(pointTol * 16, acceptTol * 1.5)
    for (const seed of seeds) {
        const refined = refineSelfPairLM(curve, seed.u1, seed.u2, acceptTol, sepTol)
        if (!refined) continue
        if (isTrivialDiagonalPair(curve, refined.u1, refined.u2, diagonalParamTol)) continue
        curve.getRange().assertContains(refined.u1, Precision.CURVE_PARAM_EPS)
        curve.getRange().assertContains(refined.u2, Precision.CURVE_PARAM_EPS)
        const p1 = curve.getPtAt(refined.u1)
        const p2 = curve.getPtAt(refined.u2)
        const point = p1.added(p2).scale(0.5)
        pushUnique(out, {
            point,
            u1: refined.u1,
            u2: refined.u2,
            isOverlap: false,
        }, dedupPointTol, sepTol)
    }
    return out
}

function buildSegmentSamples(curve: BSpline2, targetSegments: number) {
    const samples = sampleCurveAdaptive(curve, targetSegments, {
        chordErrorTol: curvePointTolerance(curve) * 0.75,
        maxSamples: targetSegments * 8,
    })
    const ret: SegmentSample[] = []
    for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i]
        const b = samples[i + 1]
        ret.push({
            i,
            u0: a.u,
            u1: b.u,
            seg: makeSegment(a.p, b.p),
        })
    }
    return ret
}

function buildUniformSegmentSamples(curve: BSpline2, segmentCount: number) {
    const range = curve.getRange()
    const n = Math.max(64, segmentCount)
    const ret: SegmentSample[] = []
    let p0 = curve.getStartPt()
    let u0 = range.start
    for (let i = 1; i <= n; i++) {
        const t = i / n
        const u1 = range.start + (range.end - range.start) * t
        const p1 = curve.getPtAt(u1)
        ret.push({
            i: i - 1,
            u0,
            u1,
            seg: makeSegment(p0, p1),
        })
        u0 = u1
        p0 = p1
    }
    return ret
}

function collectSelfSeedsByIntervalClip(curve: BSpline2, pointTol: number, sepTol: number) {
    const clip = collectIntervalClipSeeds(curve, curve, {
        pointTol,
        seedParamTol: Precision.CURVE_PARAM_EPS * 16,
        maxDepth: 14,
        maxNodes: 12000,
        pointSeedLimit: 4096,
        overlapSeedLimit: 64,
    })
    const seeds: Seed[] = []
    const pushSeed = (u1: number, u2: number) => {
        const a = Math.min(u1, u2)
        const b = Math.max(u1, u2)
        if (Math.abs(a - b) <= sepTol) return
        for (const seed of seeds) {
            if (
                Math.abs(seed.u1 - a) <= Precision.CURVE_PARAM_EPS * 16 &&
                Math.abs(seed.u2 - b) <= Precision.CURVE_PARAM_EPS * 16
            ) {
                return
            }
        }
        seeds.push({ u1: a, u2: b })
    }

    for (const seed of clip.pointSeeds) {
        pushSeed(seed.u1, seed.u2)
    }
    for (const overlap of clip.overlapSeeds) {
        const u1 = 0.5 * (overlap.range1.start + overlap.range1.end)
        const u2 = 0.5 * (overlap.range2.start + overlap.range2.end)
        pushSeed(u1, u2)
    }
    return seeds
}

function collectSelfSeeds(segments: SegmentSample[], nearTol: number, sepTol: number) {
    const seeds: Seed[] = []
    const pushSeed = (u1: number, u2: number) => {
        const a = Math.min(u1, u2)
        const b = Math.max(u1, u2)
        if (Math.abs(a - b) <= sepTol) return
        for (const seed of seeds) {
            if (Math.abs(seed.u1 - a) <= Precision.CURVE_PARAM_EPS * 16 &&
                Math.abs(seed.u2 - b) <= Precision.CURVE_PARAM_EPS * 16) {
                return
            }
        }
        seeds.push({ u1: a, u2: b })
    }

    for (let i = 0; i < segments.length; i++) {
        const a = segments[i]
        for (let j = i + 2; j < segments.length; j++) {
            // Open polyline endpoint adjacency.
            if (i === 0 && j === segments.length - 1) continue
            const b = segments[j]
            if (!segmentBoxesMayIntersect(a.seg, b.seg, nearTol * 2)) continue
            const hit = intersectSegments(a.seg, b.seg)
            if (hit.kind === 'point') {
                pushSeed(lerp(a.u0, a.u1, hit.t1), lerp(b.u0, b.u1, hit.t2))
                continue
            }
            if (hit.kind === 'overlap') {
                pushSeed(
                    lerp(a.u0, a.u1, 0.5 * (hit.t1s + hit.t1e)),
                    lerp(b.u0, b.u1, 0.5 * (hit.t2s + hit.t2e)),
                )
                continue
            }
            const near = segmentDistance(a.seg, b.seg)
            if (near <= nearTol) {
                pushSeed(0.5 * (a.u0 + a.u1), 0.5 * (b.u0 + b.u1))
            }
        }
    }

    return seeds
}

function refineSelfPairLM(curve: Curve2, u1Seed: number, u2Seed: number, pointTol: number, sepTol: number): RefinedPair | undefined {
    const range = curve.getRange()
    let u1 = range.clamp(u1Seed)
    let u2 = range.clamp(u2Seed)
    let best = measure(curve, u1, u2)

    let lambda = 1e-6
    for (let i = 0; i < 40; i++) {
        curve.getRange().assertContains(u1, Precision.CURVE_PARAM_EPS)
        curve.getRange().assertContains(u2, Precision.CURVE_PARAM_EPS)
        const p1 = curve.getPtAt(u1)
        const p2 = curve.getPtAt(u2)
        const diff = p1.subtracted(p2)
        const residual = diff.len()
        if (residual < best.pointDist) best = { u1, u2, pointDist: residual }
        if (residual <= pointTol && Math.abs(u1 - u2) > sepTol) break

        const t1 = curve.derivativeAt(u1, 1)
        const t2 = curve.derivativeAt(u2, 1)

        // Solve damped normal equation:
        // (J^T J + lambda I) d = -J^T r, J=[t1, -t2], r = p1-p2.
        const a11 = t1.dot(t1) + lambda
        const a22 = t2.dot(t2) + lambda
        const a12 = -t1.dot(t2)
        const b1 = -t1.dot(diff)
        const b2 = t2.dot(diff)
        const det = a11 * a22 - a12 * a12
        if (!Number.isFinite(det) || Math.abs(det) <= Precision.CURVE_NEWTON_EPS) {
            lambda *= 10
            continue
        }
        let du = (b1 * a22 - b2 * a12) / det
        let dv = (a11 * b2 - a12 * b1) / det
        if (!Number.isFinite(du) || !Number.isFinite(dv)) {
            lambda *= 10
            continue
        }

        const maxStep = range.length() * 0.2
        du = clamp(du, -maxStep, maxStep)
        dv = clamp(dv, -maxStep, maxStep)

        let accepted = false
        let alpha = 1.0
        for (let ls = 0; ls < 8; ls++) {
            const nu1 = range.clamp(u1 + du * alpha)
            const nu2 = range.clamp(u2 + dv * alpha)
            const cand = measure(curve, nu1, nu2)
            if (cand.pointDist <= best.pointDist + pointTol * 0.05) {
                u1 = nu1
                u2 = nu2
                if (cand.pointDist < best.pointDist) best = cand
                accepted = true
                lambda = Math.max(1e-10, lambda * 0.3)
                break
            }
            alpha *= 0.5
        }
        if (!accepted) {
            lambda *= 8
        }

        if (Math.abs(du) + Math.abs(dv) <= Precision.CURVE_PARAM_EPS * 8) {
            break
        }
    }

    if (best.pointDist > pointTol * 4) return undefined
    if (Math.abs(best.u1 - best.u2) <= sepTol) return undefined
    return best
}

function measure(curve: Curve2, u1: number, u2: number): RefinedPair {
    curve.getRange().assertContains(u1, Precision.CURVE_PARAM_EPS)
    curve.getRange().assertContains(u2, Precision.CURVE_PARAM_EPS)
    const p1 = curve.getPtAt(u1)
    const p2 = curve.getPtAt(u2)
    return {
        u1,
        u2,
        pointDist: p1.distanceTo(p2),
    }
}

function pushUnique(out: CurveXInfo[], next: CurveXInfo, pointTol: number, sepTol: number) {
    const a1 = Math.min(next.u1, next.u2)
    const a2 = Math.max(next.u1, next.u2)
    if (Math.abs(a1 - a2) <= sepTol) return

    for (const item of out) {
        const b1 = Math.min(item.u1, item.u2)
        const b2 = Math.max(item.u1, item.u2)
        if (
            Math.abs(a1 - b1) <= Precision.CURVE_PARAM_EPS * 16 &&
            Math.abs(a2 - b2) <= Precision.CURVE_PARAM_EPS * 16
        ) {
            return
        }
        if (item.point.distanceTo(next.point) <= pointTol * 0.5) return
    }

    out.push({
        ...next,
        u1: a1,
        u2: a2,
    })
}

function selfAcceptTol(curve: BSpline2, pointTol: number) {
    const box = curve.getBBox()
    const diag = Math.hypot(box.width(), box.height())
    return Math.max(pointTol * 32, diag * 2e-6, Precision.CURVE_LENGTH_EPS * 16)
}

function clamp(x: number, min: number, max: number) {
    return Math.min(max, Math.max(min, x))
}

function mergeSeeds(a: Seed[], b: Seed[], sepTol: number) {
    const ret: Seed[] = []
    const push = (seed: Seed) => {
        const u1 = Math.min(seed.u1, seed.u2)
        const u2 = Math.max(seed.u1, seed.u2)
        if (Math.abs(u1 - u2) <= sepTol) return
        for (const s of ret) {
            if (
                Math.abs(s.u1 - u1) <= Precision.CURVE_PARAM_EPS * 16 &&
                Math.abs(s.u2 - u2) <= Precision.CURVE_PARAM_EPS * 16
            ) {
                return
            }
        }
        ret.push({ u1, u2 })
    }
    for (const seed of a) push(seed)
    for (const seed of b) push(seed)
    return ret
}

function isTrivialDiagonalPair(curve: Curve2, u1: number, u2: number, diagonalParamTol: number) {
    const du = Math.abs(u1 - u2)
    if (du > diagonalParamTol) return false

    const t1 = curve.getTangentAt(u1)
    const t2 = curve.getTangentAt(u2)
    const l1 = t1.len()
    const l2 = t2.len()
    if (l1 <= Precision.CURVE_NEWTON_EPS || l2 <= Precision.CURVE_NEWTON_EPS) return true

    const inv = 1 / (l1 * l2)
    const crossN = Math.abs(t1.cross(t2)) * inv
    const dotN = t1.dot(t2) * inv
    // Near-diagonal same-direction pair is not a real self intersection.
    return crossN <= 1e-3 && dotN >= 0.95
}
