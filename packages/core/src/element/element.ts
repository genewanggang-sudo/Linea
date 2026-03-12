import { ElementId } from './element_id'
import { EN_VIEW_CACHE_PROPS, type IElement, type IModifiedProps, type T_SerializedId } from './i_element'
import type { IDocument } from '../document/i_document'
import { DebugUtil } from '../toolkit/debug_util';
import { Document } from '../document/document';
import { GRep } from '../grep/grep';

// TODO 补充dump load方法,统一处理? 每个类单独写?
export class Element implements IElement {

    /**
     * 保存到文档中的序列化Id
     */
    public static serializedId: T_SerializedId;

    private _db: Record<string, unknown> = {}

    private _cache: Record<string, unknown> = {}

    private _doc!: IDocument

    public id = ElementId.INVALID

    public name: string = ''

    public visible = true;

    public C_GRep = GRep.empty

    constructor() {
        DebugUtil.assert(Document.canCreate, '创建Element必须通过Document.create方法', 'wg', '2025-11-18');
    }

    public get db() {
        return this._db
    }

    public get cache() {
        return this._cache
    }

    public getDoc() {
        return this._doc
    }

    public setDoc(doc: IDocument) {
        this._doc = doc
    }

    /**
     * 获取修改的数据
     */
    public getModified(): IModifiedProps[] {
        const result: IModifiedProps[] = [];
        for (const propName in this._cache) {
            result.push({
                propertyName: propName,
                oldValue: this._db[propName],
                newValue: this._cache[propName],
            });
        }
        return result;
    }

    /**
     * 数据入库
     */
    public commit() {
        for (const key in this._cache) {
            this.db[key] = this._cache[key];
        }
        this._clearCache();
    }

    /**
     * 数据回滚
     */
    public rollBack() {
        this._clearCache();
    }

    /**
     * 清空缓存
     */
    private _clearCache() {
        this._cache = {}
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
        this._db.C_GRep = new GRep();
    }

    public getGRep() {
        const grep = this.C_GRep
        if (!grep.elementId.isValid()) {
            grep.elementId = this.id
        }
        return grep
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
}
