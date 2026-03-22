import { CCanvas } from '@ccpc/canvas';
import { GNode } from '@ccpc/core';
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
        const gNodes: Array<GNode> = []
        const pickResult = ccanvas.pick(screenPos.x, screenPos.y)
        // TODO 过滤、排序等逻辑
    }
}
