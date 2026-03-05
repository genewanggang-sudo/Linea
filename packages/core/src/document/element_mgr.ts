import type { IElement } from '../element/i_element'

export class ElementMgr {
    private readonly _elements = new Map<number, IElement>()

    public getElementById<T extends IElement>(id: number) {
        return this._elements.get(id) as T
    }

    public getAllElements(): IElement[] {
        return [...this._elements.values()]
    }

    public getAllElementIds(): number[] {
        return [...this._elements.keys()]
    }

    public add(element: IElement, force = true) {
        if (!force && this._elements.has(element.id.asInt())) {
            return false
        }
        this._elements.set(element.id.asInt(), element)
        return true
    }

    public delete(id: number) {
        return this._elements.delete(id)
    }

    public clear() {
        this._elements.clear()
    }
}
