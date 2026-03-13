import { Vec2 } from '@ccpc/math';
import { ICCanvas } from '../canvas/i_c_canvas';
import { IProcessMouseEvent } from './i_mouse_controller';
import { EN_MouseEvent, EN_NativeMouseEvent } from '../types/type_define';
import { FnKey } from './fn_key';
import { canvasConfig } from '../toolkit/canvas_config';
/**
 * 鼠标事件监听器
 */
export class MouseInteractor {
    /**触发鼠标事件的容器*/
    private _container: HTMLElement;

    /**画布*/
    // TODO _canvas暂时没用到,需要视具体情况定
    private _canvas: ICCanvas;

    /**鼠标事件处理器*/
    private _mouseControllers: Array<IProcessMouseEvent> = [];

    /**鼠标是否按下*/
    private _mouseDown = false;

    /**鼠标左键按下位置*/
    private _lMouseDownPos?: Vec2;

    /**鼠标中键按下位置*/
    private _mMouseDownPos?: Vec2;

    /**鼠标右键按下位置*/
    private _rMouseDownPos?: Vec2;

    /**双击判定定时器*/
    private _dblClickTimeout?: number;

    private _lastLMouseUpPos?: Vec2;

    /**滚轮滚动中*/
    private _wheeling = false;

    private _wheelTimer?: number;

    constructor(canvas: ICCanvas, container: HTMLElement, controllers: Array<IProcessMouseEvent>) {
        this._canvas = canvas;
        this._container = container;
        this._mouseControllers = controllers;
    }

    public startListening() {
        this._container.addEventListener(EN_NativeMouseEvent.MOUSE_DOWN, this._onMouseDown);
        this._container.addEventListener(EN_NativeMouseEvent.MOUSE_MOVE, this._onMouseMove);
        this._container.addEventListener(EN_NativeMouseEvent.MOUSE_UP, this._onMouseUp);
        this._container.addEventListener(EN_NativeMouseEvent.WHEEL, this._onMouseWheel);
        this._container.addEventListener(EN_NativeMouseEvent.CONTEXT_MENU, this._onContextMenu);
        this._container.addEventListener(EN_NativeMouseEvent.MOUSE_LEAVE, this._onMouseLeave);
        this._container.addEventListener(EN_NativeMouseEvent.MOUSE_ENTER, this._onMouseEnter);
    }

    public stopListening() {
        this._container.removeEventListener(EN_NativeMouseEvent.MOUSE_DOWN, this._onMouseDown);
        this._container.removeEventListener(EN_NativeMouseEvent.MOUSE_MOVE, this._onMouseMove);
        this._container.removeEventListener(EN_NativeMouseEvent.MOUSE_UP, this._onMouseUp);
        this._container.removeEventListener(EN_NativeMouseEvent.WHEEL, this._onMouseWheel);
        this._container.removeEventListener(EN_NativeMouseEvent.CONTEXT_MENU, this._onContextMenu);
        this._container.removeEventListener(EN_NativeMouseEvent.MOUSE_LEAVE, this._onMouseLeave);
        this._container.removeEventListener(EN_NativeMouseEvent.MOUSE_ENTER, this._onMouseEnter);
    }

    private _onMouseDown = (e: MouseEvent) => {
        const pos = this._getScreenPos(e);
        this._mouseDown = true;
        let consumed = false;
        if (e.button === 0) {
            this._lMouseDownPos = pos.clone();
            consumed = this._processMouseEvent(EN_MouseEvent.L_BUTTON_DOWN, e);
        } else if (e.button === 1) {
            this._mMouseDownPos = pos.clone();
            consumed = this._processMouseEvent(EN_MouseEvent.M_BUTTON_DOWN, e);
        } else if (e.button === 2) {
            this._rMouseDownPos = pos.clone();
            consumed = this._processMouseEvent(EN_MouseEvent.R_BUTTON_DOWN, e);
        }
        if (consumed) {
            e.stopPropagation();
        }
    }

    private _onMouseMove = (e: MouseEvent) => {
        let consumed = false;
        consumed = this._processMouseEvent(EN_MouseEvent.MOUSE_MOVE, e)
        if (consumed) {
            e.stopPropagation();
        }
    }

