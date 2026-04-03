import { Document } from '../document/document';
import { elementMgr } from '../document/element_mgr';
import { EN_ModelViewChanged } from '../types/type_define';
import { IElement, IElementCtor } from './i_element';

export const RegisterElement = (ctorStr: string) => {
    return function <T extends IElement>(Ctor: IElementCtor<T>) {
        Ctor.serializedId = {
            ctor: ctorStr,
        }
        elementMgr.registerElement(ctorStr, Ctor)
        Document.canCreate = true
        const tmpEle = new Ctor();
        Document.canCreate = false;

        const props = Object.keys(tmpEle).filter(key => !key.startsWith('_'))
        const defaults = new Map<string, unknown>()

        props.forEach(propName => {
            defaults.set(propName, (tmpEle as Record<string, unknown>)[propName])
        })

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

                        if (ele.propShouldCacheToView(propName)) {
                            doc.cacheForViewElementChanged(EN_ModelViewChanged.ELEMENT_UPDATE, [ele])
                        }

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

        // Remove the temp instance's own fields and assign again so the default
        // values are redirected into the prototype accessors we just installed.
        props.forEach(propName => {
            delete (tmpEle as Record<string, unknown>)[propName]
            const value = defaults.get(propName)
            if (value !== undefined) {
                (tmpEle as Record<string, unknown>)[propName] = value
            }
        })
    }
}
