export abstract class StateObject {
    /** 脏标识 */
    private _dirty = true;

    /** 注销状态 */
    private _disposed = false;

    /** 脏属性池 */
    protected _dirtyPropsPool = new Map<string, unknown>()

    /**
     * 脏处理
     */
    public dirty(): void {
        this._dirty = true;
    }

    /**
     * 清理脏
     */
    public unDirty(): void {
        this._dirty = false;
    }

    /**
     * 是否脏
     * @returns boolean
     */
    public isDirty(): boolean {
        return this._dirty;
    }

    /**
     * 注销
     */
    public dispose(): void {
        this._disposed = true;
        this._dirtyPropsPool.clear()
    }

    /**
     * 是否注销
     * @returns
     */
    public isDisposed(): boolean {
        return this._disposed;
    }
}
