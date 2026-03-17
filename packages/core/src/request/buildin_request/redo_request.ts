import { EN_CoreRequestIds } from '../../types/type_define';
import { Request } from '../request';
import { registerRequest } from '../request_decorator';

@registerRequest(EN_CoreRequestIds.REDO)
export class RedoRequest extends Request {
    public execute(): void {
        this._doc.transactionMgr.redo()
        this._doc.updateView()
    }

    public canTransact(): boolean {
        return false
    }
}
