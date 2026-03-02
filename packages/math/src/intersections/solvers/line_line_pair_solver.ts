import { Interval } from '../../curves/interval'
import type { Curve2 } from '../../curves/curve2'
import { MathError } from '../../utils/math_error'
import { Precision } from '../../utils/precision'
import type { ICurvePairIntersector } from '../intersector'
import { intersectSegments, makeSegment, pointAtSegmentUnit } from '../internal/segment'
import type { CurveXInfo } from '../types'

export class LineLinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        MathError.assert(c1.isLine() && c2.isLine(), 'LineLinePairSolver: input curves must both be Line2')
        const l1 = c1
        const l2 = c2

        const s1 = makeSegment(l1.start, l1.end)
        const s2 = makeSegment(l2.start, l2.end)
        MathError.assert(
            s1.len > Precision.CURVE_LENGTH_EPS && s2.len > Precision.CURVE_LENGTH_EPS,
            'LineLinePairSolver: degenerate line segment',
        )

        const hit = intersectSegments(s1, s2)
        if (hit.kind === 'none') return []

        if (hit.kind === 'point') {
            const point = pointAtSegmentUnit(s1, hit.t1)
            return [{
                point,
                u1: hit.t1 * s1.len,
                u2: hit.t2 * s2.len,
                isOverlap: false,
            }]
        }

        const point = pointAtSegmentUnit(s1, hit.t1s)
        return [{
            point,
            u1: hit.t1s * s1.len,
            u2: hit.t2s * s2.len,
            isOverlap: true,
            range1: new Interval(hit.t1s * s1.len, hit.t1e * s1.len),
            range2: new Interval(hit.t2s * s2.len, hit.t2e * s2.len),
        }]
    }
}
