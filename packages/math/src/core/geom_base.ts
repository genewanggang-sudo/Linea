/*
 * Linea Math - Core
 * 几何基类：统一序列化协议
 */

import type { Serializable, Serialized } from '../serialize'

/**
 * 几何基类：统一序列化协议
 * 子类需实现 dump()，静态 load() 由注册表约束
 */
export abstract class GeomBase<TDump extends Serialized = Serialized> implements Serializable<TDump> {
    public abstract dump(): TDump
}
