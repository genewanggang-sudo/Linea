import { GNode, GRep } from '@ccpc/core';
import { DisplayObjectImpl } from '../display_object_impl';
import { GizmosBase } from './gizmo_base';

export abstract class GizmoBaseImpl<T extends GizmosBase> extends DisplayObjectImpl<T> {
    /** 层级 */
    public setPick(node: GNode, canPick: boolean): void {
        node.canPick = canPick
    }

    /** 创建一个指定了渲染层级的 grep */
    public createGrep(): GRep {
        const grep = new GRep();
        // 默认渲染层级
        // TODO 补充GRep层的渲染层级
        // grep.grepRenderArea = EN_RENDER_AREA.OVERLAY;
        return grep;
    }

}
