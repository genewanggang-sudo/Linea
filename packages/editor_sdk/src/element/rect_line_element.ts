import { GPolycurve, GRep, RegisterElement } from '@ccpc/core';
import { Loop, PolyCurve, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

@RegisterElement('6693af62-a429-40ca-b019-55a4f8c0ab25')
export class RectLineElement extends CurveElement {
    public start: Vec2 = new Vec2()

    public end: Vec2 = new Vec2()

    public C_Curve!: PolyCurve

    private _updateCurve() {
        this.C_Curve = Loop.createByRectangle(this.start, this.end)
    }

    public markGRepDirty(): void {
        this._updateCurve()
        const grep = new GRep()
        const gpolycurve = new GPolycurve(this.C_Plane, this.C_Curve)
        grep.addNode(gpolycurve)
        this.C_GRep = grep
    }
}
