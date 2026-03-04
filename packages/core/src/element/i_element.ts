import { ElementId } from './element_id'

export interface IElement {
    id: ElementId

    name: string

    isTemporary(): boolean

    dontSave(): boolean
}

export type IElementCtor<T extends IElement = IElement> = new () => T
