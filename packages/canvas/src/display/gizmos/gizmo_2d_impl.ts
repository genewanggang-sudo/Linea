import { IDisplayContext } from '../display_object_impl';
import { Gizmos2d } from './gizmo_2d';
import { GizmoBaseImpl } from './gizmo_base_impl';

/**
 * 辅助体2d实现类
 */
export abstract class Gizmo2dImpl<T extends Gizmos2d> extends GizmoBaseImpl<T> {
    /**1屏幕像素对多少世界大小*/
    protected _scale2dFactor = 1

    public get scale2dFactor(): number {
        return this._scale2dFactor;
    }

    public init(display: T, context: IDisplayContext): void {
        this._resetScale2dFactor(display, context);
        super.init(display, context);
        context.cCanvas.renderer.signalCameraChanged.listen(this._onCamera2dChange)
    }

    /**
     * 2d相机变更回调
     */
    protected _onCamera2dChange = () => {
        if (this._display.usePixel && this._resetScale2dFactor(this._display, this._context)) {
            this.dirty()
        }
    }

    /**
     * 重置2d缩放因子
     */
    private _resetScale2dFactor(_display: T, context: IDisplayContext) {
        const scale = 1 / context.cCanvas.pixelsPerUnit()
        const change = this._scale2dFactor !== scale
        this._scale2dFactor = scale
        return change
    }

    public dispose(): void {
        super.dispose()
        this._context.cCanvas.renderer.signalCameraChanged.unlisten(this._onCamera2dChange)
    }
}
