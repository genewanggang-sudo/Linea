import { DisplayObject, dirtyProp } from '@ccpc/core';

export type IGizmoBaseStyle = {
    opacity?: number
}

/**
 * 辅助体基类
 */
export abstract class GizmosBase extends DisplayObject {
    /**
     * 显示样式
     */
    @dirtyProp()
    public style?: IGizmoBaseStyle

    /**
     * 拖拽容差,默认1px
     */
    public dragTolerance = 1

    /**
     * 追加设置样式
     */
    public applyStyle<T extends IGizmoBaseStyle>(style: T) {
        if (this.style) {
            Object.assign(this.style, style)
        } else {
            this.style = style
        }
    }

    public dispose(): void {
        super.dispose()
        this.style = undefined
    }

}
