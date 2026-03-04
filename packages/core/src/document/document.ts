import { ElementMgr } from './element_mgr'

export class Document {
    public readonly elementMgr: ElementMgr

    constructor() {
        this.elementMgr = new ElementMgr()
    }
}
