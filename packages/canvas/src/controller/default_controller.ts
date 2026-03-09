import { EN_KeyboardEvent, EN_MouseEvent, IKeyboardEvent, IMouseEvent } from '../types/type_define';
import { IKeyboardController } from './i_keyboard_controller';
import { IMouseController } from './i_mouse_controller';

export class DefaultController implements IMouseController, IKeyboardController {
    public processKeyboardEvent(event: IKeyboardEvent): boolean {
        switch (event.type) {
            case EN_KeyboardEvent.KEY_DOWN:
                return this.onKeyDown(event);
            case EN_KeyboardEvent.KEY_UP:
                return this.onKeyUp(event);
            case EN_KeyboardEvent.KEY_PRESS:
                return this.onKeyPress(event);
            default:
                return false;
        }
    }

    public processMouseEvent(event: IMouseEvent): boolean {
        switch (event.type) {
            case EN_MouseEvent.MOUSE_ENTER:
                return this.onMouseEnter(event);
            case EN_MouseEvent.MOUSE_MOVE:
                return this.onMouseMove(event);
            case EN_MouseEvent.MOUSE_LEAVE:
                return this.onMouseLeave(event);
            case EN_MouseEvent.L_BUTTON_DOWN:
                return this.onLButtonDown(event);
            case EN_MouseEvent.L_BUTTON_UP:
                return this.onLButtonUp(event);
            case EN_MouseEvent.R_BUTTON_DOWN:
                return this.onRButtonDown(event);
            case EN_MouseEvent.R_BUTTON_UP:
                return this.onRButtonUp(event);
            case EN_MouseEvent.M_BUTTON_DOWN:
                return this.onMButtonDown(event);
            case EN_MouseEvent.M_BUTTON_UP:
                return this.onMButtonUp(event);
            case EN_MouseEvent.WHEEL_FORWARD:
                return this.onWheelForward(event);
            case EN_MouseEvent.WHEEL_BACKWARD:
                return this.onWheelBackward(event);
            case EN_MouseEvent.CLICK:
                return this.onClick(event);
            case EN_MouseEvent.SGL_CLICK:
                return this.onSglClick(event);
            case EN_MouseEvent.DBL_CLICK:
                return this.onDblClick(event);
            case EN_MouseEvent.R_CLICK:
                return this.onRClick(event);
            default:
                return false;
        }
    }

    public onMouseEnter(_event: IMouseEvent): boolean {
        return false;
    }

    public onMouseMove(_event: IMouseEvent): boolean {
        return false;
    }

    public onLButtonDown(_event: IMouseEvent): boolean {
        return false;
    }
    public onLButtonUp(_event: IMouseEvent): boolean {
        return false;
    }

    public onRClick(_event: IMouseEvent): boolean {
        return false;
    }

    public onRButtonDown(_event: IMouseEvent): boolean {
        return false;
    }

    public onRButtonUp(_event: IMouseEvent): boolean {
        return false;
    }

    public onMButtonDown(_event: IMouseEvent): boolean {
        return false;
    }

    public onMButtonUp(_event: IMouseEvent): boolean {
        return false;
    }

    public onWheelForward(_event: IMouseEvent): boolean {
        return false;
    }

    public onWheelBackward(_event: IMouseEvent): boolean {
        return false;
    }

    public onClick(_event: IMouseEvent): boolean {
        return false;
    }

    public onSglClick(_event: IMouseEvent): boolean {
        return false;
    }

    public onDblClick(_event: IMouseEvent): boolean {
        return false;
    }

    public onMouseLeave(_event: IMouseEvent): boolean {
        return false;
    }

    public onKeyDown(_event: IKeyboardEvent): boolean {
        return false;
    }

    public onKeyUp(_event: IKeyboardEvent): boolean {
        return false;
    }

    public onKeyPress(_event: IKeyboardEvent): boolean {
        return false;
    }
}
