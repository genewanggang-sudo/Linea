import { Interval } from '../../curves/interval'
import type { Curve2 } from '../../curves/curve2'
import type { Vec2 } from '../../core/vec2'
import { Precision } from '../../utils/precision'
import type { ICurvePairIntersector } from '../intersector'
import { certifyOverlapMonotone, certifyParamPair, projectRangeToCurve } from '../internal/certification'
import { collectIntervalClipSeeds } from '../internal/interval_clipping'
import { intersectSegments, lerp, makeSegment, segmentBoxesMayIntersect, segmentDistance } from '../internal/segment'
import { sampleCurveAdaptive, type CurveSample } from '../internal/sampling'
import { makeIntersectionTolerance } from '../internal/tolerance'
import type { CurveXInfo } from '../types'

type PointSeed = {
    u1: number
    u2: number
}

type OverlapSeed = {
    range1: Interval
    range2: Interval
}

type SegmentSample = {
    u0: number
    u1: number
    seg: ReturnType<typeof makeSegment>
}

type RefineResult = {
    point: Vec2
    u1: number
    u2: number
    residual: number
}

export type PolylineIntersectorDiagnostics = {
    numericClosestFallbackCount: number
    analyticClosestFallbackCount: number
    recursiveNodesVisited: number
    recursiveAbortCount: number
    refineFailureCount: number
    certificationRejectCount: number
    certificationMissCount: number
    degenerateRescueCount: number
    rescuePassCount: number
    rescueSeedCount: number
    rescueHitCount: number
    candidateSeedCount: number
    certifiedPointCount: number
    certifiedOverlapCount: number
    newtonIterationsTotal: number
    projectionIterationsTotal: number
    maxResidual: number
}

const polylineDiagnostics: PolylineIntersectorDiagnostics = {
    numericClosestFallbackCount: 0,
    analyticClosestFallbackCount: 0,
    recursiveNodesVisited: 0,
    recursiveAbortCount: 0,
    refineFailureCount: 0,
    certificationRejectCount: 0,
    certificationMissCount: 0,
    degenerateRescueCount: 0,
    rescuePassCount: 0,
    rescueSeedCount: 0,
    rescueHitCount: 0,
    candidateSeedCount: 0,
    certifiedPointCount: 0,
    certifiedOverlapCount: 0,
    newtonIterationsTotal: 0,
    projectionIterationsTotal: 0,
    maxResidual: 0,
}

export class PolylinePairIntersector implements ICurvePairIntersector {
    private runPointSeedLimit = 0
    private runOverlapSeedLimit = 0

    public static resetDiagnostics() {
        polylineDiagnostics.numericClosestFallbackCount = 0
        polylineDiagnostics.analyticClosestFallbackCount = 0
        polylineDiagnostics.recursiveNodesVisited = 0
        polylineDiagnostics.recursiveAbortCount = 0
        polylineDiagnostics.refineFailureCount = 0
        polylineDiagnostics.certificationRejectCount = 0
        polylineDiagnostics.certificationMissCount = 0
        polylineDiagnostics.degenerateRescueCount = 0
        polylineDiagnostics.rescuePassCount = 0
        polylineDiagnostics.rescueSeedCount = 0
        polylineDiagnostics.rescueHitCount = 0
        polylineDiagnostics.candidateSeedCount = 0
        polylineDiagnostics.certifiedPointCount = 0
        polylineDiagnostics.certifiedOverlapCount = 0
        polylineDiagnostics.newtonIterationsTotal = 0
        polylineDiagnostics.projectionIterationsTotal = 0
        polylineDiagnostics.maxResidual = 0
    }

    public static getDiagnostics(): PolylineIntersectorDiagnostics {
        return { ...polylineDiagnostics }
    }

    public static recordAnalyticClosestFallback() {
        polylineDiagnostics.analyticClosestFallbackCount++
    }

