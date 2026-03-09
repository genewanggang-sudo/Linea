import { EN_ActionStatus } from '../types/type_define';

export class ActionResult<T> {
    constructor(
        private _status: EN_ActionStatus,
        private _data?: T,
    ) { }

    public get data() {
        return this._data
    }

    public get isSuccess() {
        return this._status === EN_ActionStatus.OK
    }

    public get isCanceled() {
        return this._status === EN_ActionStatus.CANCEL
    }
}
