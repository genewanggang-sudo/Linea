import type { Vec2 } from '../core/vec2'
import type { Arc2 } from '../curves/arc2'
import type { BSpline2 } from '../curves/bspline2'
import type { Circle2 } from '../curves/circle2'
import type { Curve2 } from '../curves/curve2'
import { MathError } from '../utils/math_error'
import { MathUtils } from '../utils/math_utils'
import { Precision } from '../utils/precision'
import { DiscretizeOptions } from './discretize_options'

type AdaptiveSegment = {
    u0: number
    u1: number
    p0: Vec2
    p1: Vec2
}

type PolylineSample = {
    u: number
    p: Vec2
}

type SegmentEval = {
    split: boolean
    blocked: boolean
    score: number
}

type HeapItem = {
    id: number
    score: number
}

export class DiscretizeEngine {
    private constructor() { }

    private static readonly CHORD_CHECK_FRACTIONS = [0.25, 0.5, 0.75] as const
    private static readonly HARD_MAX_SEGMENTS = 1_000_000
    private static readonly HARD_MAX_REFINEMENT_STEPS = 2_000_000

    public static discretize(curve: Curve2, options?: DiscretizeOptions): Vec2[] {
        const resolved = options ?? DiscretizeOptions.medium
        MathError.assert(curve.isValid(), '离散参数错误: 曲线无效')
        const raw = this.dispatch(curve, resolved)
        const samples = this.postprocessResult(curve, raw, resolved)
        return samples.map((sample) => sample.p.clone())
    }

    private static dispatch(curve: Curve2, options: DiscretizeOptions): PolylineSample[] {
        if (curve.isLine()) return this.discretizeLineCurve(curve)

        if (curve.isCircle() || curve.isArc()) {
            return this.discretizeCircleLikeCurve(curve, options)
        }

        if (curve.isEllipse() || curve.isEllipseArc()) {
            return this.discretizeEllipseLikeCurve(curve, options)
        }

        if (curve.isBSpline()) {
            return this.discretizeBSplineCurve(curve, options)
        }

        MathError.assert(false, `离散不支持: ${curve.getType()}`)
    }

    private static postprocessResult(curve: Curve2, raw: PolylineSample[], options: DiscretizeOptions) {
        const range = curve.getRange()
        const startParam = range.start
        const endParam = range.end
        const startPoint = curve.pointAt(startParam)
        const endPoint = curve.pointAt(endParam)

        let samples = raw.map((sample) => ({ u: sample.u, p: sample.p }))
        if (samples.length === 0) {
            samples = [{ u: startParam, p: startPoint }]
        }

        samples = this.deduplicateAdjacent(samples, options.chordTol)
        samples[0] = { u: startParam, p: startPoint }

        if (curve.isClosed()) {
            while (samples.length > 1) {
                const first = samples[0]
                const last = samples[samples.length - 1]
                if (first.p.distanceTo(last.p) <= options.chordTol) {
                    samples.pop()
                    continue
                }
                break
            }
        } else {
            const endSample: PolylineSample = {
                u: endParam,
                p: endPoint,
            }
            samples[samples.length - 1] = endSample
        }

        return samples
    }

    private static discretizeLineCurve(curve: Curve2): PolylineSample[] {
        const range = curve.getRange()
        if (curve.isDegenerate()) return [{ u: range.start, p: curve.pointAt(range.start) }]
        return [
            { u: range.start, p: curve.pointAt(range.start) },
            { u: range.end, p: curve.pointAt(range.end) },
        ]
    }

