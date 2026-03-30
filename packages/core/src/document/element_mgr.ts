import type { IElement, IElementCtor } from '../element/i_element'
import { ClassManager } from '../toolkit/class_manager'

export class ElementMgr {
    private static _instance?: ElementMgr
    /**
     * 当前文档中的所有对象
     */
    private readonly _elements = new Map<number, IElement>()

    /**
     * 对象类管理器
     */
    private readonly _eleClsMgr = new ClassManager<string, IElementCtor>()

    public static instance() {
        if (!this._instance) {
            this._instance = new ElementMgr()
        }
        return this._instance
    }

    /**
     * 注册Element
     */
    public registerElement(ctor: string, eleCtor: IElementCtor) {
        this._eleClsMgr.registerCls(ctor, eleCtor)
    }

    /**
     * 根据序列化id获取Element构造函数
     */
    public getElementClsByCtor(ctor: string) {
        return this._eleClsMgr.getCls(ctor)
    }

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

export const elementMgr = ElementMgr.instance()
