import type { Curve2 } from '../curves/curve2'
import { MathError } from '../utils/math_error'
import type { ICurvePairIntersector } from './intersector'
import { getCurveKind } from './internal/kind'
import { normalizePair, type PairKey } from './internal/pair'
import { analyzeCurveXInfosQuality, postprocessCurveXInfos, swapCurveXInfos, type CurveXQuality } from './internal/result'
import { makeIntersectionTolerance } from './internal/tolerance'
import {
    ArcBSplinePairSolver,
    BSplineBSplinePairSolver,
    CircleBSplinePairSolver,
    EllipseArcBSplinePairSolver,
    EllipseBSplinePairSolver,
    LineBSplinePairSolver,
} from './solvers/pair_solvers'
import { PolylinePairIntersector } from './solvers/polyline_pair_intersector'
import type { CurveXInfo } from './types'

export class NumericXAlgorithm {
    private readonly map: Partial<Record<PairKey, ICurvePairIntersector>> = {
        'line|bspline': new LineBSplinePairSolver(),
        'circle|bspline': new CircleBSplinePairSolver(),
        'arc|bspline': new ArcBSplinePairSolver(),
        'ellipse|bspline': new EllipseBSplinePairSolver(),
        'ellipseArc|bspline': new EllipseArcBSplinePairSolver(),
        'bspline|bspline': new BSplineBSplinePairSolver(),
    }

    private readonly retryMap: Partial<Record<PairKey, ICurvePairIntersector>> = {
        'line|bspline': new PolylinePairIntersector(640, 96),
        'circle|bspline': new PolylinePairIntersector(640, 96),
        'arc|bspline': new PolylinePairIntersector(640, 96),
        'ellipse|bspline': new PolylinePairIntersector(704, 96),
        'ellipseArc|bspline': new PolylinePairIntersector(704, 96),
        'bspline|bspline': new PolylinePairIntersector(768, 96),
    }

    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const k1 = getCurveKind(c1)
        const k2 = getCurveKind(c2)
        const pair = normalizePair(k1, k2)
        const solver = this.map[pair.key]
        if (!solver) {
            MathError.throw(`NumericXAlgorithm: unsupported pair ${c1.getType()}|${c2.getType()}`)
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
        const b1 = c1.boundingBox().expandByScalar(t.pointTol * 2)
        const b2 = c2.boundingBox().expandByScalar(t.pointTol * 2)
        return b1.intersects(b2)
    }
}
