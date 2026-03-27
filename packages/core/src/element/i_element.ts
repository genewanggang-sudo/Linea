import { IDocument } from '../document/i_document'
import { GRep } from '../grep/grep'
import { IJSON } from '../types/type_define';
import { ElementId } from './element_id'

export type IModifiedProps = {
    propertyName: string;
    oldValue: unknown;
    newValue: unknown;
}

export interface IDB {
    readonly db: Record<string, unknown>

    readonly cache: Record<string, unknown>

    getModified(): IModifiedProps[]

    commit(): void

    rollBack(): void

    dump(): IJSON

    load(val: IJSON): void
}

export interface IElement extends IDB {
    id: ElementId

    name: string

    getDoc(): IDocument

    setDoc(doc: IDocument): void

    init(...params: unknown[]): this

    getSerialId(): string

    getGRep(): GRep

    /**
     * 获取选中GRep
     */
    getGRepWhenSelected(): GRep

    /**
     * 获取高亮GRep
     */
    getGRepWhenActive(): GRep

    setGRep(grep: GRep): boolean

    isElementVisible(): boolean

    isTemporary(): boolean

    dontSave(): boolean

    dontShowView(): boolean

    propShouldCacheToView(propName: string): boolean

    clone(): this

}

export type T_SerializedId = {
    /**类序列化的唯一标识*/
    ctor: string
}

export type IElementCtor<T extends IElement = IElement> = {
    new(): T

    serializedId: T_SerializedId
}

export const EN_VIEW_CACHE_PROPS = {
    C_GREP: 'C_GRep',
    VISIBLE: 'visible',
} as const;

export type IDumpLoad = {
    dump(): unknown,
    load(val: unknown): void
}
