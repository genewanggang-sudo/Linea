import { IDocument } from '../document/i_document'
import { ElementId } from './element_id'

export interface IElement {
    id: ElementId

    name: string

    readonly db: Record<string, unknown>

    readonly cache: Record<string, unknown>

    getDoc(): IDocument

    setDoc(doc: IDocument): void

    getModified(): IModifiedProps[]

    commit(): void

    rollBack(): void

    getSerialId(): string

    isTemporary(): boolean

    dontSave(): boolean
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
