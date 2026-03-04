import type { IElementCtor } from '../element/i_element'
import { ElementMgr } from './element_mgr'
import { IDPool } from './id_pool'

export class Document {
    public readonly elementMgr: ElementMgr

    private _idPool = new IDPool()

    constructor() {
        this.elementMgr = new ElementMgr()
    }

    // TODO 创建、赋值最新id、赋值doc、添加到实例管理器
    public create<T extends IElementCtor>(ctor: T) {
        const ele = new ctor()
        // TODO 设置doc
        const id = this._idPool.genId(ele)
        // TODO 二次尝试
        ele.id = id!
        this.elementMgr.add(ele)
        // TODO 事务相关处理
    }
}
