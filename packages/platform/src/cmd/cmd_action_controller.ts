import { DefaultController, IKeyboardEvent, IMouseEvent } from '@ccpc/canvas'
import { IDocument } from '@ccpc/core'
import { ActionResult } from './action_result'

export type ICmdStatus<T = unknown> = {
    promise: Promise<T | undefined>,
    resolve: (result?: T) => void,
    finish?: boolean
}

// TODO 添加一些关于绘制临时对象的逻辑
export class CmdActionController<T = unknown> extends DefaultController {

    /**
     * promise结束,cmd才结束
     */
    private _status: ICmdStatus<T> = {
        promise: new Promise<T>(() => undefined),
        resolve: () => undefined,
    }

    /**
     * 启动的action
     */
    public action?: CmdActionController<unknown>

    /**
     * !!仅由CmdMgr调用
     */
    public initStatus() {
        this._status.promise = new Promise<T | undefined>(resolve => this._status.resolve = resolve)
        delete this._status.finish
        return this._status
    }

    public getCanvas() {
        // TODO 从app获取
        throw new Error('Method not implemented.');
    }

    public getDoc(): IDocument {
        // TODO 从app获取
        throw new Error('Method not implemented.');
    }

    protected _updateView() {
        this.getDoc().updateView()
    }

    public async execute(..._params: unknown[]) { }

    public cancel() {
        this._resolve()
    }

    /**
     * cmd被销毁
     */
    public onDestroy() { }

    /**
     * 结束cmd
     */
    protected _resolve(data?: T) {
        if (this._status.finish) return
        this._status.finish = true
        this._status.resolve(data)
        this.onDestroy()
    }

    public async runAction<T>(action: CmdActionController<ActionResult<T>>) {
        this.action = action as CmdActionController<unknown>;
        const actionPromise = action.initStatus().promise
        await Promise.all([actionPromise, action.execute()])
        delete this.action
        return actionPromise
    }

    public onKeyDown(evt: IKeyboardEvent): boolean {
        if (evt.domEvent.key === 'esc') {
            this.cancel()
            return true
        }
        return false;
    }

    public onMouseEnter(_evt: IMouseEvent): boolean {
        window?.focus()
        return false
    }

}
