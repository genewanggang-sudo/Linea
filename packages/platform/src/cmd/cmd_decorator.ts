import { CmdMgr } from './cmd_mgr';
import { Cmd } from './cmd';
import { IConstructor } from '@ccpc/core';

/**
 * 注册命令
 */
export function registerCmd(cmdId: string) {
    return (ctor: IConstructor<Cmd>) => {
        CmdMgr.instance().registerCmd(cmdId, ctor)
    }
}
