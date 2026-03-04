import type { IElement } from './i_element'

export class Element implements IElement {
    public readonly id: number
    public name: string

    constructor(id: number, name: string) {
        this.id = id
        this.name = name
    }
}
