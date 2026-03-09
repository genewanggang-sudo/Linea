import { Vec2 } from '@ccpc/math'
import { FnKey } from '../controller/fn_key'
/**
 * 原生鼠标事件
 */
export enum EN_NativeMouseEvent {
    MOUSE_DOWN = 'mousedown',
    MOUSE_MOVE = 'mousemove',
    MOUSE_UP = 'mouseup',
    WHEEL = 'wheel',
    CONTEXT_MENU = 'contextmenu',
    MOUSE_LEAVE = 'mouseleave',
    MOUSE_ENTER = 'mouseenter',
}

/**
 * 原生键盘事件
 */
export enum EN_NativeKeyboardEvent {
    KEY_DOWN = 'keydown',
    KEY_UP = 'keyup',
    KEY_PRESS = 'keypress',
}

/**
 * 自定义鼠标事件
 */
export enum EN_MouseEvent {
    MOUSE_MOVE = 'move',

    L_BUTTON_DOWN = 'l_down',
    L_BUTTON_UP = 'l_up',

    R_BUTTON_DOWN = 'r_down',
    R_BUTTON_UP = 'r_up',

    M_BUTTON_DOWN = 'm_down',
    M_BUTTON_UP = 'm_up',

    WHEEL_FORWARD = 'wheel+',
    WHEEL_BACKWARD = 'wheel-',
    WHEEL_START = 'wheel_start',
    WHEEL_END = 'wheel_end',

    /**右键单击*/
    R_CLICK = 'r_clk',
    /**立即触发的单击*/
    CLICK = 'clk',
    /**延迟触发的单击*/
    SGL_CLICK = 'sgl_clk',
    /**双击*/
    DBL_CLICK = 'db_clk',

    MOUSE_LEAVE = 'mouse_leave',
    MOUSE_ENTER = 'mouse_enter',
}

/**
 * 自定义键盘事件
 */
export enum EN_KeyboardEvent {
    KEY_DOWN = 'down',
    KEY_UP = 'up',
    KEY_PRESS = 'press'
}

/**
 * 鼠标事件参数类型
 */
export type IMouseEvent = {
    type: EN_MouseEvent,
    domEvent: MouseEvent,
    pos: Vec2,
    fnKey: FnKey
}

/**
 * 键盘事件参数类型
 */
export type IKeyboardEvent = {
    type: EN_KeyboardEvent,
    domEvent: KeyboardEvent,
    fnKey: FnKey
}
