/*
 * Linea Math - Core
 * 几何基类：统一序列化协议
 */

import type { IDB } from '../serialize/dump_types'
import type { IDumpable, ILoadable } from '../serialize/geom_mgr'
import type { Ctor } from '../types/type_guard'

export interface IGeom extends IDumpable {
    getType(): string
    clone(): IGeom
}

export abstract class GeomBase implements IGeom {
    public abstract dump(): IDB
    public abstract clone(): IGeom

    /** 获取实例类型标识 */
    public getType() {
        const ctor = this.constructor as unknown as ILoadable<IDB, unknown>
        return ctor.type
    }

    /**
     * 运行时类型守卫：判断当前实例是否为目标构造器类型。
     * 使用后可触发 TypeScript 类型收窄。
     */
    public isType<T extends GeomBase>(ctor: Ctor<T>): this is T {
        return this instanceof ctor
    }
}
