import type { Curve2 } from '../../curves/curve2'
import { MathError } from '../../utils/math_error'
import type { CurveKind } from './pair'

export function getCurveKind(curve: Curve2): CurveKind {
    if (curve.isLine()) return 'line'
    if (curve.isCircle()) return 'circle'
    if (curve.isArc()) return 'arc'
    if (curve.isEllipse()) return 'ellipse'
    if (curve.isEllipseArc()) return 'ellipseArc'
    if (curve.isBSpline()) return 'bspline'
    MathError.throw(`CurveX: unsupported curve type ${curve.getType()}`)
}

