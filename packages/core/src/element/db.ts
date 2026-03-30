import { Document } from '../document/document';
import { DebugUtil } from '../toolkit/debug_util';
import { EN_DontSavePropPrefix, IJSON } from '../types/type_define';
import { IConstructor } from '../types/type_guard';
import { IDB, IDumpLoad, IModifiedProps } from './i_element';

export class DB implements IDB {
    private _db: IJSON = {}

    private _cache: IJSON = {}

    public get db() {
        return this._db
    }

    public get cache() {
        return this._cache
    }

    /**
     * 获取修改的数据
     */
    public getModified(): IModifiedProps[] {
        const result: IModifiedProps[] = [];
        for (const propName in this._cache) {
            result.push({
                propertyName: propName,
                oldValue: this._db[propName],
                newValue: this._cache[propName],
            });
        }
        return result;
    }

    /**
     * 数据入库
     */
    public commit() {
        for (const key in this._cache) {
            this.db[key] = this._cache[key];
        }
        this._clearCache();
    }

    /**
     * 数据回滚
     */
    public rollBack() {
        this._clearCache();
    }

    /**
     * 清空缓存
     */
    private _clearCache() {
        this._cache = {}
    }

    public ownKeys() {
        const set = new Set([...Object.keys(this._db), ...Object.keys(this._cache)])
        return [...set]
    }

    public dump(): IJSON {
        if (Object.keys(this._cache).length) {
            return {
                ...this._dumpData(this._db),
                ...this._dumpData(this._cache),
            }
        }
        return this._dumpData(this._db)
    }

    public load(json: IJSON) {
        const db = this._db
        for (const key of this.ownKeys()) {
            if (key.startsWith(EN_DontSavePropPrefix.UNDER_SCORE) || key.startsWith(EN_DontSavePropPrefix.C_UNDER_SCORE))
                continue
            const val1 = db[key]
            const val2 = json[key]
            if (val2 === undefined || val2 === null)
                continue
            if (Array.isArray(val1)) {
                const first: unknown = val1[0]
                db[key] = this._loadArr(val2 as Array<unknown>, first)
            } else if (val1 instanceof Map) {
                db[key] = this._loadMap(val2 as Array<unknown[]>, val1)
            } else if (val1 instanceof Set) {
                const first = [...val1.values()] as Array<unknown>[0]
                db[key] = this._loadSet(val2 as Array<unknown>, first)
            } else if (this._isDumpLoad(val1)) {
                const newVal = new (val1.constructor as IConstructor<IDumpLoad>)()
                newVal.load(val2)
                db[key] = newVal
            } else {
                db[key] = val2
            }
        }
    }

    private _dumpData(data: IJSON): IJSON {
        Document.canCreate = true
        const defualtVal = new (this.constructor as IConstructor<DB>)() as unknown as IJSON
        Document.canCreate = false
        const result: IJSON = {}
        Object.keys(data).forEach(key => {
            if (key.startsWith(EN_DontSavePropPrefix.UNDER_SCORE) || key.startsWith(EN_DontSavePropPrefix.C_UNDER_SCORE)) {
                return
            }
            const val1 = defualtVal[key]
            const val2 = data[key]
            if (Array.isArray(val2)) {
                const res1 = this._dumpArr(val1 as Array<unknown>)
                const res2 = this._dumpArr(val2 as Array<unknown>)
                if (JSON.stringify(res1) === JSON.stringify(res2)) return
                result[key] = res2
            } else if (val2 instanceof Map) {
                const res1 = this._dumpMap(val1 as Map<unknown, unknown>)
                const res2 = this._dumpMap(val2 as Map<unknown, unknown>)
                if (JSON.stringify(res1) === JSON.stringify(res2)) return
                result[key] = res2
            } else if (val2 instanceof Set) {
                const res1 = this._dumpSet(val1 as Set<unknown>)
                const res2 = this._dumpSet(val2 as Set<unknown>)
                if (JSON.stringify(res1) === JSON.stringify(res2)) return
                result[key] = res2
            } else {
                const res1 = this._dumpAProperty(val1)
                const res2 = this._dumpAProperty(val2)
                if (JSON.stringify(res1) === JSON.stringify(res2)) return
                result[key] = res2
            }
        })
        return result
    }

