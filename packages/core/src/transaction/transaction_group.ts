import { IDocument } from '../document/i_document';
import { DebugUtil } from '../toolkit/debug_util';
import { ITransaction } from './i_transaction';
import { EN_TransactionStatus, ITransactionBase } from './i_transaction_base';
import { ITransactionGroup } from './i_transaction_group';
import { Transaction } from './transaction';
import { TransactionBase } from './transaction_base';

export class TransactionGroup extends TransactionBase implements ITransactionGroup {
    public undoList: ITransactionBase[] = [];

    public redoList: ITransactionBase[] = [];

    private _maxUndoStackSize: number = 30;

    public parent?: ITransactionGroup;

    constructor(doc: IDocument, name: string, public isRoot = false) {
        super(doc, name);
        this.isRoot = isRoot;
        this.start();
    }

    public start() {
        // TODO 发送事件
        super.start();
        if (this.isRoot) return true;
        this.doc.transactionMgr.getLastLeafTranGroup(true)?.clearRedoList();
        this.parent = this.getStartParent();
        return true;
    }

    public startTransaction(t: ITransactionBase) {
        DebugUtil.assert(
            this.getStatus() === EN_TransactionStatus.STARTED,
            '事务组已完成,不能再启动事务',
            'wg',
            '2026-03-05',
        );

        const oldName = this.getCurrentTransaction()?.name;
        const newName = t.name;
        DebugUtil.assert(
            this.getStatus() === EN_TransactionStatus.STARTED && !this.getCurrentTransaction(),
            `事务不能嵌套, 新事务${newName}, 未完成的事务${oldName}`,
            'wg',
            '2025-03-05',
        );
        this.undoList.push(t);
        this.redoList.splice(0);
        const max = Math.max(this.getMaxUndoStackSize(), 4);
        if (this.undoList.length <= max) {
            return;
        }

        const head = this.undoList.shift();
        // edit mode will compress all transactions to one single node,so we should merge first node to second
        if (head && this.parent) {
            const first = this._toTransaction(head);
            const second = this._toTransaction(this.undoList[0]);
            this.undoList[0] = first.merge(second);
        }
    }

    /**
     * 事务或事务组转成事务
     */
    private _toTransaction(t: ITransactionBase): ITransaction {
        if (t.isTransactionLike(TransactionGroup)) return t._compressToTransaction();
        else return t as ITransaction;
    }

    /**
     * 事务组压缩成事务
     */
    private _compressToTransaction(): ITransaction {
        //空的事务组 压缩成一个空事务
        if (!this.undoList.length) {
            const empty = new Transaction(this.doc, 'empty');
            empty.setStatus(EN_TransactionStatus.COMMITTED);
            return empty;
        }

        const newName = this.undoList[0].name + '->' + this.undoList[this.undoList.length - 1].name;

        while (this.undoList.length > 1) {
            const popped = this.undoList.pop();
            DebugUtil.assert(popped, 'undoList不应该为空', 'wg', '2026-03-05');
            const next = this._toTransaction(popped);
            const pre = this._toTransaction(this.undoList[this.undoList.length - 1]);
            this.undoList[this.undoList.length - 1] = pre;
            pre.merge(next);
        }

        const result = this.undoList[0] as ITransaction;
        result.name = newName;
        result.canUndo = true;

        return result;
    }

    public assimilate(): ITransaction | undefined {
        this._status = EN_TransactionStatus.COMMITTED;
        if (!this.undoList.length) {
            this.parent?.undoList.pop();
            return undefined;
        }
        const transaction = this._compressToTransaction();
        this.parent?.replaceTailTransaction(this, transaction);
        // TODO 刷新视图, 发送事件
        // this.doc.updateView();
        return transaction;
    }

    /**
     * 压缩成一个事务,然后undo
     */
    public rollBack(): boolean {
        super.rollBack();
        if (!this.undoList.length) {
            this.parent?.undoList.pop();
            return true;
        }
        const transaction = this._compressToTransaction();
        this.parent?.replaceTailTransaction(this, transaction);
        this.parent?.undoWithoutRedo(transaction);
        return true;
    }

    public undoWithoutRedo(ut: ITransaction): boolean {
        ut.reverseAndExecute();
        this.undoList.pop();
        return true;
    }