    constructor(
        private readonly segmentsPerCurve: number,
        private readonly maxNewtonIter = Precision.CURVE_MAX_ITER,
    ) { }

    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const tol = makeIntersectionTolerance(c1, c2)
        const pairTol = tol.pointTol
        const strictCertify = c1.isBSpline() || c2.isBSpline()
        const enableNearMissSeeding = strictCertify || c1.isEllipseArc() || c2.isEllipseArc()
        const nearSeedBudget = Math.max(48, Math.floor(this.segmentsPerCurve * 0.75))
        this.runPointSeedLimit = Math.max(320, this.segmentsPerCurve * 2)
        this.runOverlapSeedLimit = Math.max(24, Math.ceil(this.segmentsPerCurve / 8))
        const s1 = sampleCurveAdaptive(c1, this.segmentsPerCurve, {
            chordErrorTol: pairTol * 0.75,
            maxSamples: this.segmentsPerCurve * 8,
        })
        const s2 = sampleCurveAdaptive(c2, this.segmentsPerCurve, {
            chordErrorTol: pairTol * 0.75,
            maxSamples: this.segmentsPerCurve * 8,
        })
        if (s1.length < 2 || s2.length < 2) return []
        const segs1 = this.buildSegments(s1)
        const segs2 = this.buildSegments(s2)

        const pointSeeds: PointSeed[] = []
        const overlapSeeds: OverlapSeed[] = []
        let minNearDistance = Number.POSITIVE_INFINITY
        let nearSeedCount = 0
        const refineFailureBefore = polylineDiagnostics.refineFailureCount

        const ret: CurveXInfo[] = []
        for (let i = 0; i < segs1.length; i++) {
            const sA = segs1[i]
            for (let j = 0; j < segs2.length; j++) {
                const sB = segs2[j]
                if (!segmentBoxesMayIntersect(sA.seg, sB.seg, pairTol)) continue
                const hit = intersectSegments(sA.seg, sB.seg)
                if (hit.kind === 'none') {
                    const near = segmentDistance(sA.seg, sB.seg)
                    minNearDistance = Math.min(minNearDistance, near)
                    if (
                        enableNearMissSeeding &&
                        near <= pairTol * 0.8 &&
                        nearSeedCount < nearSeedBudget &&
                        pointSeeds.length <= nearSeedBudget * 2
                    ) {
                        this.addNearMissSeeds(pointSeeds, sA, sB, tol.seedParamTol)
                        nearSeedCount++
                    }
                    continue
                }

                minNearDistance = 0

                if (hit.kind === 'point') {
                    const u1 = lerp(sA.u0, sA.u1, hit.t1)
                    const u2 = lerp(sB.u0, sB.u1, hit.t2)
                    this.addPointSeed(pointSeeds, u1, u2, tol.seedParamTol)
                    continue
                }

                const u1s = lerp(sA.u0, sA.u1, hit.t1s)
                const u1e = lerp(sA.u0, sA.u1, hit.t1e)
                const u2s = lerp(sB.u0, sB.u1, hit.t2s)
                const u2e = lerp(sB.u0, sB.u1, hit.t2e)
                this.addOverlapSeed(overlapSeeds, {
                    range1: new Interval(Math.min(u1s, u1e), Math.max(u1s, u1e)),
                    range2: new Interval(Math.min(u2s, u2e), Math.max(u2s, u2e)),
                })

                this.addPointSeed(pointSeeds, (u1s + u1e) * 0.5, (u2s + u2e) * 0.5, tol.seedParamTol)
                this.addPointSeed(pointSeeds, u1s, u2s, tol.seedParamTol)
                this.addPointSeed(pointSeeds, u1e, u2e, tol.seedParamTol)
            }
        }

        if (pointSeeds.length <= 8 && overlapSeeds.length <= 4) {
            const clipped = collectIntervalClipSeeds(c1, c2, {
                pointTol: pairTol,
                seedParamTol: tol.seedParamTol,
                maxDepth: Math.max(8, Math.ceil(Math.log2(Math.max(8, this.segmentsPerCurve))) + 6),
                maxNodes: this.recursiveMaxNodes(c1, c2),
                pointSeedLimit: Math.max(8, this.runPointSeedLimit - pointSeeds.length),
                overlapSeedLimit: Math.max(4, this.runOverlapSeedLimit - overlapSeeds.length),
            })
            polylineDiagnostics.recursiveNodesVisited += clipped.diagnostics.nodesVisited
            if (clipped.diagnostics.aborted) {
                polylineDiagnostics.recursiveAbortCount++
            }
            for (const seed of clipped.pointSeeds) {
                this.addPointSeed(pointSeeds, seed.u1, seed.u2, tol.seedParamTol)
            }
            for (const overlap of clipped.overlapSeeds) {
                this.addOverlapSeed(overlapSeeds, overlap)
            }
        }
        polylineDiagnostics.candidateSeedCount += pointSeeds.length

