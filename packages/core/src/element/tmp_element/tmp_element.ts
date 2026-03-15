import { Element } from '../element';
import { RegisterElement } from '../element_decorator';

@RegisterElement('7ac53d95-03ae-484d-9bfd-39755e145a8c')
export class TmpElement extends Element {
    public init() {
        return this
    }

    public dontSave(): boolean {
        return true
    }

    public isTemporary(): boolean {
        return true
    }
}
