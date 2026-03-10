import { IDocument } from '../document/i_document'
import { IElement } from '../element/i_element'
import { GRep } from '../grep/grep'
import { IRender } from '../render/i_render'
import { NullRender } from '../render/null_render'
import { EN_ModelViewChanged } from '../types/type_define'
import { ModelChangedCache } from './model_changed_cache'

/**
 * 模型层视图，不依赖具体 UI。
 * 调用 `updateView()` 时，根据缓存的元素变化刷新渲染层。
 */
export class ModelView {
    private _doc: IDocument

    private _renderDirty = true

    private _grepMap = new Map<number, GRep>()

    public iRender: IRender = new NullRender()

    public readonly cacheForView = new ModelChangedCache()

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

            const hasOldGRep = this._grepMap.has(id)
            if (!this._isElementValid(element)) {
                if (hasOldGRep) {
                    this._removeGRep(id)
                }
                continue
            }

            const grep = element.getGRep()
            if (!grep) continue

            if (hasOldGRep) {
                this._updateGRep(grep)
            } else {
                this._addGRep(grep)
            }
        }

        for (const id of deleted) {
            if (this._grepMap.has(id)) {
                this._removeGRep(id)
            }
        }
    }

    private _isElementValid(ele: IElement) {
        if (ele.dontShowView()) return false
        const grep = ele.getGRep()
        return grep && !grep.isEmpty() && ele.isElementVisible()
    }

    private _addGRep(grep: GRep) {
        const eId = grep.elementId.asInt()
        this.iRender.addGRep(grep)
        this._grepMap.set(eId, grep)
        this._renderDirty = true
    }

    private _updateGRep(grep: GRep) {
        const eId = grep.elementId.asInt()
        this.iRender.removeGRep(eId)
        this.iRender.addGRep(grep)
        this._grepMap.set(eId, grep)
        this._renderDirty = true
    }

    private _removeGRep(eId: number) {
        this.iRender.removeGRep(eId)
        this._grepMap.delete(eId)
        this._renderDirty = true
    }
}
