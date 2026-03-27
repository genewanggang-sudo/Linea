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
            if (json[key] === undefined || json[key] === null)
                continue
            if (Array.isArray(db[key])) {
                // db[key] = this._loadArr()
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

    private _dumpMap(map: Map<unknown, unknown>) {
        const mArr: Array<unknown[]> = [...map]
        for (let i = 0; i < mArr.length; i += 1) {
            const res = this._dumpArr(mArr[i])
            mArr[i] = res
        }
        return this._dumpArr(mArr)
    }

    private _dumpSet(set: Set<unknown>) {
        const sArr = [...set]
        return this._dumpArr(sArr)
    }

    private _dumpAProperty(val: unknown) {
        const type = typeof val
        if (type === 'number' || type == 'string' || type == 'boolean') {
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
}
