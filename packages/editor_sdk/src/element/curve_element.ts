import { Element } from '@ccpc/core';
import { Coord3, Plane } from '@ccpc/math';

/**
 * 曲线基类
 */
export class CurveElement extends Element {
    public C_Plane = new Plane(new Coord3())
}
