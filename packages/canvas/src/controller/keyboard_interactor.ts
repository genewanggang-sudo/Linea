import { EN_KeyboardEvent, EN_NativeKeyboardEvent } from '../types/type_define';
import { FnKey } from './fn_key';
import { IProcessKeyboardEvent } from './i_keyboard_controller';

/**
 * 键盘事件监听器
 */
export class KeyboardInteractor {
    /**键盘事件处理器*/
    private _mouseControllers: Array<IProcessKeyboardEvent> = [];

    constructor(controllers: Array<IProcessKeyboardEvent>) {
        this._mouseControllers = controllers;
    }

    public startListening() {
        window.addEventListener(EN_NativeKeyboardEvent.KEY_DOWN, this._onKeyDown);
        window.addEventListener(EN_NativeKeyboardEvent.KEY_UP, this._onKeyUp);
        window.addEventListener(EN_NativeKeyboardEvent.KEY_DOWN, this._onKeyPress);
    }

    public stopListening() {
        window.removeEventListener(EN_NativeKeyboardEvent.KEY_DOWN, this._onKeyDown);
        window.removeEventListener(EN_NativeKeyboardEvent.KEY_UP, this._onKeyUp);
        window.removeEventListener(EN_NativeKeyboardEvent.KEY_DOWN, this._onKeyPress);
    }

    private _onKeyDown = (e: KeyboardEvent) => {
        this._processKeyboardEvent(EN_KeyboardEvent.KEY_DOWN, e);
    }

    private _onKeyUp = (e: KeyboardEvent) => {
        this._processKeyboardEvent(EN_KeyboardEvent.KEY_UP, e);
    }

    private _onKeyPress = (e: KeyboardEvent) => {
        this._processKeyboardEvent(EN_KeyboardEvent.KEY_PRESS, e);
    }

    private _processKeyboardEvent(type: EN_KeyboardEvent, domEvent: KeyboardEvent): boolean {
        let consumed = false;
        const fnKey = new FnKey(domEvent);
        for (let i = 0; i < this._mouseControllers.length; i++) {
            const controller = this._mouseControllers[i];
            consumed = controller.processKeyboardEvent({
                type,
                domEvent,
                fnKey,
            });
            if (consumed) break;
        }
        return consumed;
    }
}
