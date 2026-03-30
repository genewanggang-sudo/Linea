import { ElementId } from '../element/element_id'
import type { IElement } from '../element/i_element'
import { ModelView } from '../model_view/model_view';
import { RequestMgr } from '../request/request_mgr';
import { TransactionMgr } from '../transaction/transaction_mgr';
import { EN_ModelViewChanged } from '../types/type_define';
import { IConstructor } from '../types/type_guard';
import type { ElementMgr } from './element_mgr'
import { IDPool } from './id_pool';

export type IElementFile = {
    ctor: string,
    [key: string]: unknown
}

/**
 * 文档JSON类型
 */
export type IDocFile = {
    id: string,
    doc?: Array<IElementFile>
}

export interface IDocument {

    /**是否为主文档*/
    isMainDoc: boolean

    /**文档唯一标识*/
    id: string

    readonly idPool: IDPool

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
     * 根据序列化id获取Element的类
     */
    // getElementClsByCtor(ctor: string): IElementCtor

    /**
     * 返回文档中满足filter条件的Element
     * filter为空返回所有Element
     */
    filterElements(filter?: (ele: IElement) => boolean): IElement[]

    /**
     * 检测是否允许修改文档
     * 包括增加、删除和修改
     */
    checkIfCanModifyDoc(): void

    /**
     * 缓存模型层视图变化
     */
    cacheForViewElementChanged(evtType: EN_ModelViewChanged, elements: Array<IElement>): void

    updateView(rebuild?: boolean): boolean

    destroy(): void

    dump(): IDocFile

    load(file: IDocFile): this

}
