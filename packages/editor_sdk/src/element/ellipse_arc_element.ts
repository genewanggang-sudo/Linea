import { Arc2, CONST, Coord2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';
import { GCurve2d, GRep, RegisterElement } from '@ccpc/core';

@RegisterElement('d2b4f920-46ab-4d0a-b541-20b4dc8dc067')
export class EllipseArcElement extends CurveElement {
    public center: Vec2 = new Vec2()

    public xDir: Vec2 = Vec2.X()

    public majorRadius = 2

    public minorRadius = 1

    public startAngle = 0

    public endAngle = CONST.PI_2

    public isCCW = true

    public C_Curve: Arc2 | null = null

    private _updateCurve() {
        const coord = new Coord2(this.center, this.xDir)
        this.C_Curve = new Arc2(
            coord,
            this.majorRadius,
            this.minorRadius,
            this.isCCW,
            [this.startAngle, this.endAngle],
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
