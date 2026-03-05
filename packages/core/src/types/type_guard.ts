export type IConstructor<T> = {
    // eslint-disable-next-line
    new(...args: any[]): T
    prototype: T
}
