import { IDocument } from '../document/i_document'
import { IElement } from '../element/i_element'
import { DisplayObjectMgr } from '../grep/display_object_mgr'
import { GRep } from '../grep/grep'
import { GrepDisplay } from '../grep/grep_display'
import { IRender } from '../render/i_render'
import { NullRender } from '../render/null_render'
import { DebugUtil } from '../toolkit/debug_util'
import { EN_ModelViewChanged } from '../types/type_define'
import { ModelChangedCache } from './model_changed_cache'

/**
 * 模型层视图，不依赖具体 UI。
 * 调用 `updateView()` 时，根据缓存的元素变化刷新渲染层。
 */
export class ModelView {
    private _doc: IDocument

    /**标记渲染脏*/
    private _renderDirty = true

    public iRender: IRender = new NullRender()

    public readonly cacheForView = new ModelChangedCache()

    /**
     * eId->did缓存
     */
    private _eid2didMap = new Map<number, number>()

    constructor(doc: IDocument) {
        this._doc = doc
    }

    public updateView() {
        if (!this.cacheForView.isChange()) return

        this._renderDirty = false
        this._updateElements()

        if (this._renderDirty) {
            this.iRender.updateView()
        }
        this.cacheForView.clear()
    }

    private _updateElements() {
        const { container } = this.cacheForView
        const added = container.get(EN_ModelViewChanged.ELEMENT_CREATE)?.keys()
        const modified = container.get(EN_ModelViewChanged.ELEMENT_UPDATE)?.keys()
        const deleted = container.get(EN_ModelViewChanged.ELEMENT_DELETE)?.keys()
        if (!added || !modified || !deleted) return

        for (const id of added) {
            const element = this._doc.getElementById(id)
            if (!element || !this._isElementValid(element)) continue
            this._addGRep(element.getGRep())
        }

        for (const id of modified) {
            const element = this._doc.getElementById(id)
            if (!element) continue

            const grep = element.getGRep()
            if (!this._isElementValid(element)) {
                this._removeGRep(id)
            } else {
                this._updateGRep(grep)
            }
        }

        for (const id of deleted) {
            this._removeGRep(id)
        }
    }

    /**
     * 元素是否有效可显示
     */
    private _isElementValid(ele: IElement) {
        if (ele.dontShowView()) return false
        const grep = ele.getGRep()
        return grep && !grep.isEmpty() && ele.isElementVisible()
    }

    private _addGRep(grep: GRep) {
        const eId = grep.elementId.asInt()
        const display = new GrepDisplay()
        display.gRep = grep
        display.eId = eId
        this._eid2didMap.set(eId, display.id)
        DisplayObjectMgr.instance().addDisplay(display)
        this._renderDirty = true
    }

    private _updateGRep(grep: GRep) {
        const eId = grep.elementId.asInt()
        const did = this._eid2didMap.get(eId)
        let display: GrepDisplay | undefined
        if (!did) {
            display = new GrepDisplay()
            DisplayObjectMgr.instance().addDisplay(display)
            this._eid2didMap.set(eId, display.id)
        } else {
            display = DisplayObjectMgr.instance().getDisplay<GrepDisplay>(did)
            DebugUtil.assert(display, '未查询到display', 'wg', '2026-03-12')
        }
        display.gRep = grep
        display.eId = eId
        this._renderDirty = true
    }

    private _removeGRep(eId: number) {
        const did = this._eid2didMap.get(eId)
        if (did) {
            DisplayObjectMgr.instance().removeDisplayById(did)
            this._eid2didMap.delete(eId)
            this._renderDirty = true
        }

    }
}
