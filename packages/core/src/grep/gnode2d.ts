import { Curve2, Plane, Vec2 } from '@ccpc/math';
import { GNode } from './gnode';

export abstract class GNode2d extends GNode {
    public plane: Plane;

    public geo: Vec2 | Curve2;

    constructor(plane: Plane, geo: Vec2 | Curve2) {
        super();
        this.plane = plane.clone();
        this.geo = geo;
    }

    public abstract clone(): GNode2d;
}
