import { IElement, IElementCtor } from './i_element';

export const ElementClass = (ctorStr: string) => {
    return function <T extends IElement>(Ctor: IElementCtor<T>) {
        Ctor.serializedId = {
            ctor: ctorStr,
        }
        const ele = new Ctor();
        const props = Object.keys(ele);
        props.forEach(propName => {
            Object.defineProperty(Ctor.prototype, propName, {
                set(this: T, value: unknown) {
                    const doc = this.getDoc();
                    // TODO 补充方法
                    const ele = doc?.getElementById(this.id);
                    if (ele) {
                        // TODO非临时对象需要在事务中修改
                        if (!ele.isTemporary()) {
                            // 在事务中修改
                            this.cache[propName] = value;
                        } else {
                            this.db[propName] = value;
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
    }
}
