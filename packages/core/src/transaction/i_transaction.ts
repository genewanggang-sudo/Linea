import { ITransactionBase } from './i_transaction_base'
import { ITransactionGroup } from './i_transaction_group'
import { UndoRedoEntity } from './undo_redo_entity'

export interface ITransaction extends ITransactionBase {
    readonly undoRedoEntity: UndoRedoEntity

    canUndo: boolean

    parent: ITransactionGroup

    /**
     * 提交
     */
    commit(): boolean

    /**
     * 内部数据反向并执行,Transaction特有的方法
     */
    reverseAndExecute(): void

    /**
     * 合并
     */
    merge(another: ITransaction): this
}
