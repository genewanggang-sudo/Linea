import { RegisterElement } from '@ccpc/core';
import { Loop, Vec2 } from '@ccpc/math';
import { PolyCurveElement } from './poly_curve_element';

@RegisterElement('c4228ece-e566-48a7-b219-80219a14545b')
export class RectLineElement extends PolyCurveElement<Loop> {
    public start: Vec2 = new Vec2()

    public end: Vec2 = new Vec2()

    protected _updateCurve(): void {
        this.C_Curve = Loop.createByRectangle(this.start, this.end)
    }
}