        for (const seed of pointSeeds) {
            const refined = this.refinePair(c1, c2, seed.u1, seed.u2, pairTol, strictCertify)
            if (!refined) continue
            this.pushUnique(ret, {
                point: refined.point,
                u1: refined.u1,
                u2: refined.u2,
                isOverlap: false,
            })
            polylineDiagnostics.certifiedPointCount++
        }

        for (const overlap of overlapSeeds) {
            const overlapInfo = this.refineOverlap(c1, c2, overlap, pairTol, tol.paramTol)
            if (overlapInfo) {
                this.pushUnique(ret, overlapInfo)
                if (overlapInfo.isOverlap) {
                    polylineDiagnostics.certifiedOverlapCount++
                } else {
                    polylineDiagnostics.certifiedPointCount++
                }
            }
        }

        const refineFailureDelta = polylineDiagnostics.refineFailureCount - refineFailureBefore
        if (
            strictCertify &&
            ret.length === 0 &&
            (pointSeeds.length > 0 || overlapSeeds.length > 0 || minNearDistance <= pairTol * 2)
        ) {
            const rescued = this.runRescuePass(c1, c2, pairTol, tol.seedParamTol)
            if (rescued.length > 0) {
                for (const hit of rescued) {
                    this.pushUnique(ret, hit)
                }
                polylineDiagnostics.rescueHitCount += rescued.length
            }
        }
        if (
            strictCertify &&
            ret.length === 0 &&
            (pointSeeds.length > 0 || overlapSeeds.length > 0) &&
            minNearDistance <= pairTol * 0.2 &&
            refineFailureDelta >= 3
        ) {
            polylineDiagnostics.certificationMissCount++
        }

