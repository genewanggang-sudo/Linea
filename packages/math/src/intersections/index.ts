import type { Curve2 } from '../curves/curve2'
import { CurveXEngine } from './curve_x_engine'
import { intersectBSplineSelf } from './solvers/bspline_self_solver'

export type { CurveXInfo } from './types'

const curveXEngine = new CurveXEngine()

export function intersectCurveCurve(c1: Curve2, c2: Curve2) {
    return curveXEngine.intersect(c1, c2)
}

export function intersectCurveSelf(curve: Curve2) {
    if (!curve.isBSpline()) return []
    return intersectBSplineSelf(curve)
}
