import type { IElement, IElementCtor } from '../element/i_element'
import type { IDocument } from './i_document'
import { ElementMgr } from './element_mgr'
import { IDPool } from './id_pool'
import { ElementId } from '../element/element_id'

export class Document implements IDocument {
    public readonly elementMgr: ElementMgr

    public readonly idPool = new IDPool()

    constructor() {
        this.elementMgr = new ElementMgr()
    }

    // TODO 创建、赋值最新id、赋值doc、添加到实例管理器
    public create<T extends IElementCtor>(ctor: T) {
        const ele = new ctor()
        // TODO 设置doc
        const id = this.idPool.genId(ele)
        // TODO 二次尝试
        ele.id = id!
        this.elementMgr.add(ele)
        // TODO 事务相关处理
    }

    public getElementById<T extends IElement>(id: ElementId | number): T | undefined {
        const eId = id instanceof ElementId ? id.asInt() : id;
        return this.elementMgr.getElementById<T>(eId)
    }
}
