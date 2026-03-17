import { Arc2, CONST, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { RegisterElement } from '@ccpc/core';

@RegisterElement('bcd783fb-7cca-465c-930e-3dc1b1af634b')
export class CircleElement extends CurveElement<Arc2> {
    public center: Vec2 = new Vec2()

    public radius = 1

    protected _updateCurve() {
        this.C_Curve = Arc2.makeArcByStartEndAngles(this.center, this.radius, 0, CONST.PI2, true)
    }
}
