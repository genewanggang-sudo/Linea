import { GPolycurve, GRep } from '@ccpc/core';
import { PolyCurve } from '@ccpc/math';
import { PlaneCurveElement } from './plane_curve_element';

/**
 * 曲线序列
 */
export abstract class PolyCurveElement<T extends PolyCurve> extends PlaneCurveElement<T> {

    public markGRepDirty(): void {
        this._updateCurve()
        if (!this.C_Curve) {
            this.C_GRep = GRep.empty
            return
        }
        const grep = new GRep()
        const gpolycurve = new GPolycurve(this.plane, this.C_Curve)
        grep.addNode(gpolycurve)
        this.C_GRep = grep
    }
}