    private static discretizeCircleLikeCurve(curve: Circle2 | Arc2, options: DiscretizeOptions): PolylineSample[] {
        const range = curve.getRange()
        const sweep = range.length()
        if (curve.isDegenerate()) return [{ u: range.start, p: curve.pointAt(range.start) }]

        const totalLen = curve.getLength()
        const radius = curve.radius
        MathError.assert(
            Number.isFinite(radius) && radius > 0,
            `离散不支持: ${curve.getType()} 半径无效`,
        )
        const maxByInternal = Math.max(1, Math.floor(totalLen / Precision.CURVE_LENGTH_EPS))
        const maxByMinLength = Math.max(1, Math.ceil(totalLen / options.minSegmentLength))
        const dThetaChord = this.dThetaByChord(radius, options.chordTol)
        const dTheta = Math.max(Precision.CURVE_PARAM_EPS, Math.min(dThetaChord, options.angleTolRad))
        const byTolerance = Math.max(1, Math.ceil(sweep / dTheta))
        const requiredSegments = Math.min(
            byTolerance,
            maxByInternal,
            maxByMinLength,
            this.HARD_MAX_SEGMENTS,
        )

        const closed = curve.isClosed()
        return this.buildCircleLikeSamples(curve, requiredSegments, closed)
    }

    private static discretizeEllipseLikeCurve(curve: Curve2, options: DiscretizeOptions): PolylineSample[] {
        const range = curve.getRange()
        if (curve.isDegenerate()) return [{ u: range.start, p: curve.pointAt(range.start) }]

        const initialSegmentCount = 1
        const segments = this.refineAdaptiveSegments(
            curve,
            this.buildInitialEllipseSegments(curve, initialSegmentCount),
            options,
        )
        return this.segmentsToSamples(segments)
    }

    private static discretizeBSplineCurve(curve: BSpline2, options: DiscretizeOptions): PolylineSample[] {
        const range = curve.getRange()
        if (curve.isDegenerate()) return [{ u: range.start, p: curve.pointAt(range.start) }]

        const initialSegments = this.buildInitialBSplineSegments(curve)
        if (initialSegments.length === 0) {
            return [{ u: range.start, p: curve.pointAt(range.start) }]
        }

        const refined = this.refineAdaptiveSegments(curve, initialSegments, options)
        return this.segmentsToSamples(refined)
    }

    private static dThetaByChord(radius: number, chordTol: number) {
        const ratio = 1 - chordTol / radius
        if (ratio <= -1) return Math.PI * 2
        const clamped = Math.min(1, Math.max(-1, ratio))
        return 2 * Math.acos(clamped)
    }

    private static buildCircleLikeSamples(curve: Curve2, segmentCount: number, closed: boolean): PolylineSample[] {
        const range = curve.getRange()
        const start = range.start
        const span = range.length()
        const steps = closed ? segmentCount : segmentCount + 1

        const samples: PolylineSample[] = []
        for (let i = 0; i < steps; i++) {
            const t = i / segmentCount
            const u = start + span * t
            samples.push({ u, p: curve.pointAt(u) })
        }
        return samples
    }

    private static buildInitialEllipseSegments(curve: Curve2, segmentCount: number) {
        const range = curve.getRange()
        const start = range.start
        const span = range.length()

        const segments: AdaptiveSegment[] = []
        for (let i = 0; i < segmentCount; i++) {
            const u0 = start + (span * i) / segmentCount
            const u1 = start + (span * (i + 1)) / segmentCount
            segments.push({
                u0,
                u1,
                p0: curve.pointAt(u0),
                p1: curve.pointAt(u1),
            })
        }
        return segments
    }

    private static buildInitialBSplineSegments(curve: BSpline2) {
        const range = curve.getRange()
        const boundaries = new Set<number>([
            range.start,
            range.end,
            ...curve.getContinuityBreakParams(Precision.CURVE_PARAM_EPS),
        ])

        const sorted = [...boundaries].sort((a, b) => a - b)
        const segments: AdaptiveSegment[] = []
        for (let i = 0; i < sorted.length - 1; i++) {
            const u0 = sorted[i]
            const u1 = sorted[i + 1]
            if (u1 - u0 <= Precision.CURVE_PARAM_EPS) continue
            segments.push({
                u0,
                u1,
                p0: curve.pointAt(u0),
                p1: curve.pointAt(u1),
            })
        }
        return segments
    }