    private _onMouseUp = (e: MouseEvent) => {
        const pos = this._getScreenPos(e);
        this._mouseDown = false;
        let consumed = false;
        if (e.button === 0) {
            if (this._lMouseDownPos && this._lMouseDownPos.sqDistanceTo(pos) < canvasConfig.common.click_to_tolerance) {
                this._processMouseEvent(EN_MouseEvent.CLICK, e);
            }
            if (!this._dblClickTimeout) {
                // 未在双击判定时间内触发,为延迟单击
                this._dblClickTimeout = window.setTimeout(() => {
                    delete this._dblClickTimeout;
                    this._processMouseEvent(EN_MouseEvent.SGL_CLICK, e);
                }, canvasConfig.common.dbl_click_interval)
            } else {
                // 双击时间内再次触发,根据距离判断是否真正双击
                window.clearTimeout(this._dblClickTimeout);
                if (this._lastLMouseUpPos && this._lastLMouseUpPos.sqDistanceTo(pos) < canvasConfig.common.click_to_tolerance) {
                    delete this._dblClickTimeout;
                    this._processMouseEvent(EN_MouseEvent.DBL_CLICK, e);
                } else {
                    this._dblClickTimeout = window.setTimeout(() => {
                        delete this._dblClickTimeout;
                        this._processMouseEvent(EN_MouseEvent.SGL_CLICK, e);
                    }, canvasConfig.common.dbl_click_interval)
                }
            }
            this._lastLMouseUpPos = pos.clone();
            consumed = this._processMouseEvent(EN_MouseEvent.L_BUTTON_UP, e);
            delete this._lMouseDownPos;
        } else if (e.button === 1) {
            delete this._mMouseDownPos;
            consumed = this._processMouseEvent(EN_MouseEvent.M_BUTTON_UP, e);
        } else if (e.button === 2) {
            consumed = this._processMouseEvent(EN_MouseEvent.R_BUTTON_UP, e);
            if (!consumed &&
                this._rMouseDownPos &&
                this._rMouseDownPos.sqDistanceTo(pos) < canvasConfig.common.click_to_tolerance
            ) {
                consumed = this._processMouseEvent(EN_MouseEvent.R_CLICK, e);
                delete this._rMouseDownPos;
            }
        }
        if (consumed) {
            e.stopPropagation();
        }
    }

    private _onMouseWheel = (e: WheelEvent) => {
        const stopWheel = () => {
            if (this._wheeling === true) {
                this._wheeling = false;
                delete this._wheelTimer;
                this._processMouseEvent(EN_MouseEvent.WHEEL_END, e);
            }
        }

        if (this._wheelTimer !== undefined) {
            window.clearTimeout(this._wheelTimer);
        }

        if (!this._wheeling) {
            this._wheeling = true;
            this._processMouseEvent(EN_MouseEvent.WHEEL_START, e);
        }
        this._wheelTimer = window.setTimeout(stopWheel, 500);

        const consumed = this._processMouseEvent(
            e.deltaY < 0 ?
                EN_MouseEvent.WHEEL_FORWARD :
                EN_MouseEvent.WHEEL_BACKWARD, e);
        if (consumed) {
            e.stopPropagation();
        }
    }

    private _onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    }

    private _onMouseLeave = (e: MouseEvent) => {
        this._processMouseEvent(EN_MouseEvent.MOUSE_LEAVE, e);
        delete this._lMouseDownPos;
    }

    private _onMouseEnter = (e: MouseEvent) => {
        this._processMouseEvent(EN_MouseEvent.MOUSE_ENTER, e);
    }

    private _processMouseEvent(type: EN_MouseEvent, domEvent: MouseEvent): boolean {
        let consumed = false;
        const fnKey = new FnKey(domEvent);
        for (let i = 0; i < this._mouseControllers.length; i++) {
            const controller = this._mouseControllers[i];
            consumed = controller.processMouseEvent({
                type,
                domEvent,
                pos: this._getScreenPos(domEvent),
                fnKey,
            });
            if (consumed) break;
        }
        return consumed;
    }

    /**
     * 获取相对于canvas的屏幕坐标
     */
    private _getScreenPos(e: MouseEvent) {
        const rect = this._container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return new Vec2(x, y);
    }
}
