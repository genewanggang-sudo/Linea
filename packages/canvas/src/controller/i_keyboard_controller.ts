import { IKeyboardEvent } from '../types/type_define';

/**
 * 处理键盘事件接口
 */
export interface IProcessKeyboardEvent {
    /**
     * 处理键盘事件
     * 返回true则不再向上冒泡
     */
    processKeyboardEvent(event: IKeyboardEvent): boolean;
}

/**
 * 键盘事件控制器接口
 */
export interface IKeyboardController extends IProcessKeyboardEvent {
    onKeyDown(event: IKeyboardEvent): boolean;

    onKeyUp(event: IKeyboardEvent): boolean;

    onKeyPress(event: IKeyboardEvent): boolean;
}
