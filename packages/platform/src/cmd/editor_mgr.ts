import { IKeyboardEvent, IMouseEvent, IProcessEvent } from '@ccpc/canvas'
import { DefaultAction } from './build_in_action/default_action'

/**
 * 精简版 EditorMgr:
 * 当前只负责把未被 cmd 消费的输入转给默认交互控制器。
 */
export class EditorMgr implements IProcessEvent {
    private static _instance?: EditorMgr

    public defaultController: IProcessEvent

    private constructor() {
        this.defaultController = new DefaultAction()
    }

    public static instance() {
        if (!this._instance) {
            this._instance = new EditorMgr()
        }
        return this._instance
    }

    public processMouseEvent(evt: IMouseEvent): boolean {
        return !!this.defaultController?.processMouseEvent(evt)
    }

    public processKeyboardEvent(evt: IKeyboardEvent): boolean {
        return !!this.defaultController?.processKeyboardEvent(evt)
    }
}

export const editorMgr = EditorMgr.instance()
