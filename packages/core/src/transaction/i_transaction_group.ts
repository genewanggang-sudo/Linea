import { ITransaction } from './i_transaction'
import { ITransactionBase } from './i_transaction_base'

export interface ITransactionGroup extends ITransactionBase {
    /**是否为根节点*/
    isRoot: boolean

    undoList: ITransactionBase[]

    redoList: ITransactionBase[]

    parent?: ITransactionGroup

    /**在本事务组内启动一个事务/事务组*/
    startTransaction(t: ITransactionBase): void

    /**
     * https://www.revitapidocs.com/2015/65b49d46-88ec-9b8d-cd92-e3d9b2392994.htm
     * Assimilates all inner transactions by merging them into a single undo item.
     */
    assimilate(): ITransaction | undefined

    canUndo(): boolean

    canRedo(): boolean

    undo(): boolean

    redo(): boolean

    clearRedoList(): void

    /**删除一个事务,一般用于删除空事务*/
    popTransaction(t: ITransactionBase): boolean

    /**获取当前事务*/
    getCurrentTransaction(): ITransaction | undefined

    /**获取当前事务组 状态为STARTED的*/
    getCurrentTransactionGroup(): ITransactionGroup | undefined

    /**获取当前叶子节点的事务组*/
    getLastLeafTransGroup(undoList: boolean): ITransactionGroup | undefined

    /**设置undo事务栈的最大长度,只针对根节点有效*/
    setMaxUndoStackSize(size: number): void

    /**获取undo事务栈的最大长度*/
    getMaxUndoStackSize(): number

    /**
     * 替换尾部事务,使用场景:事务组压缩成事务
     * @param tail 当前尾部事务/事务组
     * @param t 替换成的事务
     */
    replaceTailTransaction(tail: ITransactionBase, t: ITransaction): boolean

    undoWithoutRedo(ut: ITransaction): boolean
}
