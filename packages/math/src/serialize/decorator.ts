/*
 * Linea Math - Serialize
 * 自动注册装饰器
 */

import type { Deserializer, Serialized } from './geom_mgr'
import { geomRegistry } from './geom_mgr'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = abstract new (...args: any[]) => unknown

export function RegisterGeom(Ctor: Ctor) {
    const ctor = Ctor as unknown as Deserializer<Serialized, unknown> & { type?: string }
    if (!ctor.type) {
        throw new Error('RegisterGeom: missing static type')
    }
    geomRegistry.register(ctor)
}