        return ret
    }

    private buildSegments(samples: CurveSample[]): SegmentSample[] {
        const ret: SegmentSample[] = []
        for (let i = 0; i < samples.length - 1; i++) {
            const a = samples[i]
            const b = samples[i + 1]
            ret.push({
                u0: a.u,
                u1: b.u,
                seg: makeSegment(a.p, b.p),
            })
        }
        return ret
    }

    private addNearMissSeeds(
        seeds: PointSeed[],
        a: SegmentSample,
        b: SegmentSample,
        paramTol: number,
    ) {
        this.addPointSeed(seeds, 0.5 * (a.u0 + a.u1), 0.5 * (b.u0 + b.u1), paramTol)
    }

    private addPointSeed(seeds: PointSeed[], u1: number, u2: number, paramTol: number) {
        if (this.runPointSeedLimit > 0 && seeds.length >= this.runPointSeedLimit) return
        for (const seed of seeds) {
            if (
                Math.abs(seed.u1 - u1) <= paramTol &&
                Math.abs(seed.u2 - u2) <= paramTol
            ) {
                return
            }
        }
        seeds.push({ u1, u2 })
    }

    private addOverlapSeed(seeds: OverlapSeed[], next: OverlapSeed) {
        for (let i = 0; i < seeds.length; i++) {
            const cur = seeds[i]
            const overlap1 = next.range1.intersect(cur.range1, Precision.CURVE_PARAM_EPS * 8)
            const overlap2 = next.range2.intersect(cur.range2, Precision.CURVE_PARAM_EPS * 8)
            if (overlap1.length === 0 || overlap2.length === 0) continue
            seeds[i] = {
                range1: new Interval(Math.min(cur.range1.start, next.range1.start), Math.max(cur.range1.end, next.range1.end)),
                range2: new Interval(Math.min(cur.range2.start, next.range2.start), Math.max(cur.range2.end, next.range2.end)),
            }
            return
        }
        if (this.runOverlapSeedLimit > 0 && seeds.length >= this.runOverlapSeedLimit) return
        seeds.push(next)
    }

    private refinePair(
        c1: Curve2,
        c2: Curve2,
        u1Seed: number,
        u2Seed: number,
        tol: number,
        strictCertify = false,
    ): RefineResult | undefined {
        const newton = this.refineByNewton(c1, c2, u1Seed, u2Seed, tol)
        if (newton && newton.residual <= tol * 2) {
            if (!strictCertify) {
                polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, newton.residual)
                return newton
            }
            const certified = certifyParamPair(c1, c2, newton, tol, (curve, p, t) => this.safeClosestPoint(curve, p, t))
            if (certified) {
                polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, certified.pair.residual)
                if (certified.usedDegenerateRescue) polylineDiagnostics.degenerateRescueCount++
                return certified.pair
            }
            polylineDiagnostics.certificationRejectCount++
        }

        const proj = this.refineByProjection(c1, c2, newton?.u1 ?? u1Seed, newton?.u2 ?? u2Seed, tol)
        if (proj && proj.residual <= tol * 2) {
            if (!strictCertify) {
                polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, proj.residual)
                return proj
            }
            const certified = certifyParamPair(c1, c2, proj, tol, (curve, p, t) => this.safeClosestPoint(curve, p, t))
            if (certified) {
                polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, certified.pair.residual)
                if (certified.usedDegenerateRescue) polylineDiagnostics.degenerateRescueCount++
                return certified.pair
            }
            polylineDiagnostics.certificationRejectCount++
        }

        const best = this.pickBest(newton, proj)
        if (!best || best.residual > tol * 8) {
            polylineDiagnostics.refineFailureCount++
            return undefined
        }
        if (!strictCertify) {
            polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, best.residual)
            return best
        }
        const certified = certifyParamPair(c1, c2, best, tol, (curve, p, t) => this.safeClosestPoint(curve, p, t))
        if (!certified) {
            polylineDiagnostics.certificationRejectCount++
            polylineDiagnostics.refineFailureCount++
            return undefined
        }
        polylineDiagnostics.maxResidual = Math.max(polylineDiagnostics.maxResidual, certified.pair.residual)
        if (certified.usedDegenerateRescue) polylineDiagnostics.degenerateRescueCount++
        return certified.pair
    }

    private refineByNewton(c1: Curve2, c2: Curve2, u1Seed: number, u2Seed: number, tol: number): RefineResult | undefined {
        const r1 = c1.getRange()
        const r2 = c2.getRange()
        const span1 = Math.max(r1.length(), Precision.CURVE_PARAM_EPS)
        const span2 = Math.max(r2.length(), Precision.CURVE_PARAM_EPS)

        let u1 = r1.clamp(u1Seed)
        let u2 = r2.clamp(u2Seed)
        let best = this.measure(c1, c2, u1, u2)
        let lastDelta = Number.POSITIVE_INFINITY

        for (let i = 0; i < this.maxNewtonIter; i++) {
            polylineDiagnostics.newtonIterationsTotal++
            const p1 = c1.pointAt(u1)
            const p2 = c2.pointAt(u2)
            const diff = p1.subtracted(p2)
            if (diff.len() <= tol) return this.measure(c1, c2, u1, u2)

            const t1 = c1.tangentAt(u1)
            const t2 = c2.tangentAt(u2)
            const det = t1.cross(t2)
            if (Math.abs(det) <= Precision.CURVE_NEWTON_EPS) {
                break
            }

            // [t1.x -t2.x; t1.y -t2.y] * [du, dv]^T = -diff
            const bx = -diff.x
            const by = -diff.y
            let du = (bx * (-t2.y) - by * (-t2.x)) / det
            let dv = (t1.x * by - t1.y * bx) / det

            if (!Number.isFinite(du) || !Number.isFinite(dv)) {
                break
            }
            const limit1 = Math.max(span1 * 0.25, Precision.CURVE_PARAM_EPS * 8)
            const limit2 = Math.max(span2 * 0.25, Precision.CURVE_PARAM_EPS * 8)
            du = clamp(du, -limit1, limit1)
            dv = clamp(dv, -limit2, limit2)

            let nextU1 = r1.clamp(u1 + du)
            let nextU2 = r2.clamp(u2 + dv)
            let candidate = this.measure(c1, c2, nextU1, nextU2)

            // Damping if raw Newton step does not improve.
            if (candidate.residual > best.residual + tol * 0.2) {
                let accepted = false
                for (let damp = 0; damp < 4; damp++) {
                    const f = Math.pow(0.5, damp + 1)
                    const dU1 = du * f
                    const dU2 = dv * f
                    nextU1 = r1.clamp(u1 + dU1)
                    nextU2 = r2.clamp(u2 + dU2)
                    candidate = this.measure(c1, c2, nextU1, nextU2)
                    if (candidate.residual <= best.residual + tol * 0.1) {
                        accepted = true
                        break
                    }
                }
                if (!accepted && candidate.residual > best.residual + tol * 0.25) {
                    break
                }
            }
            const delta = Math.abs(nextU1 - u1) + Math.abs(nextU2 - u2)
            u1 = nextU1
            u2 = nextU2
            if (candidate.residual < best.residual) best = candidate

            if (delta <= Precision.CURVE_PARAM_EPS * 8) {
                break
            }
            if (delta >= lastDelta - Precision.CURVE_PARAM_EPS * 8) {
                break
            }
            lastDelta = delta
        }

        const final = this.measure(c1, c2, u1, u2)
        return this.pickBest(best, final)
    }

    private refineByProjection(c1: Curve2, c2: Curve2, u1Seed: number, u2Seed: number, tol: number): RefineResult | undefined {
        const r1 = c1.getRange()
        const r2 = c2.getRange()
        let u1 = r1.clamp(u1Seed)
        let u2 = r2.clamp(u2Seed)
        let best = this.measure(c1, c2, u1, u2)

        for (let i = 0; i < this.maxNewtonIter; i++) {
            polylineDiagnostics.projectionIterationsTotal++
            const p1 = c1.pointAt(u1)
            const cp2 = this.safeClosestPoint(c2, p1, tol)
            if (!cp2) break
            const nextU2 = r2.clamp(cp2.param)

            const p2 = c2.pointAt(nextU2)
            const cp1 = this.safeClosestPoint(c1, p2, tol)
            if (!cp1) break
            const nextU1 = r1.clamp(cp1.param)

            const candidate = this.measure(c1, c2, nextU1, nextU2)
            if (candidate.residual < best.residual) best = candidate
            if (candidate.residual <= tol) return candidate

            const du = Math.abs(nextU1 - u1)
            const dv = Math.abs(nextU2 - u2)
            u1 = nextU1
            u2 = nextU2
            if (du + dv <= Precision.CURVE_PARAM_EPS * 8) break
        }
        return best
    }

    private runRescuePass(c1: Curve2, c2: Curve2, pointTol: number, seedParamTol: number): CurveXInfo[] {
        polylineDiagnostics.rescuePassCount++

        const ret: CurveXInfo[] = []
        const seeds: PointSeed[] = []
        const r1 = c1.getRange()
        const r2 = c2.getRange()

        const baseSamples = Math.max(24, Math.min(96, Math.floor(this.segmentsPerCurve / 2)))
        for (let i = 0; i <= baseSamples; i++) {
            const t = i / baseSamples
            const u1 = r1.start + (r1.end - r1.start) * t
            const p1 = c1.pointAt(u1)
            const cp2 = this.safeClosestPoint(c2, p1, pointTol * 3)
            if (!cp2 || cp2.distance > pointTol * 2.5) continue
            this.addPointSeed(seeds, u1, r2.clamp(cp2.param), seedParamTol)
        }
        for (let i = 0; i <= baseSamples; i++) {
            const t = i / baseSamples
            const u2 = r2.start + (r2.end - r2.start) * t
            const p2 = c2.pointAt(u2)
            const cp1 = this.safeClosestPoint(c1, p2, pointTol * 3)
            if (!cp1 || cp1.distance > pointTol * 2.5) continue
            this.addPointSeed(seeds, r1.clamp(cp1.param), u2, seedParamTol)
        }

        polylineDiagnostics.rescueSeedCount += seeds.length
        for (const seed of seeds) {
            const refined = this.refinePair(c1, c2, seed.u1, seed.u2, pointTol, true)
            if (!refined) continue
            this.pushUnique(ret, {
                point: refined.point,
                u1: refined.u1,
                u2: refined.u2,
                isOverlap: false,
            })
        }
        return ret
    }

    private measure(c1: Curve2, c2: Curve2, u1: number, u2: number): RefineResult {
        const p1 = c1.pointAt(u1)
        const p2 = c2.pointAt(u2)
        return {
            u1,
            u2,
            point: p1.added(p2).scale(0.5),
            residual: p1.distanceTo(p2),
        }
    }

    private refineOverlap(c1: Curve2, c2: Curve2, overlap: OverlapSeed, tol: number, paramTol: number): CurveXInfo | undefined {
        const midU1 = 0.5 * (overlap.range1.start + overlap.range1.end)
        const midU2 = 0.5 * (overlap.range2.start + overlap.range2.end)
        const mid = this.refinePair(c1, c2, midU1, midU2, tol, false)
        if (!mid) return undefined

        const range2 = projectRangeToCurve(c1, c2, overlap.range1, tol, (curve, p, t) => this.safeClosestPoint(curve, p, t))
        if (!range2) return undefined
        if (overlap.range1.length() <= paramTol || range2.length() <= paramTol) {
            return {
                point: mid.point,
                u1: mid.u1,
                u2: mid.u2,
                isOverlap: false,
            }
        }
        const quality = certifyOverlapMonotone(
            c1,
            c2,
            overlap.range1,
            tol,
            paramTol,
            (curve, p, t) => this.safeClosestPoint(curve, p, t),
        )

        if (!quality) {
            return {
                point: mid.point,
                u1: mid.u1,
                u2: mid.u2,
                isOverlap: false,
            }
        }

        return {
            point: mid.point,
            u1: mid.u1,
            u2: mid.u2,
            isOverlap: true,
            range1: overlap.range1,
            range2,
        }
    }

    private safeClosestPoint(curve: Curve2, p: Vec2, tol: number) {
        try {
            return curve.closestPoint(p, tol)
        } catch {
            polylineDiagnostics.numericClosestFallbackCount++
            return this.sampleClosestPoint(curve, p, 48)
        }
    }

    private sampleClosestPoint(curve: Curve2, p: Vec2, sampleCount: number) {
        const range = curve.getRange()
        let bestParam = range.start
        let bestPoint = curve.pointAt(bestParam)
        let bestDist = bestPoint.distanceTo(p)
        const total = Math.max(8, sampleCount)
        for (let i = 1; i <= total; i++) {
            const t = i / total
            const u = range.start + (range.end - range.start) * t
            const q = curve.pointAt(u)
            const d = q.distanceTo(p)
            if (d < bestDist) {
                bestDist = d
                bestPoint = q
                bestParam = u
            }
        }

        // Local Newton refinement around sampled best parameter.
        let u = bestParam
        for (let i = 0; i < 12; i++) {
            const cp = curve.pointAt(u).subtracted(p)
            const d1 = curve.derivativeAt(u, 1)
            const d2 = curve.derivativeAt(u, 2)
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
        bestDist = bestPoint.distanceTo(p)

        return {
            point: bestPoint,
            param: bestParam,
            distance: bestDist,
        }
    }

    private pickBest(a: RefineResult | undefined, b: RefineResult | undefined): RefineResult | undefined {
        if (!a) return b
        if (!b) return a
        return a.residual <= b.residual ? a : b
    }

    private pushUnique(out: CurveXInfo[], next: CurveXInfo) {
        for (const item of out) {
            if (
                Math.abs(item.u1 - next.u1) <= Precision.CURVE_PARAM_EPS * 8 &&
                Math.abs(item.u2 - next.u2) <= Precision.CURVE_PARAM_EPS * 8 &&
                item.point.distanceTo(next.point) <= Precision.CURVE_LENGTH_EPS * 4 &&
                item.isOverlap === next.isOverlap
            ) {
                return
            }
        }
        out.push(next)
    }

    private recursiveMaxNodes(c1: Curve2, c2: Curve2) {
        const heavy = c1.isBSpline() || c2.isBSpline() || c1.isEllipseArc() || c2.isEllipseArc()
        return heavy
            ? Math.max(5000, this.segmentsPerCurve * 28)
            : Math.max(2500, this.segmentsPerCurve * 16)
    }
}

function clamp(x: number, min: number, max: number) {
    return Math.min(max, Math.max(min, x))
}
