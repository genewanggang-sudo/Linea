import type { IElement, IElementCtor } from '../element/i_element'
import type { IDocument } from './i_document'
import { ElementMgr } from './element_mgr'
import { IDPool } from './id_pool'
import { ElementId } from '../element/element_id'
import { TransactionMgr } from '../transaction/transaction_mgr'
import { DebugUtil } from '../toolkit/debug_util'

export class Document implements IDocument {

    /**是否可以创建对象*/
    public static canCreate = false;

    public readonly idPool = new IDPool()

    public readonly elementMgr: ElementMgr

    public readonly transactionMgr: TransactionMgr;

    constructor() {
        this.elementMgr = new ElementMgr()
        this.transactionMgr = new TransactionMgr();
        this.transactionMgr.init(this);
    }

    public create<T extends IElementCtor>(ctor: T) {
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

        e.id = id!;
        Document.canCreate = false;

        DebugUtil.assert(!this.getElementById(e.id), '该Id已存在', 'wg', '2026-03-05');

        if (!e.isTemporary()) {
            this.checkIfCanModifyDoc();
            this.transactionMgr.getCurrentUndoRedoEntity().onElementsAdded([e]);
        }

        this.elementMgr.add(e);
        return e;
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

    public checkIfCanModifyDoc(): void {
        DebugUtil.assert(this.transactionMgr.getCurrentTransaction(), '事务外不可修改文档', 'wg', '2025-11-18');
    }
}
