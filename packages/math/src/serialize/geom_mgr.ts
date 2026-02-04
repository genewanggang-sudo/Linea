/*
 * Linea Math - Serialize
 * 统一序列化协议与反序列化入口注册表
 */

import type { Ctor } from '../types/type_guard'

/** 序列化结构的最小约束 */
export type DumpData = {
    type: string
}

/** 可序列化对象协议（实例侧） */
export interface IDumpable<TDump extends DumpData = DumpData> {
    dump(): TDump
}

/** 可反序列化类协议（类型注册用） */
export interface ILoadable<TDump extends DumpData, T> {
    readonly type: string
    load(data: TDump): T
}

/**
 * 几何类型管理器：维护可序列化类型的注册与分发
 */
export class GeomMgr {
    private readonly map = new Map<string, ILoadable<DumpData, unknown>>()

    /** 注册类型到反序列化表 */
    public register<TDump extends DumpData, T>(ctor: ILoadable<TDump, T>) {
        this.map.set(ctor.type, ctor as ILoadable<DumpData, unknown>)
        return this
    }

    /** 统一入口反序列化 */
    public load<T>(data: DumpData & Record<string, unknown>) {
        const ctor = this.map.get(data.type)
        if (!ctor) {
            throw new Error(`Unknown type: ${data.type}`)
        }
        return ctor.load(data) as T
    }
}

/** 全局注册表实例 */
export const geomRegistry = new GeomMgr()

/** 装饰器：自动注册几何类型 */
export function RegisterGeom<T extends Ctor & ILoadable<DumpData, unknown>>(Ctor: T) {
    geomRegistry.register(Ctor)
}
