import { IDocument } from '../document/i_document';
import { DebugUtil } from '../toolkit/debug_util';
import { IConstructor } from '../types/type_guard';
import { EN_TransactionStatus, ITransactionBase } from './i_transaction_base';

export abstract class TransactionBase implements ITransactionBase {
    public name: string;

    public doc: IDocument;

    protected _status = EN_TransactionStatus.NOT_STARTED;

    constructor(doc: IDocument, name: string) {
        this.name = name;
        this.doc = doc;
    }

    public abstract collectUsedIds(set: Set<number>): void;
    public start(): boolean {
        this._status = EN_TransactionStatus.STARTED;
        return true;
    }

    public getStartParent() {
        const parent = this.doc.transactionMgr.getCurrentTransactionGroup();
        DebugUtil.assert(parent, '没有找到TransactionGroup', 'wg', '2026-03-05');
        parent.startTransaction(this);
        return parent;
    }

    public getStatus(): EN_TransactionStatus {
        return this._status;
    }

    public setStatus(status: EN_TransactionStatus): void {
        this._status = status;
    }

    public rollBack(): boolean {
        this._status = EN_TransactionStatus.ROLLED_BACK;
        return true;
    }

    public isTransactionLike<T extends ITransactionBase>(this: ITransactionBase, ctor: IConstructor<T>): this is T {
        return this instanceof ctor;
    }
}
