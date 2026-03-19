import { Curve2, Plane, PolyCurve, Polygon, Vec2 } from '@ccpc/math';
import { GNode } from './gnode';

export abstract class GNode2d extends GNode {
    public plane: Plane;

    public geo: Vec2 | Curve2 | Polygon | PolyCurve;

    constructor(plane: Plane, geo: Vec2 | Curve2 | Polygon | PolyCurve) {
        super();
        this.plane = plane.clone();
        this.geo = geo;
    }

    public abstract clone(): GNode2d;

    protected _copyFrom(another: GNode2d): this {
        super._copyFrom(another)
        return this
    }
}
