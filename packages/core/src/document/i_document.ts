import { ElementId } from '../element/element_id'
import type { IElement, IElementCtor } from '../element/i_element'
import { TransactionMgr } from '../transaction/transaction_mgr';
import type { ElementMgr } from './element_mgr'

export interface IDocument {
    /**对象管理器*/
    readonly elementMgr: ElementMgr

    /**事务管理器*/
    readonly transactionMgr: TransactionMgr;

    create<T extends IElement>(ctor: IElementCtor<T>): void

    getElementById<T extends IElement>(id: ElementId | number): T | undefined

    /**根据id获取对象*/
    getElementByIdEnsure<T extends IElement>(eleId: ElementId | number): T;

    checkIfCanModifyDoc(): void;
}
