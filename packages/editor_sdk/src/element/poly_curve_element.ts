import { GPolycurve, GRep, RegisterElement } from '@ccpc/core';
import { PolyCurve, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

@RegisterElement('0c2cc5f4-cc96-4d4d-8599-7a07a97b2bef')
export class PolyCurveElement extends CurveElement {
    public points: Vec2[] = []

    public C_Curve!: PolyCurve

    private _updateCurve() {
        this.C_Curve = new PolyCurve(this.points)
    }

    public markGRepDirty(): void {
        this._updateCurve()
        const grep = new GRep()
        const gpolycurve = new GPolycurve(this.C_Plane, this.C_Curve)
        grep.addNode(gpolycurve)
        this.C_GRep = grep
    }
}
