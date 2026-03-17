import { RegisterElement } from '@ccpc/core';
import { Ln2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

@RegisterElement('482e4ebb-11ce-4870-898b-22c3ba8770e7')
export class LineElement extends CurveElement<Ln2> {
    public start: Vec2 = new Vec2()

    public end: Vec2 = new Vec2(1, 0)

    protected _updateCurve() {
        this.C_Curve = new Ln2(this.start, this.end)
    }
}
