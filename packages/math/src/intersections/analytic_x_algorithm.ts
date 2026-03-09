import type { Curve2 } from '../curves/curve2'
import { MathError } from '../utils/math_error'
import type { ICurvePairIntersector } from './intersector'
import { getCurveKind } from './internal/kind'
import { normalizePair, type PairKey } from './internal/pair'
import { analyzeCurveXInfosQuality, postprocessCurveXInfos, swapCurveXInfos, type CurveXQuality } from './internal/result'
import { makeIntersectionTolerance } from './internal/tolerance'
import {
    ArcArcPairSolver,
    ArcEllipseArcPairSolver,
    ArcEllipsePairSolver,
    CircleArcPairSolver,
    CircleCirclePairSolver,
    CircleEllipseArcPairSolver,
    CircleEllipsePairSolver,
    EllipseArcEllipseArcPairSolver,
    EllipseEllipseArcPairSolver,
    EllipseEllipsePairSolver,
    LineArcPairSolver,
    LineCirclePairSolver,
    LineEllipseArcPairSolver,
    LineEllipsePairSolver,
    LineLinePairSolver,
} from './solvers/pair_solvers'
import { PolylinePairIntersector } from './solvers/polyline_pair_intersector'
import type { CurveXInfo } from './types'

export class AnalyticXAlgorithm {
    private readonly map: Partial<Record<PairKey, ICurvePairIntersector>> = {
        'line|line': new LineLinePairSolver(),
        'line|circle': new LineCirclePairSolver(),
        'line|arc': new LineArcPairSolver(),
        'line|ellipse': new LineEllipsePairSolver(),
        'line|ellipseArc': new LineEllipseArcPairSolver(),

        'circle|circle': new CircleCirclePairSolver(),
        'circle|arc': new CircleArcPairSolver(),
        'circle|ellipse': new CircleEllipsePairSolver(),
        'circle|ellipseArc': new CircleEllipseArcPairSolver(),

        'arc|arc': new ArcArcPairSolver(),
        'arc|ellipse': new ArcEllipsePairSolver(),
        'arc|ellipseArc': new ArcEllipseArcPairSolver(),

        'ellipse|ellipse': new EllipseEllipsePairSolver(),
        'ellipse|ellipseArc': new EllipseEllipseArcPairSolver(),

        'ellipseArc|ellipseArc': new EllipseArcEllipseArcPairSolver(),
    }

    private readonly retryMap: Partial<Record<PairKey, ICurvePairIntersector>> = {
        'circle|ellipse': new PolylinePairIntersector(320, 96),
        'circle|ellipseArc': new PolylinePairIntersector(320, 96),
        'arc|ellipse': new PolylinePairIntersector(320, 96),
        'arc|ellipseArc': new PolylinePairIntersector(320, 96),
        'ellipse|ellipse': new PolylinePairIntersector(352, 96),
        'ellipse|ellipseArc': new PolylinePairIntersector(352, 96),
        'ellipseArc|ellipseArc': new PolylinePairIntersector(352, 96),
    }

    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const k1 = getCurveKind(c1)
        const k2 = getCurveKind(c2)
        const pair = normalizePair(k1, k2)
        const solver = this.map[pair.key]
        if (!solver) {
            MathError.throw(`AnalyticXAlgorithm: unsupported pair ${c1.getType()}|${c2.getType()}`)
        }

        const tol = makeIntersectionTolerance(c1, c2)
        const diagBefore = PolylinePairIntersector.getDiagnostics()
        const raw = pair.swapped ? solver.intersect(c2, c1) : solver.intersect(c1, c2)
        const ordered = pair.swapped ? swapCurveXInfos(raw) : raw
        const primary = postprocessCurveXInfos(ordered, tol.pointTol)
        const quality = analyzeCurveXInfosQuality(ordered, tol.pointTol)
        if (!this.shouldRetry(pair.key, c1, c2, quality, diagBefore, PolylinePairIntersector.getDiagnostics())) {
            return primary
        }

        const retrySolver = this.retryMap[pair.key]
        if (!retrySolver) return primary
        const retryRaw = pair.swapped ? retrySolver.intersect(c2, c1) : retrySolver.intersect(c1, c2)
        if (retryRaw.length === 0) return primary
        const retryOrdered = pair.swapped ? swapCurveXInfos(retryRaw) : retryRaw
        return postprocessCurveXInfos([...ordered, ...retryOrdered], tol.pointTol)
    }

    private shouldRetry(
        key: PairKey,
        c1: Curve2,
        c2: Curve2,
        quality: CurveXQuality,
        before: ReturnType<typeof PolylinePairIntersector.getDiagnostics>,
        after: ReturnType<typeof PolylinePairIntersector.getDiagnostics>,
    ) {
        if (!this.retryMap[key]) return false
        if (!this.boxesLikelyIntersect(c1, c2)) return false
        if (quality.rawCount === 0) return true
        if (quality.duplicatePointCount > 0) return true

        const certificationMissDelta = after.certificationMissCount - before.certificationMissCount
        const refineFailDelta = after.refineFailureCount - before.refineFailureCount
        const rejectDelta = after.certificationRejectCount - before.certificationRejectCount
        return certificationMissDelta > 0 || refineFailDelta > 0 || rejectDelta > 0
    }

    private boxesLikelyIntersect(c1: Curve2, c2: Curve2) {
        const t = makeIntersectionTolerance(c1, c2)
        const b1 = c1.getBBox().expandByScalar(t.pointTol * 2)
        const b2 = c2.getBBox().expandByScalar(t.pointTol * 2)
        return b1.intersects(b2)
    }
}
