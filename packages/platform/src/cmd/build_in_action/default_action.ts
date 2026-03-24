import { IKeyboardEvent, IMouseEvent } from '@ccpc/canvas'
import { app } from '../../app/app'
import { CmdActionController } from '../cmd_action_controller'
import { PickUtil } from './pick_util'

/**
 * 默认空闲态交互
 * - move 时更新高亮
 * - click 时更新选中
 */
export class DefaultAction extends CmdActionController {
    public onMouseMove(evt: IMouseEvent): boolean {
        const picked = PickUtil.pickGNode(this.getCanvas(), evt.pos)

        if (!picked) {
            app.highLight.clear()
            this._updateView()
            return false
        }

        app.highLight.reset([picked])
        this._updateView()
        return false
    }

    public onClick(evt: IMouseEvent): boolean {
        const picked = PickUtil.pickGNode(this.getCanvas(), evt.pos)

        app.highLight.clear()

        if (!picked && !evt.fnKey.ctrlKey) {
            app.selection.clear()
            this._updateView()
            return false
        }

        if (!picked) {
            return false
        }

        if (evt.fnKey.ctrlKey) {
            app.selection.add([picked])
        } else {
            app.selection.reset([picked])
        }

        this._updateView()
        return false
    }

    public onRButtonDown(_evt: IMouseEvent): boolean {
        app.highLight.clear()
        app.selection.clear()
        this._updateView()
        return false
    }

    public onKeyDown(evt: IKeyboardEvent): boolean {
        if (evt.domEvent.key !== 'Escape') {
            return false
        }

        app.highLight.clear()
        app.selection.clear()
        this._updateView()
        return true
    }
}
