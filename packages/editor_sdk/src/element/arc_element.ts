import { Arc2, CONST, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { RegisterElement } from '@ccpc/core';

@RegisterElement('c87b8293-6431-45df-bb1c-dde9a9755552')
export class ArcElement extends CurveElement<Arc2> {
    public center: Vec2 = new Vec2()

    public radius = 1

    public startAngle = 0

    public endAngle = CONST.PI_2

    /**是否逆时针*/
    public isCCW = true

    protected _updateCurve() {
        this.C_Curve = Arc2.makeArcByStartEndAngles(
            this.center,
            this.radius,
            this.startAngle,
            this.endAngle,
            this.isCCW,
        )
    }
}
