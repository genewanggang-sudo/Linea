/* eslint-disable no-console */
import { LoopsToLoopTreeSearchGraph } from './search_graph/loops_to_loop_tree_search_graph';
import { SearchSimpleLoop } from './search_graph/search_polyline';
import { ILoopsToPolygonExes } from './search_graph/iloops_polygonex';
import { Curve2 } from '../geometry/curve2';
import { Polygon } from '../topology/polygon';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Loop } from '../topology/loop';
import { PolyCurve } from '../topology/polycurve';
import { SearchLoop2D } from './search_graph/search_loop2d';
import { PolygonToPolygonExes } from './search_graph/polygon_polygonex';
import { Tol } from '../base/tol';



/**
 * 搜索算法：搜环，搜polygon，搜洞
 */
class SearchGraph {
    /**
     * 从一堆有向的曲线中搜索环
     * @param curves
     * @param bMin true则找到最小环，false则找到最大环
     * @param distanceTol
     */
    public static searchLoop2D(curves: Curve2[], bMin: boolean, distanceTol = Tol.LENGTH): Loop[] {
        return SearchLoop2D.execute(curves, bMin, distanceTol);
    }

    /**
     * 搜索简单环
     * 假设输入的曲线中，每个连接点处，最多只有两个曲线
     * @param curves
     * @param polygon
     */
    public static simpleLoop(curves: Curve2[], tolerance = Tol.LENGTH): (PolyCurve | Loop)[] {
        return SearchSimpleLoop.execute(curves, tolerance);
    }

    /**
     * 输入一堆线，按包含关系搜索出合法polygon
     * 假设输入的曲线中，每个连接点处，最多只有两个曲线
     * @param curves
     * @param polygon
     */
    public static simplePolygon(curves: Curve2[], tolerance = Tol.LENGTH): Polygon | undefined {
        const loops = SearchGraph.simpleLoop(curves, tolerance);
        if (!loops.length) {
            return undefined;
        }
        for (const loop of loops) {
            if (!(loop.getType() === EN_GEO_TYPE.LOOP)) {
                console.error('不是合法的polygon');
                return undefined;
            }
        }

        const tree = LoopsToLoopTreeSearchGraph.execute(loops as Loop[]);
        tree.makeValid(true);
        const tloops: Loop[] = [];
        tree.collectLoops(tloops);
        return new Polygon(tloops);
    }

    /**
     * 根据包含关系，将loop[]，组成polygonEx
     * 条件：环之间不相交
     * @param loops
     * @returns polygon[]
     */
    public static loopsToPolygonExes(loops: Loop[]): Polygon[] {
        return ILoopsToPolygonExes.execute<Loop>(loops, true).map(ls => {
            const polygon = new Polygon();
            ls.forEach(l => polygon.addLoop(l, false));
            return polygon;
        });
    }

    /**
     * 根据包含关系，将polygon，组成polygonEx
     * 条件：Polygon环之间不相交
     * @param polygon
     * @returns polygon[]
     */
    public static polygonToPolygonExes(polygon: Polygon): Polygon[] {
        if (polygon.getLoops().length < 2) {
            return [polygon];
        }
        return PolygonToPolygonExes.execute(polygon);
    }
}

export { SearchGraph };