    private static refineAdaptiveSegments(curve: Curve2, initialSegments: AdaptiveSegment[], options: DiscretizeOptions) {
        const states = new Map<number, AdaptiveSegment>()
        const heap: HeapItem[] = []
        let nextId = 1

        for (const segment of initialSegments) {
            nextId = this.registerSegment(states, heap, nextId, curve, segment, options)
        }

        for (;;) {
            if (states.size >= this.HARD_MAX_SEGMENTS || nextId >= this.HARD_MAX_REFINEMENT_STEPS) {
                break
            }
            const picked = this.popValidHeapItem(heap, states)
            if (!picked) break

            const segment = states.get(picked.id)
            if (!segment) continue
            const decision = this.evaluateAdaptiveSegment(curve, segment, options)
            if (!decision.split) continue

            MathError.assert(!decision.blocked, '离散溢出: 无法继续细分')

            const mid = (segment.u0 + segment.u1) * 0.5
            MathError.assert(
                Math.abs(mid - segment.u0) > Precision.CURVE_PARAM_EPS
                && Math.abs(segment.u1 - mid) > Precision.CURVE_PARAM_EPS,
                '离散不收敛',
            )

            const pm = curve.pointAt(mid)
            const left: AdaptiveSegment = {
                u0: segment.u0,
                u1: mid,
                p0: segment.p0,
                p1: pm,
            }
            const right: AdaptiveSegment = {
                u0: mid,
                u1: segment.u1,
                p0: pm,
                p1: segment.p1,
            }
            states.delete(picked.id)
            nextId = this.registerSegment(states, heap, nextId, curve, left, options)
            nextId = this.registerSegment(states, heap, nextId, curve, right, options)
        }

        return [...states.values()]
            .sort((a, b) => a.u0 - b.u0 || a.u1 - b.u1)
    }

    private static registerSegment(
        states: Map<number, AdaptiveSegment>,
        heap: HeapItem[],
        nextId: number,
        curve: Curve2,
        segment: AdaptiveSegment,
        options: DiscretizeOptions,
    ): number {
        const id = nextId
        states.set(id, segment)
        const decision = this.evaluateAdaptiveSegment(curve, segment, options)
        if (decision.split) {
            this.pushMaxHeap(heap, { id, score: decision.score })
        }
        return nextId + 1
    }

    private static popValidHeapItem(heap: HeapItem[], states: Map<number, AdaptiveSegment>): HeapItem | undefined {
        for (;;) {
            const candidate = this.popMaxHeap(heap)
            if (!candidate) return undefined
            if (!states.has(candidate.id)) continue
            return candidate
        }
    }

    private static pushMaxHeap(heap: HeapItem[], item: HeapItem): void {
        heap.push(item)
        let i = heap.length - 1
        while (i > 0) {
            const p = (i - 1) >> 1
            if (heap[p].score >= heap[i].score) break
            const tmp = heap[p]
            heap[p] = heap[i]
            heap[i] = tmp
            i = p
        }
    }

    private static popMaxHeap(heap: HeapItem[]): HeapItem | undefined {
        if (heap.length === 0) return undefined
        const top = heap[0]
        const tail = heap.pop()
        if (tail && heap.length > 0) {
            heap[0] = tail
            let i = 0
            for (;;) {
                const l = i * 2 + 1
                const r = l + 1
                let m = i
                if (l < heap.length && heap[l].score > heap[m].score) m = l
                if (r < heap.length && heap[r].score > heap[m].score) m = r
                if (m === i) break
                const tmp = heap[m]
                heap[m] = heap[i]
                heap[i] = tmp
                i = m
            }
        }
        return top
    }

