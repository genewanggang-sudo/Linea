import { CCanvas } from '@ccpc/canvas';
import { GCurve2d, GNode, GPoint2d, GPolycurve, GPolygon, GText2d } from '@ccpc/core';
import { Vec2 } from '@ccpc/math';

export class PickUtil {
    /**
     * 返回pick结果,是否从场景中拾取[gnode]
     */
    // TODO 考虑容差
    public static pickGNode(ccanvas: CCanvas, screenPos: Vec2) {
        this.pickGNodes(ccanvas, screenPos)
    }

    public static pickGNodes(ccanvas: CCanvas, screenPos: Vec2) {
        const gNodes = ccanvas.pick(screenPos.x, screenPos.y)
        if (!gNodes.length) return []
        const nodeValueCache = new Map<GNode, number>();
        gNodes.forEach(node => {
            nodeValueCache.set(node, this._getPickPriority(node));
        });
        // 优先选择点
        gNodes.sort((a, b) => {
            return (nodeValueCache.get(a) || 100) - (nodeValueCache.get(b) || 100);
        });

        return gNodes
    }

    private static _getPickPriority(gnode: GNode) {
        if (gnode instanceof GPoint2d) {
            return 0
        }
        if (gnode instanceof GCurve2d || gnode instanceof GPolycurve) {
            return 1
        }
        if (gnode instanceof GPolygon) {
            return 2
        }
        if (gnode instanceof GText2d) {
            return 3
        }
        return 100
    }
}
