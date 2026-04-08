import { GrepDisplay, IDisplayRenderData } from '@ccpc/core';
import { registerDisplayImplement } from './register_display_impl';
import { DisplayObjectImpl } from './display_object_impl';
import { IKeyboardEvent, IMouseEvent } from '../types/type_define';

@registerDisplayImplement(GrepDisplay)
export class GrepDisplayImpl extends DisplayObjectImpl<GrepDisplay> {
    public onDisplayChange(): void {
        // 不处理
    }

    public onInit(): void {
        // 从model来的 gRep数据，本期直接返给渲染，不做处理
    }

    public onChange(): void {
        // 不处理
    }

    // public eventChecker(_type: EN_MouseEvent, _checkType: EN_EVENT_CHECK_TYPE): boolean {
    //     //  不处理事件，交给业务管理事件
    //     return false;
    // }
    // public processMouseEvent(
    //     _viewport: Viewport,
    //     _mouseEventType: EN_MOUSE_EVENT_TYPE,
    //     _pos: Vec2,
    //     _fnKey: FnKey,
    //     _data?: IMouseEventData,
    // ): boolean {
    //     // 不做处理
    //     throw new Error('Method not implemented.');
    // }

    public processMouseEvent(_event: IMouseEvent): boolean {
        throw new Error('Method not implemented.');
    }

    public processKeyboardEvent(_event: IKeyboardEvent): boolean {
        throw new Error('Method not implemented.');
    }

    /**
     * 渲染处理
     * @returns
     */
    public onRender(): IDisplayRenderData | null {
        return { gRep: this._display.gRep };
    }
}
