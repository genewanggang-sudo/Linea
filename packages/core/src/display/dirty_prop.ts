import { IPrototype } from '../types/type_guard';
import type { StateObject } from './state_object';

export function dirtyProp<T extends StateObject>(equals?: (o: unknown, n: unknown) => boolean) {
    return function (target: IPrototype<T>, fieldName: string) {
        const privateName = `_${fieldName}`;
        Object.defineProperty(
            target,
            fieldName,
            {
                get(this: T) {
                    return this._dirtyPropsPool.get(privateName)
                },
                set(this: T, value: unknown) {
                    const oldVal = this._dirtyPropsPool.get(privateName)
                    if (equals) {
                        if (!equals(oldVal, value)) {
                            this.dirty();
                        }
                    } else {
                        if (oldVal !== value) {
                            this.dirty();
                        }
                    }
                    this._dirtyPropsPool.set(privateName, value)
                },
            },
        );
    };
}
