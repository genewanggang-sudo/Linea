import { IDocument } from '../document/i_document';
import { ITransaction } from './i_transaction';
import { EN_TransactionStatus } from './i_transaction_base';
import { ITransactionGroup } from './i_transaction_group';
import { TransactionBase } from './transaction_base';
import { UndoRedoEntity } from './undo_redo_entity';

export class Transaction extends TransactionBase implements ITransaction {
    public readonly undoRedoEntity: UndoRedoEntity;

    public canUndo: boolean = true;

    public parent!: ITransactionGroup;

    constructor(doc: IDocument, name: string) {
        super(doc, name);
        this.start();
        this.undoRedoEntity = new UndoRedoEntity(doc);
    }

    public start(): boolean {
        super.start();
        this.doc.transactionMgr.getLastLeafTranGroup(true)?.clearRedoList();
        this.parent = this.getStartParent();
        return true;
    }

    public commit(): boolean {
        // TODO 发送事件
        const ok = this.undoRedoEntity.commit();
        if (!ok) this.parent.popTransaction(this);
        this._status = EN_TransactionStatus.COMMITTED;
        return true;
    }

    public rollBack(): boolean {
        this.undoRedoEntity.rollBack();

        this.parent.popTransaction(this);
        super.rollBack();
        return true;
    }

    public reverseAndExecute(): void {
        this.undoRedoEntity.reverseAndExecute();
    }

    public merge(another: ITransaction): this {
        this.undoRedoEntity.merge(another.undoRedoEntity);
        return this;
    }

    public collectUsedIds(set: Set<number>): void {
        this.undoRedoEntity.collectUsedIds(set);
    }
}
