import { GizmosBase } from './gizmo_base';

export abstract class Gizmos2d extends GizmosBase {
    /** 使用像素单位,缩放画面gizmos保持显示大小不变 */
    public usePixel: boolean = true;

    constructor() {
        super()
    }
}
