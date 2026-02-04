/*
 * Linea Math - Core
 * 几何基类：统一序列化协议
 */

import type { IDB, IDumpable, ILoadable } from '../serialize'

export interface IGeom extends IDumpable {
    getType(): string
}

export abstract class GeomBase implements IGeom {
    public abstract dump(): IDB

    /** 获取实例类型标识 */
    public getType() {
        const ctor = this.constructor as unknown as ILoadable<IDB, unknown>
        return ctor.type
    }
}