    private _dumpArr(arr: Array<unknown>) {
        const arr1 = [...arr]
        for (let i = 0; i < arr1.length; i += 1) {
            const item = arr[i]
            if (item instanceof Array) {
                arr1[i] = this._dumpArr(item)
            } else {
                arr1[i] = this._dumpAProperty(item)
            }
        }
        return arr1
    }

    /**
     * 加载数组
     * @param arr JSON中的数组
     * @param first 参考数组中的第一个值
     * 数组中元素当前只支持dump、load对象和基础类型
     */
    private _loadArr(arr: Array<unknown>, first: unknown): Array<unknown> {
        if (!arr.length) {
            return []
        }
        if (Array.isArray(first)) {
            return arr.map(val => {
                return this._loadArr(val as Array<unknown>, first[0])
            })
        } else {
            return arr.map(val => {
                if (this._isDumpLoad(first)) {
                    const Ctor = first.constructor as IConstructor<IDumpLoad>
                    const newVal = new Ctor()
                    newVal.load(val)
                    return newVal
                } else {
                    const valType = typeof val
                    if (valType === 'string' || valType === 'boolean' || valType === 'number') {
                        return val
                    } else {
                        DebugUtil.assert(false, '暂不支持的类型', 'wg', '2026-03-29')
                    }
                }
            })
        }
    }

    private _dumpMap(map: Map<unknown, unknown>) {
        const mArr: Array<unknown[]> = [...map]
        for (let i = 0; i < mArr.length; i += 1) {
            const res = this._dumpArr(mArr[i])
            mArr[i] = res
        }
        return this._dumpArr(mArr)
    }

    /**
     * Map中的元素支持dump、load对象和基础元素类型
     */
    private _loadMap(jsonMap: Array<unknown[]>, dbMap: Map<unknown, unknown>) {
        if (!dbMap.size) {
            DebugUtil.assert(false, 'DB数据需要提供初始值', 'wg', '2026-03-29')
        }

        const map = new Map()
        for (const [key, val] of jsonMap) {
            const dbVal = dbMap.get(key)
            if (this._isDumpLoad(dbVal)) {
                const newVal = new (dbVal.constructor as IConstructor<IDumpLoad>)()
                newVal.load(val)
                map.set(key, newVal)
            } else if (this._isBasicType(dbVal)) {
                map.set(key, val)
            } else {
                DebugUtil.assert(false, '不支持的类型', 'wg', '2026-03-29')
            }
        }
        return map
    }

    private _dumpSet(set: Set<unknown>) {
        const sArr = [...set]
        return this._dumpArr(sArr)
    }

    /**
     * 当前Set只支持里面所有元素为同一类型
     */
    private _loadSet(setArr: Array<unknown>, first: unknown) {
        const set = new Set<unknown>()
        for (const val of setArr) {
            if (this._isDumpLoad(first)) {
                const Ctor = (first.constructor as IConstructor<IDumpLoad>)
                const newVal = new Ctor()
                newVal.load(val)
                set.add(newVal)
            } else if (this._isBasicType(first)) {
                set.add(val)
            } else {
                DebugUtil.assert(false, '不支持的数据类型', 'wg', '2026-03-29')
            }
        }
        return set
    }

    private _dumpAProperty(val: unknown) {
        if (this._isBasicType(val)) {
            return val
        }
        if (this._isDumpLoad(val)) {
            return val.dump()
        }
        if (val instanceof Array || val instanceof Map || val instanceof Set) {
            DebugUtil.assert(false, '不支持的数据类型', 'wg', '2026-03-27')
        }
    }

    private _isDumpLoad(obj: unknown): obj is IDumpLoad {
        return !!obj &&
            (obj as IDumpLoad).dump instanceof Function &&
            (obj as IDumpLoad).load instanceof Function
    }

    private _isBasicType(obj: unknown) {
        const type = typeof obj
        if (type === 'string' || type === 'number' || type === 'boolean') {
            return true
        }
        return false
    }
}
