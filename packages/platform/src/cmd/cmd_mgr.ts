import { IKeyboardEvent, IMouseEvent, IProcessEvent } from '@ccpc/canvas';
import { ClassManager, DebugUtil, IConstructor, Signal } from '@ccpc/core'
import { Cmd } from './cmd';
import { CmdActionController } from './cmd_action_controller';

export class CmdMgr implements IProcessEvent {
    private static _instance?: CmdMgr

    private _busy?: boolean = false;

    private _currentCmd?: Cmd

    private _clsMgr = new ClassManager<string, IConstructor<Cmd>>()

    public readonly signalCmdFinish = new Signal(this)

    public static instance() {
        if (!this._instance) {
            this._instance = new CmdMgr()
        }
        return this._instance
    }

    /**
     * 注册cmd
     */
    public registerCmd(cmdId: string, cmd: IConstructor<Cmd>): boolean {
        const rCmd = this._clsMgr.getCls(cmdId)
        DebugUtil.assert(rCmd === undefined, `${cmdId}已注册`, 'wg', '2026-03-09')
        this._clsMgr.registerCls(cmdId, cmd)
        return true;
    }

    /**
     * 发起一个命令
     */
    public async sendCmd<C extends Cmd>(Ctor: IConstructor<C>, ...cmdParams: Parameters<C['execute']>): Promise<boolean> {
        this._clsMgr.getClsNameEnsure(Ctor);
        // 上一个命令没结束,必须等待
        while (this._busy) {
            this.resetAllActions();
            return new Promise(resolve => setTimeout(resolve, 50));
        }
        // TODO 发送命令开始事件
        const cmd = new Ctor();
        this._currentCmd = cmd;
        this._busy = true;

        const status = cmd.initStatus();
        const promiseExe = cmd.execute(...cmdParams);

        // 立即模式
        if (cmd.executeImmediately) {
            status.resolve();
        }
        // 两次异步全部结束,才结束cmd
        await Promise.all([status.promise, promiseExe]).catch(e => {
            console.error(e)
            // TODO 发送事件
        })
        cmd.onDestroy();
        delete this._currentCmd;
        delete this._busy;
        // 发送命令结束事件
        this.signalCmdFinish.dispatch()
        return true;
    }

    public getCurrentAction() {
        let node: CmdActionController | undefined = this.getCurrentCmd()
        while (node?.action) {
            node = node.action
        }
        return node
    }

    public getCurrentCmd() {
        return this._currentCmd
    }

    public resetAllActions() {
        const cmd = this.getCurrentCmd()
        if (!cmd) return;
        const actions: Array<CmdActionController> = [cmd]
        while (true) {
            const next = actions[actions.length - 1]?.action
            if (!next) break
            actions.push(next)
        }
        actions.reverse().forEach(c => c.cancel())
    }

    public processMouseEvent(evt: IMouseEvent): boolean {
        const target = this.getCurrentAction();
        return !!target?.processMouseEvent(evt);
    }

    public processKeyboardEvent(evt: IKeyboardEvent): boolean {
        const target = this.getCurrentAction();
        return !!target?.processKeyboardEvent(evt);
    }
}

export const cmdMgr = CmdMgr.instance()
