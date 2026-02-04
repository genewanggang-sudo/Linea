/*
 * Linea Math - Serialize
 * 统一序列化协议与反序列化入口注册表
 */

/** 序列化结构的最小约束 */
export type Serialized = { type: string }

/** 可序列化对象协议（实例侧） */
export interface Serializable<TDump extends Serialized = Serialized> {
    dump(): TDump
}

/** 可反序列化类协议（类型注册用） */
export interface Deserializer<TDump extends Serialized, T> {
    readonly type: string
    load(data: TDump): T
}

/**
 * 几何类型管理器：维护可序列化类型的注册与分发
 */
export class GeomMgr {
    private readonly map = new Map<string, Deserializer<Serialized, unknown>>()

    /** 注册类型到反序列化表 */
    public register<TDump extends Serialized, T>(ctor: Deserializer<TDump, T>) {
        this.map.set(ctor.type, ctor as Deserializer<Serialized, unknown>)
        return this
    }

    /** 统一入口反序列化 */
    public load<T>(data: Serialized & Record<string, unknown>) {
        const ctor = this.map.get(data.type)
        if (!ctor) {
            throw new Error(`Unknown type: ${data.type}`)
        }
        return ctor.load(data) as T
    }
}
