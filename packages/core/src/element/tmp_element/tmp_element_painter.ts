import { IDocument } from '../../document/i_document';
import { GRep } from '../../grep/grep';
import { DebugUtil } from '../../toolkit/debug_util';
import { ElementId } from '../element_id';
import { TmpElement } from './tmp_element';

/**
 * 临时元素绘制器
 */
export class TmpElementPainter {

    /**
     * 临时元素id
     */
    private _tmpElementId: ElementId

    private _tmpGRepRemoved = false

    private _doc: IDocument

    constructor(doc: IDocument) {
        this._doc = doc
        this._tmpElementId = this._doc.create(TmpElement).init().id
    }

    public get tmpElement() {
        const ele = this._doc.getElementById(this._tmpElementId)
        DebugUtil.assert(ele, 'ele为空', 'wg', '2026-03-15')
        return ele
    }

    /**
     * 绘制临时元素
     */
    public drawTmpGRep(grep: GRep) {
        grep.canPick = false
        grep.canSnap = false
        this.tmpElement.setGRep(grep)
        this._tmpGRepRemoved = false
    }

    /**
     * 清除临时元素
     */
    public clearTmp() {
        if (this._tmpGRepRemoved) return
        // 打开文档时, action中的临时对象是上一个doc的,取不到
        if (!this._doc.getElementById(this._tmpElementId)) return
        this.drawTmpGRep(GRep.empty)
        this._tmpGRepRemoved = true
        this._doc.updateView()
    }

    /**
     * 销毁
     */
    public destroy() {
        this.clearTmp()
        this._doc.deleteElementsById(this._tmpElementId)
    }

}
