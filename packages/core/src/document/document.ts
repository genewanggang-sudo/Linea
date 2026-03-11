import type { IElement } from '../element/i_element'
import type { IDocument } from './i_document'
import { ElementMgr } from './element_mgr'
import { IDPool } from './id_pool'
import { ElementId } from '../element/element_id'
import { TransactionMgr } from '../transaction/transaction_mgr'
import { DebugUtil } from '../toolkit/debug_util'
import { IConstructor } from '../types/type_guard'
import { requestMgr } from '../request/request_mgr'
import { EN_ModelViewChanged } from '../types/type_define'
import { ModelView } from '../model_view/model_view'

export class Document implements IDocument {

    public isMainDoc: boolean = false

    /**是否可以创建对象*/
    public static canCreate = false;

    public readonly idPool = new IDPool()

    public readonly elementMgr: ElementMgr

    public readonly transactionMgr: TransactionMgr

    public readonly requestMgr = requestMgr

    public readonly modelView: ModelView

    constructor() {
        this.elementMgr = new ElementMgr()
        this.transactionMgr = new TransactionMgr()
        this.transactionMgr.init(this)
        this.requestMgr.init(this)
        // TODO 需要测试会不会报错
        this.modelView = new ModelView(this);
    }

    public create<T extends IElement>(ctor: IConstructor<T>): T {
        Document.canCreate = true;
        const e = new ctor();
        e.setDoc(this);

        let id = this.idPool.genId(e);
        if (!id) {
            const usedIds = this.transactionMgr.idPoolGC();
            this.elementMgr.getAllElementIds().forEach(_ => usedIds.add(_));

            this.idPool.reset(usedIds);
            id = this.idPool.genId(e);
        }
        DebugUtil.assert(id, 'Id资源已耗尽', 'wg', '2026-03-05');

        e.id = id;
        Document.canCreate = false;

        DebugUtil.assert(!this.getElementById(e.id), '该Id已存在', 'wg', '2026-03-05');

        if (!e.isTemporary()) {
            this.checkIfCanModifyDoc();
            this.transactionMgr.getCurrentUndoRedoEntity().onElementsAdded([e]);
        }

        this.elementMgr.add(e);
        return e;
    }

    public deleteElementsById(...eIds: Array<number | ElementId>) {
        const elementsToDelete = this.getElementsByIds(eIds);
        if (!elementsToDelete.length) return false;

        if (elementsToDelete.some(_ => !_.isTemporary())) {
            this.checkIfCanModifyDoc()
            this.transactionMgr.getCurrentUndoRedoEntity().onElementsDeleted(elementsToDelete)
        }

        elementsToDelete.forEach(_ => {
            this.elementMgr.delete(_.id.asInt())
        })

        this.cacheForViewElementChanged(EN_ModelViewChanged.ELEMENT_DELETE, elementsToDelete)
        return true
    }

    public getElementById<T extends IElement>(id: ElementId | number): T | undefined {
        const eId = id instanceof ElementId ? id.asInt() : id;
        return this.elementMgr.getElementById<T>(eId)
    }

    public getElementByIdEnsure<T extends IElement>(eleId: ElementId | number): T {
        const eId = eleId instanceof ElementId ? eleId.asInt() : eleId;
        const ele = this.getElementById(eId);
        DebugUtil.assert(ele, `${eId}不存在`, 'wg', '2026-03-05');
        return ele as T;
    }

    public getElementsByIds(eleIds: Array<ElementId | number>) {
        const result: IElement[] = []
        eleIds.forEach(eId => {
            const ele = this.getElementById(eId)
            if (ele) result.push(ele)
        })
        return result
    }

    public checkIfCanModifyDoc(): void {
        DebugUtil.assert(this.transactionMgr.getCurrentTransaction(), '事务外不可修改文档', 'wg', '2025-11-18');
    }

    public cacheForViewElementChanged(evtType: EN_ModelViewChanged, elements: Array<IElement>): void {
        this.modelView.cacheForView.cacheElementChanged(evtType, elements)
    }

    public updateView(_rebuild: boolean = false) {
        this.modelView.updateView()
        return true
    }

    // TODO 补充完整
    public destroy() {

    }
}
