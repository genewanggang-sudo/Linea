import { IProcessKeyboardEvent } from './i_keyboard_controller';
import { IProcessMouseEvent } from './i_mouse_controller';

/**
 * 处理键鼠事件的抽象类型
 */
export interface IProcessEvent extends IProcessMouseEvent, IProcessKeyboardEvent {

}
