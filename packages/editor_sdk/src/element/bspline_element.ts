import { GCurve2d, GRep, RegisterElement } from '@ccpc/core';
import { NurbsCurve2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

@RegisterElement('6b26d106-4962-4440-a21c-b4fa7b1f64e6')
export class BSplineElement extends CurveElement {
    public controlPoints: Vec2[] = []

    public degree = 3

    public knots?: number[]

    public weights?: number[]

    public C_Curve!: NurbsCurve2

    private _updateCurve() {
        this.C_Curve = NurbsCurve2.makeByControlPoints(
            this.controlPoints,
            this.degree,
            this.knots,
            this.weights,
        )
    }

    public markGRepDirty(): void {
        this._updateCurve()
        const grep = new GRep()
        const gcurve = new GCurve2d(this.C_Plane, this.C_Curve)
        grep.addNode(gcurve)
        this.C_GRep = grep
    }
}
