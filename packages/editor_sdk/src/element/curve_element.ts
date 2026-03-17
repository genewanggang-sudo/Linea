import { Curve2 } from '@ccpc/math';
import { PlaneCurveElement } from './plane_curve_element';
import { GCurve2d, GRep } from '@ccpc/core';

export abstract class CurveElement<T extends Curve2> extends PlaneCurveElement<T> {

    public markGRepDirty(): void {
        this._updateCurve()
        if (!this.C_Curve) return
        const grep = new GRep()
        const gCurve = new GCurve2d(this.plane, this.C_Curve)
        grep.addNode(gCurve)
        this.C_GRep = grep
    }
}
