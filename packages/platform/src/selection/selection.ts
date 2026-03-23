import { ElementId, GNode, IDocument, IElement } from '@ccpc/core';

/**
 * 选择集
 */
export class Selection {
    private static _instance: Selection

    private _doc!: IDocument

    private _selectedIds: number[] = [];

    private _selectedGNodes: GNode[] = [];

    public static instance() {
        if (!Selection._instance) {
            Selection._instance = new Selection();
        }
        return Selection._instance;
    }

    constructor() {
        // TODO 补充事件
    }

    public setDoc(doc: IDocument) {
        this._doc = doc;
    }

    public getDoc(): IDocument {
        return this._doc;
    }

    /**
     * 获取选中的GNodes
     */
    public getSelectedGNodes(): GNode[] {
        return this._selectedGNodes;
    }

    /**
     * 获取所有选中的ElementId
     */
    public getAllSelectedEIds(): number[] {
        const selectedEleIds: number[] = this._selectedIds;
        const result: Set<number> = new Set(selectedEleIds);
        this._selectedGNodes.forEach(g => {
            if (g.elementId.isValid()) result.add(g.elementId.asInt())
        });
        return [...result];
    }

    /**
     * 获取所有选中的Element
     */
    public getAllSelectedElements(): IElement[] {
        const selectedEleIds: number[] = this.getAllSelectedEIds();
        return this._doc.getElementsByIds(selectedEleIds);
    }

    /**
     * 获取不包括GNode的ElementId
     */
    public getSelectedEIds(): Array<ElementId> {
        if (!this._selectedIds.length) return []
        return this._selectedIds.map(_ => new ElementId(_))
    }

    /**
     * 获取不包括GNode的Element
     */
    public getSelectedElements(): Array<IElement> {
        return this._doc.getElementsByIds(this.getSelectedEIds())
    }

    /**
     * 清空高亮集合
     */
    public clear() {
        if (!this._selectedGNodes.length && !this._selectedIds.length) {
            return
        }
        this._selectedGNodes.splice(0)
        this._selectedIds.splice(0)
        this._doc.modelView.cacheForView.cacheSelection(this)
        // TODO 发送事件
    }

    /**
     * 将GNode或者ElementId假如选择集
     */
    public add(ids: number[] | GNode[]) {
        if (!ids.length) return
        let addGNodes: GNode[] = []
        let addEIds: number[] = []
        if (typeof ids[0] === 'number') {
            const numIds = ids as number[]
            addEIds = numIds.filter(id => !this._selectedIds.find(_ => _ === id))
        } else {
            const gNodes = ids as GNode[]
            addGNodes = gNodes.filter(gnode => !this._selectedGNodes.find(_ => _ === gnode))
        }
        if (!addEIds.length && !addGNodes.length) return

        this._selectedIds.push(...addEIds)
        this._selectedGNodes.push(...addGNodes)
        this._doc.modelView.cacheForView.cacheSelection(this)
        // TODO 发送事件
    }

    /**
     * 将对象从选择集去除
     */
    public delete(ids: number[] | GNode[]) {
        if (!ids.length) return
        let success = false
        if (typeof ids[0] === 'number') {
            const numIds = ids as number[]
            for (let i = 0; i < numIds.length; i += 1) {
                const index = this._selectedIds.findIndex(_ => _ === numIds[i])
                if (index > -1) {
                    success = true
                    this._selectedIds.splice(i, 1)
                }
            }

        } else {
            const gNodes = ids as GNode[]
            for (let i = 0; i < gNodes.length; i += 1) {
                const index = this._selectedGNodes.findIndex(_ => _ === gNodes[i])
                if (index > -1) {
                    success = true
                    this._selectedGNodes.splice(index, 1)
                }
            }
        }

        if (success) {
            this._doc.modelView.cacheForView.cacheSelection(this)
            // TODO发送事件
        }
    }

    public reset(ids: number[] | GNode[]) {
        this._selectedIds.splice(0)
        this._selectedGNodes.splice(0)
        this._doc.modelView.cacheForView.cacheSelection(this)

        if (!ids.length) return
        if (typeof ids[0] === 'number') {
            this._selectedIds.push(...new Set(ids as number[]))
        } else {
            this._selectedGNodes.push(...new Set(ids as GNode[]))
        }
        // TODO发送事件
    }
}
