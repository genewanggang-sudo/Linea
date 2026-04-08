import { DisplayObject } from './display_object';
import { IDisplayObjectImplMgr } from './i_display_object_impl_mgr';

/**
 * 辅助体管理类
 */
export class DisplayObjectMgr {
    /** 显示对象集合 */
    private _displayMap: Map<number, DisplayObject>;

    /** 单例实例 */
    private static _instance: DisplayObjectMgr;

    private _impl!: IDisplayObjectImplMgr;

    constructor() {
        this._displayMap = new Map();
    }

    /**
     * 单例
     * @returns 实例
     */
    public static instance(): DisplayObjectMgr {
        if (!this._instance) {
            this._instance = new DisplayObjectMgr();
        }
        return this._instance;
    }

    public setImpl(impl: IDisplayObjectImplMgr): void {
        this._impl = impl;
    }

    /**
     * 添加显示对象
     * @param display
     */
    public addDisplay(display: DisplayObject, updateView = false): void {
        const { id } = display;
        this._displayMap.set(id, display);
        this._impl.addDisplay(display, updateView);
    }

    /**
     * 获取显示对象
     * @param id
     * @returns
     */
    public getDisplay<T extends DisplayObject = DisplayObject>(id: number): T | undefined {
        return this._displayMap.get(id) as T | undefined;
    }

    /**
     * 移除显示对象
     * @param display
     * @returns
     */
    public removeDisplay(display: DisplayObject): boolean {
        return this.removeDisplayById(display.id);
    }

    /**
     * 根据id移除显示对象
     * @param id
     * @returns
     */
    public removeDisplayById(id: number): boolean {
        const display = this._displayMap.get(id);
        let removed = false;
        if (display) {
            this._displayMap.delete(id);
            display.dispose();
            removed = true;
        }
        this._impl.removeDisplayById(id);
        return removed;
    }

    /**
     * 清空显示对象
     */
    public clearDisplay(): void {
        this._displayMap.forEach(value => {
            this.removeDisplay(value);
        });
    }

}
