import { IDocument } from '../document/i_document';
import { IRequest } from './i_request';

export abstract class Request implements IRequest {
    protected _doc!: IDocument

    public setDoc(doc: IDocument) {
        this._doc = doc;
    }

    public abstract execute(): unknown

    /**
     * 是否参与事务记录
     */
    public canTransact(): boolean {
        return true;
    }
}
