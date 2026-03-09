
import { EN_ActionStatus } from '../types/type_define';
import { ActionResult } from './action_result';
import { CmdActionController } from './cmd_action_controller';

export class Action<T> extends CmdActionController<ActionResult<T>> {
    protected _markSuccess(data: T) {
        super._resolve(new ActionResult(EN_ActionStatus.OK, data));
    }

    protected _markCanceled() {
        super._resolve(new ActionResult(EN_ActionStatus.CANCEL));
    }

    public cancel() {
        this._markCanceled();
    }
}
