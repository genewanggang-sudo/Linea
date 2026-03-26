import { IDB, IModifiedProps } from './i_element';

export class DB implements IDB {
    private _db: Record<string, unknown> = {}

    private _cache: Record<string, unknown> = {}

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
}
