import { ElementId } from './element_id'
import type { IElement, IModifiedProps, T_SerializedId } from './i_element'
import type { IDocument } from '../document/i_document'
import { DebugUtil } from '../toolkit/debug_util';
import { Document } from '../document/document';

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

    public isTemporary() {
        return false
    }

    public dontSave(): boolean {
        return false
    }
}
