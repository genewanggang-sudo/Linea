import type { IElement, IElementCtor } from '../element/i_element'
import { ClassManager } from '../toolkit/class_manager'

export class ElementMgr {
    private static _instance?: ElementMgr
    /**
     * 当前文档中的所有对象
     */
    private readonly _allElements = new Map<number, IElement>()

    /**
     * 序列化id到实例对象的映射
     */
    private readonly _ctorToElements = new Map<string, Set<IElement>>()

    /**
     * 类管理器
     */
    private readonly _eleClsMgr = new ClassManager<string, IElementCtor>()

    public static instance() {
        if (!this._instance) {
            this._instance = new ElementMgr()
        }
        return this._instance
    }

    /**
     * 注册对象
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

    /**
     * 根据id获取element
     */
    public getElementById<T extends IElement>(id: number) {
        return this._allElements.get(id) as T
    }

    /**
     * 获取所有element
     */
    public getAllElements(): IElement[] {
        return [...this._allElements.values()]
    }

    public getAllElementIds(): number[] {
        return [...this._allElements.keys()]
    }

    /**
     * 根据序列化id获取element数组
     */
    public getElementsByCtor(ctor: string) {
        const eles = this._ctorToElements.get(ctor)
        if (!eles) return []
        else return [...eles]
    }

    public add(element: IElement, force = true) {
        if (!force && this._allElements.has(element.id.asInt())) {
            return false
        }
        this._allElements.set(element.id.asInt(), element)

        const eles = this._ctorToElements.get(element.getSerialId())
        if (!eles) {
            this._ctorToElements.set(element.getSerialId(), new Set([element]))
        } else {
            eles.add(element)
        }
        return true
    }

    public delete(id: number) {
        const ele = this._allElements.get(id)
        if (ele) {
            this._allElements.delete(id)
            const eles = this._ctorToElements.get(ele.getSerialId())
            if (eles) eles.delete(ele)
        }
    }

    public clear() {
        this._allElements.clear()
        this._ctorToElements.clear()
    }
}

export const elementMgr = ElementMgr.instance()
