import type { Curve2 } from '../curves/curve2'
import { CurveXEngine } from './curve_x_engine'

export type { CurveXInfo } from './types'

const curveXEngine = new CurveXEngine()

export function intersectCurveCurve(c1: Curve2, c2: Curve2) {
    return curveXEngine.intersect(c1, c2)
}

