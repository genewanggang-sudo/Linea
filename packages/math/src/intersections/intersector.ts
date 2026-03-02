import type { Curve2 } from '../curves/curve2'
import type { CurveXInfo } from './types'

export interface ICurvePairIntersector {
    intersect(c1: Curve2, c2: Curve2): CurveXInfo[]
}

