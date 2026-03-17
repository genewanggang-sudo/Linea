import { Arc2, CONST, Coord2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { RegisterElement } from '@ccpc/core';

@RegisterElement('d2b4f920-46ab-4d0a-b541-20b4dc8dc067')
export class EllipseArcElement extends CurveElement<Arc2> {
    public center: Vec2 = new Vec2()

    public xDir: Vec2 = Vec2.X()

    public majorRadius = 2

    public minorRadius = 1

    public startAngle = 0

    public endAngle = CONST.PI_2

    public isCCW = true

    protected _updateCurve() {
        const coord = new Coord2(this.center, this.xDir)
        this.C_Curve = new Arc2(
            coord,
            this.majorRadius,
            this.minorRadius,
            this.isCCW,
            [this.startAngle, this.endAngle],
        )
    }
}
