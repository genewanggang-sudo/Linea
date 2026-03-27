import { ElementId } from './element_id'
import { EN_VIEW_CACHE_PROPS, type IElement, type T_SerializedId } from './i_element'
import type { IDocument } from '../document/i_document'
import { DebugUtil } from '../toolkit/debug_util';
import { Document } from '../document/document';
import { GRep } from '../grep/grep';
import { StyleUtils } from '../grep/style_utils';
import { DB } from './db';
import { IConstructor } from '../types/type_guard';

// TODO 补充dump load方法,统一处理? 每个类单独写?
export class Element extends DB implements IElement {
    /**
     * 保存到文档中的序列化Id
     */
    public static serializedId: T_SerializedId;

    public id = ElementId.INVALID

    public name: string = ''

    private _doc!: IDocument

    public visible = true;

    public C_GRep = GRep.empty

    constructor() {
        super()
        DebugUtil.assert(Document.canCreate, '创建Element必须通过Document.create方法', 'wg', '2025-11-18');
    }

    public getDoc() {
        return this._doc
    }

    public setDoc(doc: IDocument) {
        this._doc = doc
    }

    /**
     * 空构造+初始化
     */
    public init(..._params: unknown[]) {
        return this
    }

    /**
     * 获取序列化的id
     */
    public getSerialId() {
        return (this.constructor as typeof Element).serializedId.ctor;
    }

    /**
     * 重置缓存的 GRep，强制后续重新生成图形表示。
     */
    public markGRepDirty() {
        this.C_GRep = new GRep()
    }

    /**
     * 获取GRep显示对象
     */
    public getGRep() {
        const grep = this.C_GRep
        if (!grep.elementId.isValid()) {
            grep.elementId = this.id
        }
        return grep
    }

    public getGRepWhenSelected(): GRep {
        const grep = this.getGRep()
        if (!grep || grep.isEmpty()) {
            return new GRep()
        }

        const cloned = grep.clone()
        cloned.traverse(gnode => {
            gnode.setStyle(StyleUtils.mergeStateStyle(gnode.getStyle(), StyleUtils.defaultSelectionStyle))
        })
        return cloned
    }

    public getGRepWhenActive(): GRep {
        const grep = this.getGRep()
        if (!grep || grep.isEmpty()) {
            return new GRep()
        }

        const cloned = grep.clone()
        cloned.traverse(gnode => {
            gnode.setStyle(StyleUtils.mergeStateStyle(gnode.getStyle(), StyleUtils.defaultActiveStyle))
        })
        return cloned
    }

    /**
     * 设置GRep显示对象
     */
    public setGRep(grep: GRep) {
        grep.elementId = this.id
        if (this.C_GRep === grep) {
            grep.clearRenderNode()
        }
        this.C_GRep = grep
        return true
    }

    public isElementVisible() {
        // TODO 补充完整
        return this.visible
    }

    /**
     * 是否为临时对象
     * 临时对象不受事务监管
     */
    public isTemporary() {
        return false
    }

    public dontSave(): boolean {
        return false
    }

    public dontShowView() {
        return false
    }

    /**
     * 属性变化是否应该缓存到视图
     */
    public propShouldCacheToView(propName: string) {
        if (
            propName === EN_VIEW_CACHE_PROPS.C_GREP ||
            propName === EN_VIEW_CACHE_PROPS.VISIBLE
        ) {
            if (!this.dontShowView()) return true
        }
        return false
    }

    public clone() {
        const ele = this._doc.create(this.constructor as IConstructor<this>)
        const data = this.dump()
        delete data.id
        ele.load(data)
        return ele
    }
}
