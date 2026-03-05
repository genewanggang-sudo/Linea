import { Document } from '../document/document';
import { IElement, IElementCtor } from './i_element';

export const ElementClass = (ctorStr: string) => {
    return function <T extends IElement>(Ctor: IElementCtor<T>) {
        Ctor.serializedId = {
            ctor: ctorStr,
        }
        Document.canCreate = true
        const ele = new Ctor();
        Document.canCreate = false;
        const props = Object.keys(ele);
        props.forEach(propName => {
            Object.defineProperty(Ctor.prototype, propName, {
                set(this: T, value: unknown) {
                    const doc = this.getDoc();
                    const ele = doc?.getElementById(this.id);
                    if (ele) {
                        if (!ele.isTemporary()) {
                            doc.checkIfCanModifyDoc();
                            doc.transactionMgr.getCurrentUndoRedoEntity().onElementsUpdated([ele])
                            this.cache[propName] = value;
                        } else {
                            this.db[propName] = value;
                        }
                        // TODO 视图更新
                    } else {
                        this.db[propName] = value;
                    }
                },
                get(this: T) {
                    if (this.cache[propName] !== undefined) {
                        return this.cache[propName]
                    }
                    return this.db[propName]
                },
            })
        })
    }
}
