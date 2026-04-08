import { DisplayObject, DisplayObjectMgr, IConstructor, IDisplayObjectImplMgr, IDisplayRenderData } from '@ccpc/core';
import { IProcessEvent } from '../controller/i_process_event';
import { DisplayObjectImpl } from './display_object_impl';
import { CRenderer } from '../render/c_renderer';
import { CCanvas } from '../canvas/c_canvas';
import { IKeyboardEvent, IMouseEvent } from '../types/type_define';

export interface IMgrDisplayRenderData extends IDisplayRenderData {
    id: number;
}

/**
 * 辅助体管理类
 */
export class DisplayObjectImplMgr implements IProcessEvent, IDisplayObjectImplMgr {
    /** 显示对象实现集合 */
    private _displayImplMap: Map<number, DisplayObjectImpl<DisplayObject>>;
    /** 移除Set */
    private _displayRemovedSet: Set<number> = new Set();
    /** 实现注册集合 */
    private _registerMap: Map<IConstructor<DisplayObject>, new () => DisplayObjectImpl<DisplayObject>>;
    /** 单例实例 */
    private static _instance: DisplayObjectImplMgr;
    /** 渲染器 */
    private _render!: CRenderer;
    /** canvas */
    private _skCanvas!: CCanvas;

    /** 当前处理id */
    // private _curProcessingId: number;

    private _displayMgr: DisplayObjectMgr;

    constructor() {
        DisplayObjectMgr.instance().setImpl(this);
        this._registerMap = new Map();
        this._displayImplMap = new Map();
        this._displayMgr = DisplayObjectMgr.instance();
    }

    /**
     * 单例
     * @returns 实例
     */
    public static instance(): DisplayObjectImplMgr {
        if (!this._instance) {
            this._instance = new DisplayObjectImplMgr();
        }
        return this._instance;
    }

    /**
     * 设置渲染器
     * @param render
     */
    public setRender(render: CRenderer): void {
        this._render = render;
    }

    /**
     * 设置canvas
     * @param canvas
     */
    public setCanvas(canvas: CCanvas): void {
        this._skCanvas = canvas;
    }

    /**
     * 注册显示对象的实现
     * @param displayClass
     * @param displayImplClass
     */
    public registerDisplayObjectImplement(
        displayClass: new () => DisplayObject,
        displayImplClass: new () => DisplayObjectImpl<DisplayObject>,
    ): void {
        if (this._registerMap.has(displayClass)) {
            console.error('重复注册display 实现', displayClass, displayImplClass);
        } else {
            this._registerMap.set(displayClass, displayImplClass);
        }
    }

    /**
     * 添加显示对象
     * @param display
     */
    public addDisplay(display: DisplayObject, updateView = false): void {
        const { id } = display;
        const displayImplClass = this._registerMap.get(display.constructor as IConstructor<DisplayObject>);
        if (displayImplClass) {
            const displayImpl = new displayImplClass();
            displayImpl.init(display, { skCanvas: this._skCanvas });
            this._displayImplMap.set(id, displayImpl);
        }
        if (updateView) {
            this.updateView();
        }
    }

    /**
     * 根据id移除显示对象
     * @param id
     * @returns
     */
    public removeDisplayById(id: number): boolean {
        let removed = false;
        const displayImpl = this._displayImplMap.get(id);
        if (displayImpl) {
            this._displayImplMap.delete(id);
            displayImpl.dispose();
            this._displayRemovedSet.add(id);
            removed = true;
        }
        return removed;
    }

    // TODO 补充事件处理
    public processMouseEvent(_event: IMouseEvent): boolean {
        throw new Error('Method not implemented.');
    }

    public processKeyboardEvent(_event: IKeyboardEvent): boolean {
        throw new Error('Method not implemented.');
    }

