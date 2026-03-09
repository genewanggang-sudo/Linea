import { IMouseEvent } from '../types/type_define';

/**
 * 处理鼠标事件接口
 */
export interface IProcessMouseEvent {
    /**
     * 处理鼠标事件
     * 若返回true则不在向上冒泡
     */
    processMouseEvent(event: IMouseEvent): boolean
}

/**
 * 鼠标事件控制接口
 */
export interface IMouseController extends IProcessMouseEvent {
    onMouseEnter(event: IMouseEvent): boolean;

    onMouseMove(event: IMouseEvent): boolean;

    onLButtonDown(event: IMouseEvent): boolean;

    onLButtonUp(event: IMouseEvent): boolean;

    onRClick(event: IMouseEvent): boolean;

    onRButtonDown(event: IMouseEvent): boolean;

    onRButtonUp(event: IMouseEvent): boolean;

    onMButtonDown(event: IMouseEvent): boolean;

    onMButtonUp(event: IMouseEvent): boolean;

    onWheelForward(event: IMouseEvent): boolean;

    onWheelBackward(event: IMouseEvent): boolean;

    onClick(event: IMouseEvent): boolean;

    onSglClick(event: IMouseEvent): boolean;

    onDblClick(event: IMouseEvent): boolean;

    onMouseLeave(event: IMouseEvent): boolean;
}
