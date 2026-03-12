export type IConstructor<T> = {
    // eslint-disable-next-line
    new(...args: any[]): T
    prototype: T
}

export type IPrototype<T> = IConstructor<T>['prototype'];
