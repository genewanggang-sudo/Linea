import { RegisterElement } from '@ccpc/core';
import { NurbsCurve2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

@RegisterElement('6b26d106-4962-4440-a21c-b4fa7b1f64e6')
export class BSplineElement extends CurveElement<NurbsCurve2> {
    public controlPoints: Vec2[] = []

    public degree = 3

    public knots?: number[]

    public weights?: number[]

    protected _updateCurve() {
        this.C_Curve = NurbsCurve2.makeByControlPoints(
            this.controlPoints,
            this.degree,
            this.knots,
            this.weights,
        )
    }
}
