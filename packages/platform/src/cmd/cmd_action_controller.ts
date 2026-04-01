import { DefaultController, IKeyboardEvent, IMouseEvent } from '@ccpc/canvas'
import { DebugUtil, GRep, IDocument, TmpElementPainter } from '@ccpc/core'
import { ActionResult } from './action_result'
import { app } from '../app/app'

export type ICmdStatus<T = unknown> = {
    promise: Promise<T | undefined>,
    resolve: (result?: T) => void,
    finish?: boolean
}

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
     * 临时元素绘制器
     */
    private _tmpElementPainters: Array<TmpElementPainter> = []

    /**
     * !!仅由CmdMgr调用
     */
    public initStatus() {
        this._status.promise = new Promise<T | undefined>(resolve => this._status.resolve = resolve)
        delete this._status.finish
        const painter = new TmpElementPainter(this.getDoc())
        this._tmpElementPainters.push(painter)
        return this._status
    }

    /**
     * 获取画布
     */
    public getCanvas() {
        return app.getCanvas()
    }

    /**
     * 获取文档
     */
    public getDoc(): IDocument {
        return app.doc
    }

    /**
     * 执行动作
     */
    public async runAction<T>(action: CmdActionController<ActionResult<T>>) {
        this.action = action as CmdActionController<unknown>;
        const actionPromise = action.initStatus().promise
        await Promise.all([actionPromise, action.execute()])
        delete this.action
        return actionPromise
    }

    /**
     * 命令执行
     */
    public async execute(..._params: unknown[]) { }

    /**
     * 命令取消
     */
    public cancel() {
        this._resolve()
    }

    /**
     * cmd被销毁
     */
    public onDestroy() { }

    /**
     * 获取所有临时元素绘制器
     */
    public getTmpElementPainters() {
        return this._tmpElementPainters
    }

    /**
     * 获取默认临时元素绘制器
     */
    public getBuildInTmpElementPainter() {
        return this._tmpElementPainters[0]
    }

    /**
     * 获取指定的临时元素绘制器
     */
    public getTmpElementPainterByIndex(index: number) {
        if (index < 0 || index >= this._tmpElementPainters.length) {
            DebugUtil.assert(false, 'index无效', 'wg', '2026-03-15')
            return
        }
        return this._tmpElementPainters[index]
    }

    /**
     * 用户创建临时元素绘制器
     */
    public applyNewTmpElementPainter() {
        const painter = new TmpElementPainter(this.getDoc())
        this._tmpElementPainters.push(painter)
        return painter
    }

    /**
     * 销毁用户创建的临时元素绘制器
     */
    public clearUsersTmpElementPainters() {
        for (let i = 1; i < this._tmpElementPainters.length; i += 1) {
            this._tmpElementPainters[i].destroy()
        }
        this._tmpElementPainters.splice(1)
    }

    /**
     * 在指定临时元素绘制器上绘制临时元素
     */
    public drawTmpGRep(grep: GRep, index: number = 0) {
        if (index < 0 || index >= this._tmpElementPainters.length) {
            DebugUtil.assert(false, 'index无效', 'wg', '2026-03-15')
            return
        }
        this._tmpElementPainters[index].drawTmpGRep(grep)
    }

    /**
     * 清除所有绘制的临时元素
     */
    public clearTmp() {
        app.highLight.clear()
        for (const painter of this._tmpElementPainters) {
            if (painter) {
                painter.clearTmp()
            }
        }
    }

    /**
     * 刷新视图
     */
    protected _updateView() {
        this.getDoc().updateView()
    }

    /**
     * 结束cmd
     */
    protected _resolve(data?: T) {
        this.clearTmp()
        if (this._status.finish) return

        this._status.finish = true
        this._status.resolve(data)
        this.onDestroy()
    }

    public onKeyDown(evt: IKeyboardEvent): boolean {
        if (evt.domEvent.key === 'Escape') {
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
