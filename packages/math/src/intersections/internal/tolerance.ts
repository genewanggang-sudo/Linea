import type { Curve2 } from '../../curves/curve2'
import { Precision } from '../../utils/precision'

export type IntersectionTolerance = {
    pointTol: number
    paramTol: number
    seedParamTol: number
    overlapPointTol: number
}

export function makeIntersectionTolerance(c1: Curve2, c2: Curve2): IntersectionTolerance {
    const b1 = c1.boundingBox()
    const b2 = c2.boundingBox()
    const diag = Math.hypot(
        Math.max(b1.maxX, b2.maxX) - Math.min(b1.minX, b2.minX),
        Math.max(b1.maxY, b2.maxY) - Math.min(b1.minY, b2.minY),
    )
    const scaleTol = (Number.isFinite(diag) && diag > 0) ? diag * 1e-7 : 0
    const pointTol = Math.max(Precision.CURVE_LENGTH_EPS * 8, scaleTol)
    return {
        pointTol,
        paramTol: Precision.CURVE_PARAM_EPS * 8,
        seedParamTol: Precision.CURVE_PARAM_EPS * 8,
        overlapPointTol: pointTol * 2.5,
    }
}

export function curvePointTolerance(curve: Curve2) {
    const box = curve.boundingBox()
    const diag = Math.hypot(box.width(), box.height())
    const scaleTol = (Number.isFinite(diag) && diag > 0) ? diag * 1e-9 : 0
    return Math.max(Precision.CURVE_LENGTH_EPS * 8, scaleTol)
}

