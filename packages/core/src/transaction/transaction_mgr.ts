import { IDocument } from '../document/i_document';
import { DebugUtil } from '../toolkit/debug_util';
import { ITransaction } from './i_transaction';
import { ITransactionGroup } from './i_transaction_group';
import { TransactionGroup } from './transaction_group';
import { UndoRedoEntity } from './undo_redo_entity';

/**
 * 事务管理器
 */
export class TransactionMgr {
    /**事务树的根节点*/
    private _rootNode!: ITransactionGroup;

    public init(doc: IDocument) {
        this._rootNode = new TransactionGroup(doc, 'root', true);
        this.setMaxUndoStackSize(50);
    }

    /**
     * 清空事务树
     */
    public clear() {
        this._rootNode.undoList.splice(0);
        this._rootNode.clearRedoList();
    }

    /**
     * 设置最大回撤步数
     */
    public setMaxUndoStackSize(size: number) {
        this._rootNode.setMaxUndoStackSize(size);
    }

    /**
     * 获取当前正在进行的事务
     */
    public getCurrentTransaction(): ITransaction | undefined {
        const group = this._rootNode.getCurrentTransactionGroup();
        if (!group) return undefined;
        return group.getCurrentTransaction();
    }

    /**
     * 获取当前事务组
     */
    public getCurrentTransactionGroup(): ITransactionGroup | undefined {
        return this._rootNode.getCurrentTransactionGroup();
    }

    /**
     * 获取最后的叶子节点事务组
     */
    public getLastLeafTranGroup(undoList: boolean): ITransactionGroup | undefined {
        return this._rootNode.getLastLeafTransGroup(undoList);
    }

    /**
     * 获取当前正在进行的事务的undoRedoEntity
     */
    public getCurrentUndoRedoEntity(): UndoRedoEntity {
        const transaction = this.getCurrentTransaction();
        DebugUtil.assert(transaction, '没有事务', 'wg', '2025-11-18');
        return transaction.undoRedoEntity;
    }

    /**
     * 撤销
     */
    public undo() {
        const result = !!this.getLastLeafTranGroup(true)?.undo();
        return result;
    }

    /**
     * 回退
     */
    public redo() {
        const result = !!this.getLastLeafTranGroup(false)?.redo();
        return result;
    }

    /**
     * 是否可撤销
     */
    public canUndo() {
        return !!this.getLastLeafTranGroup(true)?.canUndo();
    }

    /**
     * 是否可回退
     */
    public canRedo() {
        return !!this.getLastLeafTranGroup(false)?.canRedo();
    }

    public idPoolGC(): Set<number> {
        const set = new Set<number>();
        this._rootNode.collectUsedIds(set);
        return set;
    }
}
