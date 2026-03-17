import { GCurve2d, GRep, RegisterElement } from '@ccpc/core';
import { Ln2, Vec2 } from '@ccpc/math';
import { CurveElement } from './curve_element';

/**
 * 直线
 */
@RegisterElement('482e4ebb-11ce-4870-898b-22c3ba8770e7')
export class LineElement extends CurveElement {
    public start: Vec2 = new Vec2()

    public end: Vec2 = new Vec2()

    // TODO curve放基类?
    public C_Curve: Ln2 | null = null

    private _updateCurve() {
        this.C_Curve = new Ln2(this.start, this.end)
    }

    public markGRepDirty(): void {
        this._updateCurve()
        if (!this.C_Curve) return
        const grep = new GRep()
        const gCurve = new GCurve2d(this.C_Plane, this.C_Curve)
        grep.addNode(gCurve)
        this.C_GRep = grep
    }
}
