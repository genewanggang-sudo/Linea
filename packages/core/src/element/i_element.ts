import { IDocument } from '../document/i_document'
import { GRep } from '../grep/grep'
import { ElementId } from './element_id'

export interface IElement {
    id: ElementId

    name: string

    readonly db: Record<string, unknown>

    readonly cache: Record<string, unknown>

    getDoc(): IDocument

    setDoc(doc: IDocument): void

    init(...params: unknown[]): this

    getModified(): IModifiedProps[]

    commit(): void

    rollBack(): void

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

}

export type T_SerializedId = {
    /**类序列化的唯一标识*/
    ctor: string
}

export type IElementCtor<T extends IElement = IElement> = {
    new(): T

    serializedId: T_SerializedId
}

export type IModifiedProps = {
    propertyName: string;
    oldValue: unknown;
    newValue: unknown;
}

export const EN_VIEW_CACHE_PROPS = {
    C_GREP: 'C_GRep',
    VISIBLE: 'visible',
} as const;
