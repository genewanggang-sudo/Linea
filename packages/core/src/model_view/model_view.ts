import { IDocument } from '../document/i_document';
import { IElement } from '../element/i_element';
import { GRep } from '../grep/grep';
import { IRender } from '../render/i_render';
import { NullRender } from '../render/null_render';
import { EN_ModelViewChanged } from '../types/type_define';
import { ModelChangedCache } from './model_changed_cache';

/**
 * 模型层视图,与UI无关
 * 将刷新视图的接口开放给用户,主动调updateView刷新,否则缓存
 */
export class ModelView {
    private _doc: IDocument

    private _renderDirty: boolean = true

    public iRender: IRender = new NullRender()

    public readonly cacheForView = new ModelChangedCache()

    constructor(doc: IDocument) {
        this._doc = doc
    }

    // // TODO 立即刷新
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
        const added = container.get(EN_ModelViewChanged.ELEMENT_CREATE)?.keys();
        const modified = container.get(EN_ModelViewChanged.ELEMENT_UPDATE)?.keys();
        const deleted = container.get(EN_ModelViewChanged.ELEMENT_DELETE)?.keys();
        if (!added || !modified || !deleted) return
        for (const id of added) {
            const element = this._doc.getElementById(id)
            if (!element) continue
            const grep = element.getGRep()
            if (!grep) continue;
            if (this._isElementValid(element)) {
                this._addGrep(grep);
            }
        }
        for (const id of modified) {
            const element = this._doc.getElementById(id);
            if (!element) continue;
            const grep = element.getGRep();
            //空的grep应该走remove流程
            if (!this._isElementValid(element)) {
                this._removeGRep(id);
            } else {
                this._updateGRep(grep);
            }
        }
        for (const id of deleted) {
            this._removeGRep(id)
        }
    }

    private _isElementValid(ele: IElement) {
        if (ele.dontShowView()) return false
        const grep = ele.getGRep()
        return grep && !grep.isEmpty() && ele.isElementVisible()
    }

    private _addGrep(grep: GRep) {
        this.iRender.addGRep(grep)
        this._renderDirty = true
    }

    private _updateGRep(grep: GRep) {
        const eId = grep.elementId.asInt()
        this.iRender.removeGRep(eId)
        this.iRender.addGRep(grep);
        this._renderDirty = true
    }

    private _removeGRep(eId: number) {
        this.iRender.removeGRep(eId)
        this._renderDirty = true
    }
}
