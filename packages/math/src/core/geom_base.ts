/*
 * Linea Math - Core
 * 几何基类：统一序列化协议
 */

/**
 * 几何基类：统一序列化协议
 * 子类需实现 dump()，静态 load() 由注册表约束
 */
import type { Serialized } from '../serialize'

export abstract class GeomBase {
    public abstract dump(): Serialized
}
