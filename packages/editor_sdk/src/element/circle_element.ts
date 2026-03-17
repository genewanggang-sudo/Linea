import { Arc2, CONST, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { GCurve2d, GRep, RegisterElement } from '@ccpc/core';

@RegisterElement('bcd783fb-7cca-465c-930e-3dc1b1af634b')
export class CircleElement extends CurveElement {
    public center: Vec2 = new Vec2()

    public radius = 1

    public C_Curve: Arc2 | null = null

    private _updateCurve() {
        this.C_Curve = Arc2.makeArcByStartEndAngles(this.center, this.radius, 0, CONST.PI2, true)
    }

    public markGRepDirty(): void {
        this._updateCurve()
        if (!this.C_Curve) {
            this.setGRep(GRep.empty)
            return
        }
        const grep = new GRep()
        const gcurve = new GCurve2d(this.C_Plane, this.C_Curve)
        grep.addNode(gcurve)
        this.C_GRep = grep
    }
}
