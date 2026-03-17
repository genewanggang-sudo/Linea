import { Arc2, CONST, Coord2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { RegisterElement } from '@ccpc/core';

@RegisterElement('6ff9b462-55d2-48e6-a4c8-0cb9d3643771')
export class EllipseElement extends CurveElement<Arc2> {
    public center: Vec2 = new Vec2()

    public xDir: Vec2 = Vec2.X()

    public majorRadius = 2

    public minorRadius = 1

    protected _updateCurve() {
        const coord = new Coord2(this.center, this.xDir)
        this.C_Curve = new Arc2(
            coord,
            this.majorRadius,
            this.minorRadius,
            true,
            [0, CONST.PI2],
        )
    }
}
