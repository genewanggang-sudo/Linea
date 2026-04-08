import { DisplayObject } from './display_object';

export interface IDisplayObjectImplMgr {
    /**
     * 注册一个display到渲染层,可选刷新视图
     */
    addDisplay(display: DisplayObject, updateView?: boolean): void

    /**
     * 根据id移除display
     */
    removeDisplayById(id: number): boolean
}