    private static evaluateAdaptiveSegment(curve: Curve2, segment: AdaptiveSegment, options: DiscretizeOptions): SegmentEval {
        const chordLenSq = segment.p0.distanceToSq(segment.p1)
        const midParam = MathUtils.lerp(segment.u0, segment.u1, 0.5)
        const midPoint = curve.pointAt(midParam)
        const approxLength = segment.p0.distanceTo(midPoint) + midPoint.distanceTo(segment.p1)
        if (approxLength <= options.minSegmentLength) {
            return { split: false, blocked: false, score: 0 }
        }
        const useTurn = this.isTurnCriterionRelevant(chordLenSq, options)
        const deviation = this.maxChordDeviationAtFractions(
            curve,
            segment.u0,
            segment.u1,
            segment.p0,
            segment.p1,
        )
        const turn = useTurn ? this.tangentTurnAbs(curve, segment.u0, segment.u1) : 0

        const splitByDeviation = deviation > options.chordTol
        const splitByTurn = useTurn && turn > options.angleTolRad
        const split = splitByDeviation || splitByTurn
        const blocked = split && Math.abs(segment.u1 - segment.u0) <= Precision.CURVE_PARAM_EPS

        const chordTolSafe = Math.max(options.chordTol, Precision.CURVE_LENGTH_EPS)
        const angleTolSafe = Math.max(options.angleTolRad, Precision.ANG_EPS)
        const scoreDeviation = deviation / chordTolSafe
        const scoreTurn = useTurn ? (turn / angleTolSafe) : 0
        const score = Math.max(scoreDeviation, scoreTurn)

        return { split, blocked, score }
    }

    private static isTurnCriterionRelevant(chordLenSq: number, options: DiscretizeOptions): boolean {
        const minChordForTurn = Math.max(options.chordTol * 2, Precision.CURVE_LENGTH_EPS * 10)
        return chordLenSq > minChordForTurn * minChordForTurn
    }

    private static segmentsToSamples(segments: AdaptiveSegment[]) {
        const samples: PolylineSample[] = [{ u: segments[0].u0, p: segments[0].p0 }]
        for (const segment of segments) {
            samples.push({ u: segment.u1, p: segment.p1 })
        }
        return samples
    }

    private static maxChordDeviationAtFractions(
        curve: Curve2,
        u0: number,
        u1: number,
        p0: Vec2,
        p1: Vec2,
        fractions = this.CHORD_CHECK_FRACTIONS,
    ) {
        let maxDeviation = 0
        for (const fraction of fractions) {
            const um = MathUtils.lerp(u0, u1, fraction)
            const pm = curve.pointAt(um)
            const deviation = this.distancePointToSegment(pm, p0, p1)
            if (deviation > maxDeviation) {
                maxDeviation = deviation
            }
        }
        return maxDeviation
    }

    private static distancePointToSegment(point: Vec2, segStart: Vec2, segEnd: Vec2) {
        const edge = segEnd.subtracted(segStart)
        const lenSq = edge.lenSq()
        if (lenSq <= Precision.CURVE_LENGTH_EPS_SQ) {
            return point.distanceTo(segStart)
        }

        const rel = point.subtracted(segStart)
        const t = Math.max(0, Math.min(1, rel.dot(edge) / lenSq))
        const proj = segStart.added(edge.scaled(t))
        return point.distanceTo(proj)
    }

    private static tangentTurnAbs(curve: Curve2, u0: number, u1: number) {
        const t0 = curve.getTangentAt(u0)
        const t1 = curve.getTangentAt(u1)
        if (Math.min(t0.lenSq(), t1.lenSq()) <= Precision.CURVE_NEWTON_EPS) {
            return 0
        }
        return Math.abs(t0.angleTo(t1))
    }

    private static deduplicateAdjacent(samples: PolylineSample[], tol: number) {
        if (samples.length <= 1) return samples
        const deduped: PolylineSample[] = [samples[0]]
        for (let i = 1; i < samples.length; i++) {
            const prev = deduped[deduped.length - 1]
            const cur = samples[i]
            if (prev.p.distanceTo(cur.p) <= tol) continue
            deduped.push(cur)
        }
        return deduped
    }

}
