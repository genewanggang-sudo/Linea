import type { Curve2 } from '../curves/curve2'
import { MathError } from '../utils/math_error'
import { AnalyticXAlgorithm } from './analytic_x_algorithm'
import { NumericXAlgorithm } from './numeric_x_algorithm'
import type { CurveXInfo } from './types'

export class CurveXEngine {
    private readonly analytic = new AnalyticXAlgorithm()
    private readonly numeric = new NumericXAlgorithm()

    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        if (this.shouldUseNumeric(c1, c2)) {
            return this.numeric.intersect(c1, c2)
        }

        try {
            return this.analytic.intersect(c1, c2)
        } catch (error) {
            if (
                error instanceof MathError &&
                error.message.startsWith('AnalyticXAlgorithm: unsupported pair')
            ) {
                return this.numeric.intersect(c1, c2)
            }
            throw error
        }
    }

    private shouldUseNumeric(c1: Curve2, c2: Curve2) {
        return c1.isBSpline() || c2.isBSpline()
    }
}
