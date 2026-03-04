import { ElementId } from './element_id'
import type { IElement, T_SerializedId } from './i_element'
import type { IDocument } from '../document/i_document'

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