    /**
     * 返回true表示事件被消费掉，不再向上冒泡
     * @param mouseEventType
     * @param pos
     * @param fnKey
     * @param data
     * @returns
     */
    // public processMouseEvent(
    //     viewport: Viewport,
    //     mouseEventType: EN_MOUSE_EVENT_TYPE,
    //     pos: math.Vec2,
    //     fnKey: FnKey,
    //     data?: IMouseEventData,
    // ): boolean {
    //     //处理 display监听逻辑
    //     const displayData = { ...(data || {}), viewport, pos } as IDisplayEventData;
    //     if (this._curProcessingId) {
    //         const curProcessingImpl = this._displayImplMap.get(this._curProcessingId);
    //         // const gNodes = dNodesMap.get(this._curProcessingId);
    //         if (curProcessingImpl) {
    //             // const displayData = this._makeDisplayEventData(data, gNodes, viewport);
    //             if (curProcessingImpl.eventChecker(mouseEventType, EN_EVENT_CHECK_TYPE.processing)) {
    //                 if (!curProcessingImpl.processMouseEvent(viewport, mouseEventType, pos, fnKey, displayData)) {
    //                     this._curProcessingId = 0;
    //                 }
    //             }
    //             return true;
    //         } else {
    //             // 当前处理对象已不存在，需要重置id
    //             this._curProcessingId = 0;
    //         }
    //     } else {
    //         for (const [diD, displayImpl] of this._displayImplMap) {
    //             // const gNodes = dNodesMap.get(diD);
    //             // const displayData = this._makeDisplayEventData(data, gNodes, viewport);
    //             if (
    //                 displayImpl.eventChecker(mouseEventType, EN_EVENT_CHECK_TYPE.execute) &&
    //                 displayImpl.processMouseEvent(viewport, mouseEventType, pos, fnKey, displayData)
    //             ) {
    //                 // 触发事件成功并执行
    //                 this._curProcessingId = diD;
    //                 return true;
    //             }
    //         }
    //     }
    //     return false;
    // }

    // public getCurProcessDisplayId(): number {
    //     return this._curProcessingId;
    // }

    /**
     * 渲染前准备
     * @returns
     */
    public onBeforeRender(rebuild = false): {
        update: IMgrDisplayRenderData[];
        remove: number[];
    } {
        const update: IMgrDisplayRenderData[] = [];
        for (const [id, displayImpl] of this._displayImplMap) {
            const renderData = displayImpl?.onBeforeRender(rebuild);
            if (renderData) {
                update.push({ ...renderData, id });
            }
        }
        const remove = Array.from(this._displayRemovedSet);
        this._displayRemovedSet.clear();
        return { update, remove };
    }

    /**
     * 判定特定类型是否脏
     * @param classT
     * @returns
     */
    // public isTypeDirty(classT: Function): boolean {
    //     for (const [id, impl] of this._displayImplMap) {
    //         const display = this._displayMgr.getDisplay(id);
    //         if (display && display instanceof classT) {
    //             if (impl && impl.isDirty()) {
    //                 return true;
    //             }
    //             if (display.isDirty()) {
    //                 return true;
    //             }
    //         }
    //     }
    //     return false;
    // }

    public updateView(): void {
        this._render.updateView();
    }

    public get hasRemoved(): boolean {
        return this._displayRemovedSet.size !== 0;
    }

    // public updateDisplayVisible(id: number, visible: boolean, layers?: number): void {
    //     this._render.updateDisplayVisible(id, visible, layers);
    // }
    // public updateDisplayGNodeVisible(dId: number, gId: number | number[], visible: boolean, layers?: number): void {
    //     this._render.updateDisplayGNodeVisible(dId, gId, visible, layers);
    // }
    // public updateDisplayTransformationDynamic(id: number, m: math.Matrix4): void {
    //     this._render.updateDisplayTransformationDynamic(id, m);
    // }

    // public getObjectById(id: number): any {
    //     return this._render.getObjectById(id);
    // }

    // public onKeyboard(key: string, type?: string): boolean {
    //     if (this._curProcessingId) {
    //         const impl = this._displayImplMap.get(this._curProcessingId);
    //         if (impl && impl instanceof GizmosBaseImpl) {
    //             return impl.onKeyboard(key, type);
    //         }
    //     }
    //     return false;
    // }
}
