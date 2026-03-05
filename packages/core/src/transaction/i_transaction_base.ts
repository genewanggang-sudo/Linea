import { IDocument } from '../document/i_document'
import { IConstructor } from '../types/type_guard'
import { ITransactionGroup } from './i_transaction_group'

export enum EN_TransactionStatus {
    /**未启动*/
    NOT_STARTED = 'not-started',
    /**已启动*/
    STARTED = 'started',
    /**已提交*/
    COMMITTED = 'committed',
    /**已回滚*/
    ROLLED_BACK = 'rolled_back',
}

export interface ITransactionBase {
    name: string

    doc: IDocument

    /**
     * 启动事务
     */
    start(): boolean

    /**
     * 启动事务时获取初始化parent
     */
    getStartParent(): ITransactionGroup

    /**
     * 获取事务状态
     */
    getStatus(): EN_TransactionStatus

    /**
     * 修改状态 慎用！！！
     */
    setStatus(status: EN_TransactionStatus): void

    /**
     * 回滚
     */
    rollBack(): boolean

    /**
     * Transaction/TransactionGroup类型推断
     */
    isTransactionLike<T extends ITransactionBase>(this: ITransactionBase, ctor: IConstructor<T>): this is T;

    /**搜集占用的ID*/
    collectUsedIds(set: Set<number>): void
}
