import { ElementId } from '../element/element_id'
import type { IElement } from '../element/i_element'
import { ModelView } from '../model_view/model_view';
import { RequestMgr } from '../request/request_mgr';
import { TransactionMgr } from '../transaction/transaction_mgr';
import { EN_ModelViewChanged } from '../types/type_define';
import { IConstructor } from '../types/type_guard';
import type { ElementMgr } from './element_mgr'

export interface IDocument {
    /**对象管理器*/
    readonly elementMgr: ElementMgr

    /**事务管理器*/
    readonly transactionMgr: TransactionMgr

    readonly requestMgr: RequestMgr

    readonly modelView: ModelView

    create<T extends IElement>(ctor: IConstructor<T>): T

    deleteElementsById(...ids: Array<number | ElementId>): boolean

    getElementById<T extends IElement>(id: ElementId | number): T | undefined

    /**根据id获取对象*/
    getElementByIdEnsure<T extends IElement>(eleId: ElementId | number): T

    getElementsByIds(eleIds: Array<ElementId | number>): IElement[]

    /**
     * 检测是否允许修改文档
     * 包括增加、删除和修改
     */
    checkIfCanModifyDoc(): void

    /**
     * 缓存模型层视图变化
     */
    cacheForViewElementChanged(evtType: EN_ModelViewChanged, elements: Array<IElement>): void
}