    public replaceTailTransaction(tail: ITransactionBase, t: ITransaction) {
        DebugUtil.assert(
            this.undoList[this.undoList.length - 1] === tail,
            '只能替换栈顶事务',
            'wg',
            '2026-03-05');
        this.undoList[this.undoList.length - 1] = t;
        t.parent = this;
        return true;
    }

    public canUndo(): boolean {
        const ut = this.undoList[this.undoList.length - 1];
        if (!ut) return false;

        if (ut.isTransactionLike(TransactionGroup)) {
            if (ut._undoListNotEmpty()) {
                return ut.canUndo();
            }
            return false;
        } else if (ut.isTransactionLike(Transaction)) {
            return !!ut.canUndo;
        }
        return false;
    }

    public canRedo(): boolean {
        const ut = this.redoList[this.redoList.length - 1];
        if (!ut) return false;

        if (ut.isTransactionLike(TransactionGroup)) {
            if (ut._redoListNotEmpty()) {
                return ut.canRedo();
            }
            return false;
        }

        return true;
    }

    /**
     * undo数组是否为空
     */
    private _undoListNotEmpty() {
        return !!this.undoList.length;
    }

    /**
     * redo是否为空
     */
    private _redoListNotEmpty() {
        return !!this.redoList.length;
    }

    public undo(): boolean {
        const ut = this.undoList[this.undoList.length - 1];
        if (!ut) return false;
        if (ut.isTransactionLike(TransactionGroup)) {
            if (ut._undoListNotEmpty()) {
                return ut.undo();
            }
            return false;
        } else if (ut.isTransactionLike(Transaction)) {
            if (!ut.canUndo) return false;
            ut.reverseAndExecute();
            this.undoList.pop();
            this.redoList.push(ut);
            return true;
        }
        return false;
    }

    public redo(): boolean {
        const ut = this.redoList[this.redoList.length - 1];
        if (!ut) return false;
        if (ut.isTransactionLike(TransactionGroup)) {
            if (ut._redoListNotEmpty()) {
                return ut.redo();
            }
            return false;
        } else if (ut.isTransactionLike(Transaction)) {
            ut.reverseAndExecute();
            this.redoList.pop();
            this.undoList.push(ut);
            return true;
        }
        return false;
    }

    public clearRedoList(): void {
        this.redoList.splice(0);
    }

    public popTransaction(t: ITransactionBase): boolean {
        DebugUtil.assert(this.undoList.pop() === t, '只能pop栈顶事务', 'wg', '2026-03-05');
        return true;
    }

    public getCurrentTransaction(): ITransaction | undefined {
        const t = this.undoList[this.undoList.length - 1];
        if (t && t.isTransactionLike(Transaction) && t.getStatus() === EN_TransactionStatus.STARTED)
            return t;
        return undefined;
    }

    public getCurrentTransactionGroup(): ITransactionGroup | undefined {
        const t = this.undoList.slice(0)
            .reverse()
            .find((i) => i.isTransactionLike(TransactionGroup) && i.getStatus() === EN_TransactionStatus.STARTED);
        if (t && t.isTransactionLike(TransactionGroup)) {
            return t.getCurrentTransactionGroup();
        }
        if (this.getStatus() === EN_TransactionStatus.STARTED) {
            return this;
        }
        return undefined;
    }

    public getLastLeafTransGroup(undoList: boolean): ITransactionGroup | undefined {
        let t: ITransactionBase | undefined;
        if (this.undoList[this.undoList.length - 1]) {
            t = this.undoList[this.undoList.length - 1];
        } else {
            const list = undoList ? this.undoList : this.redoList;
            t = list[list.length - 1];
        }
        if (!t) return this;
        if (t.isTransactionLike(Transaction)) {
            return t.parent;
        }
        if (t.isTransactionLike(TransactionGroup)) {
            return t.getLastLeafTransGroup(undoList);
        }
    }

    public setMaxUndoStackSize(size: number): void {
        this._maxUndoStackSize = size;
    }

    public getMaxUndoStackSize(): number {
        return this._maxUndoStackSize || this.parent?.getMaxUndoStackSize() || 30;
    }

    public collectUsedIds(set: Set<number>): void {
        this.undoList.concat(this.redoList).forEach(t => t.collectUsedIds(set));
    }
}
