/* eslint-disable @typescript-eslint/no-unused-expressions */
import type { Shell } from '../../brep/shell';
import { IShellModelingResult } from './shell_modeling_result';
import { DiagnoseShell } from '../shell_valid/diagnose_shell';
import { BaseBRepTopoError } from '../shell_valid/base_brep_topo_error';



export default abstract class ShellModelingBase {
    protected _contextShells: Shell[];

    constructor(contextShells: Shell[]) {
        this._contextShells = contextShells;
    }

    protected abstract _executeImpl(): IShellModelingResult;

    public getContextShells(): Shell[] {
        return this._contextShells;
    }

    public execute(): IShellModelingResult {
        const ret = this._executeImpl();
        const { addShells, modifiedShellsMap } = ret;

        const shelles: Shell[] = [];
        addShells && shelles.push(...addShells);
        modifiedShellsMap && shelles.push(...modifiedShellsMap.keys());

        if (this._validateResult()) {
            // 校验拓扑关系的合法性
            const errors: BaseBRepTopoError[] = [];
            shelles.forEach(s => errors.push(...DiagnoseShell.execute(s)));

            if (errors.length) {
                // 暂时直接抛异常， TODO... 进行自动修复，对于出现不能修复的情况，再抛异常
                ret.topoErrors = errors;
                throw new Error(`${this.constructor.name}操作后, Brep数据不合法`);
            }
        }
        return ret;
    }

    protected _validateResult() {
        return true;
    }
}