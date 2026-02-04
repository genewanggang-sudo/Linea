/*
 * Linea Math - Serialize
 * 自动注册装饰器
 */

import type { Deserializer, Serialized } from './geom_mgr'
import { geomRegistry } from './geom_mgr'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = abstract new (...args: any[]) => unknown

export function RegisterGeom<T extends Ctor & Deserializer<Serialized, unknown>>(Ctor: T) {
    geomRegistry.register(Ctor)
}
