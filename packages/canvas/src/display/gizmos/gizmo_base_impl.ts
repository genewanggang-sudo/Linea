import { GNode, GRep } from '@ccpc/core';
import { DisplayObjectImpl } from '../display_object_impl';
import { GizmosBase, IGizmoBaseStyle } from './gizmo_base';

export abstract class GizmoBaseImpl<T extends GizmosBase> extends DisplayObjectImpl<T> {

    /**
     * 获取显示样式
     */
    protected get _displayStyle(): IGizmoBaseStyle {
        const style: IGizmoBaseStyle = {
            opacity: 1,
        }
        if (this._display.style) {
            Object.assign(style, this._display.style)
        }
        return style
    }

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
