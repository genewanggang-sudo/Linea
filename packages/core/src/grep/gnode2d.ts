import { Curve2, Plane, Polygon, Vec2 } from '@ccpc/math';
import { GNode } from './gnode';

export abstract class GNode2d extends GNode {
    public plane: Plane;

    public geo: Vec2 | Curve2 | Polygon;

    constructor(plane: Plane, geo: Vec2 | Curve2 | Polygon) {
        super();
        this.plane = plane.clone();
        this.geo = geo;
    }

    public abstract clone(): GNode2d;

    protected _copy(another: GNode2d): this {
        super._copy(another)
        return this
    }
}
