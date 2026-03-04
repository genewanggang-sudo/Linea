import { ElementId } from './element_id'
import type { IElement } from './i_element'

export class Element implements IElement {
    public id = ElementId.INVALID

    public name: string = ''

    constructor() {

    }

    public isTemporary() {
        return false;
    }

    public dontSave(): boolean {
        return false;
    }
}
