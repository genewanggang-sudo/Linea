import { EN_DontSavePropPrefix, IJSON } from '../types/type_define';
import { IConstructor } from '../types/type_guard';
import { IDB, IModifiedProps } from './i_element';

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

    // public ownKeys() {
    //     const set = new Set([...Object.keys(this._db), ...Object.keys(this._cache)])
    //     return [...set]
    // }

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

    }

    public _dumpData(data: IJSON): IJSON {
        const defualtVal = new (this.constructor as IConstructor<DB>)() as unknown as IJSON
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
                const res1 = this._dumpMap(val1 as Map<string, unknown>)
                const res2 = this._dumpMap(val2 as Map<string, unknown>)
                if (JSON.stringify(res1) === JSON.stringify(res2)) return
                result[key] = res2
            } else if (val2 instanceof Set) {
                const res1 = this._dumpSet(val1 as Set<unknown>)
                const res2 = this._dumpSet(val2 as Set<unknown>)
                if (JSON.stringify(val1) === JSON.stringify(res2)) return
                result[key] = res2
            } else {

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

    private _dumpMap(map: Map<string, unknown>) {

    }

    private _dumpSet(set: Set<unknown>) {

    }

    private _dumpAProperty(val: unknown) {

    }
}
