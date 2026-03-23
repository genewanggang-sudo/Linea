import { GNode, IDocument } from '@ccpc/core';

/**
 * 高亮集
 */
export class HighLight {
    private _doc!: IDocument;

    private static _instance: HighLight;

    private _selectedIds: Set<GNode | number> = new Set();

    public static instance() {
        if (!HighLight._instance) {
            HighLight._instance = new HighLight();
        }
        return HighLight._instance;
    }

    public setDoc(doc: IDocument) {
        this._doc = doc;
    }

    public getDoc() {
        return this._doc;
    }

    /**
     * 获取高亮的GNode
     */
    public getActiveGNodes(): GNode[] {
        const result: GNode[] = []
        this._selectedIds.forEach(e => {
            if (typeof e !== 'number') result.push(e)
        })
        return result
    }

    /**
     * 获取高亮的ElementId
     */
    public getActiveElementIds() {
        const result: number[] = [];
        this._selectedIds.forEach(e => {
            if (typeof e === 'number') result.push(e)
        })
        return result
    }

    /**
     * 获取高亮的Element
     */
    public getActiveElements() {
        const ids = this.getActiveElementIds()
        const eles = this._doc.getElementsByIds(ids)
        return eles
    }

    /**
     * 清空高亮集合
     */
    public clear() {
        if (this._selectedIds.size) {
            this._selectedIds.clear();
            // 将变化缓存起来
            this._doc.modelView.cacheForView.cacheHighLight(this)
            // TODO 触发事件
        }
    }

    /**
     * 重置当前高亮集合，并在内容变化时触发视图刷新。
     */
    public reset(gnodes: Array<GNode | number>) {
        const next = new Set(gnodes)
        if (
            next.size === this._selectedIds.size &&
            [...this._selectedIds].every(id => next.has(id))
        ) {
            return
        }
        this._selectedIds.clear()
        gnodes.forEach(_ => this._selectedIds.add(_))
        // TODO 触发事件
        this._doc.modelView.cacheForView.cacheHighLight(this)

    }
}
