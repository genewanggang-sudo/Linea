import { Arc2, CONST, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { GCurve2d, GRep, RegisterElement } from '@ccpc/core';

@RegisterElement('c87b8293-6431-45df-bb1c-dde9a9755552')
export class ArcElement extends CurveElement {
    public center: Vec2 = new Vec2()

    public radius = 1

    public startAngle = 0

    public endAngle = CONST.PI_2

    /**是否逆时针*/
    public isCCW = true

    public C_Curve: Arc2 | null = null

    private _updateCurve() {
        this.C_Curve = Arc2.makeArcByStartEndAngles(
            this.center,
            this.radius,
            this.startAngle,
            this.endAngle,
            this.isCCW,
        )
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
