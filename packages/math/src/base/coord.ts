import { GeoElement } from './geo_element';
import { Vec } from './vec';



/**
 * 坐标系
 */
export abstract class Coord<VectorType extends Vec> extends GeoElement {
    constructor() {
        super();
    }

    public abstract getDx(): VectorType;

    public abstract getDy(): VectorType;
}