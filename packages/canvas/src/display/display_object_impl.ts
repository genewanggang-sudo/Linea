import { DisplayObject, GRep, StateObject } from '@ccpc/core';
import { IProcessEvent } from '../controller/i_process_event';
import { CCanvas } from '../canvas/c_canvas';
import { IMouseEvent, IKeyboardEvent } from '../types/type_define';

/**
 * 显示上下文
 */
export interface IDisplayContext {
    readonly skCanvas: CCanvas;
}

export interface IDisplayRenderData {
    // domNodes?: ElementDomNode[];
    gRep?: GRep;
}

export abstract class DisplayObjectImpl<T extends DisplayObject = DisplayObject> extends StateObject implements IProcessEvent {
    /** 显示对象 */
    protected _display!: T;

    /** 显示上下文 */
    protected _context!: IDisplayContext;

    /**
     * 初始化
     */
    public init(display: T, context: IDisplayContext) {
        this._display = display;
        this._context = context;
        this.onInit();
    }

    /**
     * 初始化回调
     */
    public abstract onInit(): void;

    public abstract processMouseEvent(event: IMouseEvent): boolean

    public abstract processKeyboardEvent(event: IKeyboardEvent): boolean

    /**
     * 实现变更处理
     */
    public abstract onChange(): void;

    /**
     * 渲染前数据准备
     */
    public onBeforeRender(rebuild = false): IDisplayRenderData | null {
        if (rebuild || this._display.isDirty() || this.isDirty()) {
            const visible = this._display.testVisible();
            if (this._display.isDirty()) {
                this._display.unDirty();
                if (visible) {
                    this.onDisplayChange();
                }
            }
            if (this.isDirty()) {
                this.unDirty();
                if (visible) this.onChange();
            }

            const data = this.onRender();

            if (data) {
                const { gRep } = data;
                if (gRep) {
                    // TODO 暂不需要

                    // if (this._display?.layers != null) {
                    //     gRep.layers = this._display.layers;
                    // }
                    // if (!gRep.category && this.category) {
                    //     gRep.category = this.category;
                    // }
                    // DisplayUtil.setGNodeDisplayId(gRep, this._display);
                }
            }
            return data;
        }
        return null;
    }

    public abstract onDisplayChange(): void;

    /**
     * 渲染回调
     */
    public abstract onRender(): IDisplayRenderData | null;

    /**
     * 注销
     */
    public dispose(): void {
        super.dispose();
    }

}
