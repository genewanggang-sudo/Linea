import { RegisterElement } from '@ccpc/core';
import { PolyCurve, Vec2 } from '@ccpc/math';
import { PolyCurveElement } from './poly_curve_element';

@RegisterElement('6a3d2ef1-9117-4cf9-a30a-72a5600cc6ce')
export class PolyLineElement extends PolyCurveElement<PolyCurve> {
    public points: Vec2[] = []

    protected _updateCurve(): void {
        this.C_Curve = new PolyCurve(this.points)
    }
}
