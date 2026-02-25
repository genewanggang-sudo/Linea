/*
 * Linea Math - Serialize
 * 统一的 dump/load 注册中心
 */

import type { Ctor } from '../types/type_guard'
import { MathError } from '../utils/math_error'
import type { IDB } from './dump_types'

/** 实例侧 dump 协议 */
export interface IDumpable<TDump extends IDB = IDB> {
    dump(): TDump
}

/** 静态侧 load 协议 */
export interface ILoadable<TDump extends IDB, T> {
    readonly type: string
    load(data: TDump): T
}

/** 几何类型管理器 */
export class GeomMgr {
    private readonly map = new Map<string, ILoadable<IDB, unknown>>()

    /** 注册可加载类型构造器 */
    public register<TDump extends IDB, T>(ctor: ILoadable<TDump, T>) {
        this.map.set(ctor.type, ctor as ILoadable<IDB, unknown>)
        return this
    }

    /** 统一加载入口 */
    public load<T>(data: IDB & Record<string, unknown>) {
        const ctor = this.map.get(data.type)
        if (!ctor) {
            MathError.throw(`GeomMgr.load: unknown type ${data.type}`)
        }
        return ctor.load(data) as T
    }
}

/** 全局注册中心 */
export const geomMgr = new GeomMgr()

/** 自动注册装饰器 */
export function RegisterGeom<T extends Ctor & ILoadable<IDB, unknown>>(Ctor: T) {
    geomMgr.register(Ctor)
}
