import { Element } from '@ccpc/core';
import { Coord3, Curve2, Plane, PolyCurve } from '@ccpc/math';

/**
 * 平面曲线基类
 */
export abstract class PlaneCurveElement<T extends (Curve2 | PolyCurve)> extends Element {
    protected C_Curve: T | null = null

    private C_Plane = new Plane(new Coord3())

    public get plane() {
        return this.C_Plane
    }

    public get curve() {
        return this.C_Curve
    }

    /**
     * 更新曲线
     */
    protected abstract _updateCurve(): void
}
