import { ElementId } from '../element/element_id'
import type { IElement } from '../element/i_element'
import { RequestMgr } from '../request/request_mgr';
import { TransactionMgr } from '../transaction/transaction_mgr';
import { IConstructor } from '../types/type_guard';
import type { ElementMgr } from './element_mgr'

export interface IDocument {
    /**对象管理器*/
    readonly elementMgr: ElementMgr

    /**事务管理器*/
    readonly transactionMgr: TransactionMgr;

    readonly requestMgr: RequestMgr

    create<T extends IElement>(ctor: IConstructor<T>): T

    getElementById<T extends IElement>(id: ElementId | number): T | undefined

    /**根据id获取对象*/
    getElementByIdEnsure<T extends IElement>(eleId: ElementId | number): T;

    checkIfCanModifyDoc(): void;
}
