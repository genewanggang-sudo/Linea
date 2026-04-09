import { GizmosBase, IGizmoBaseStyle } from './gizmo_base';

export type IGizmo2dStyle = IGizmoBaseStyle

export abstract class Gizmos2d extends GizmosBase {
    /** 使用像素单位,缩放画面gizmos保持显示大小不变 */
    public usePixel: boolean = true;

    constructor() {
        super()
    }
}
