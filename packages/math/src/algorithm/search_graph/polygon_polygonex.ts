import type { Loop } from '../../topology/loop';
import { Polygon } from '../../topology/polygon';
import { ILoopsToPolygonExes } from './iloops_polygonex';



/**
 * Polygon变成PolygonEx
 */
export class PolygonToPolygonExes {
    /**
     * 根据Polygon内部环的嵌套包含关系，将Polygon拆分成polygonEx
     * 条件：Polygon环之间不相交
     * @param polygon
     * @returns polygon[]
     */
    public static execute(polygon: Polygon): Polygon[] {
        return ILoopsToPolygonExes.execute<Loop>(polygon.getLoops(), false).map(loops => new Polygon(loops));
    }
}