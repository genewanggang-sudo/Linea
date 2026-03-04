import { ElementId } from '../element/element_id'
import type { IElement, IElementCtor } from '../element/i_element'
import type { ElementMgr } from './element_mgr'

export interface IDocument {
    readonly elementMgr: ElementMgr

    create<T extends IElement>(ctor: IElementCtor<T>): void

    getElementById<T extends IElement>(id: ElementId | number): T | undefined
}
