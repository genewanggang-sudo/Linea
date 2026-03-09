/**
 * 事件的fn状态
 */
export class FnKey {
    private _ctrlKey: boolean;

    private _altKey: boolean;

    private _shiftKey: boolean;

    private _metaKey: boolean;

    constructor(event: MouseEvent | KeyboardEvent) {
        this._ctrlKey = event.ctrlKey;
        this._altKey = event.altKey;
        this._shiftKey = event.shiftKey;
        this._metaKey = event.metaKey;
    }

    public get ctrlKey() {
        return this._ctrlKey;
    }

    public get altKey() {
        return this._altKey;
    }

    public get shiftKey() {
        return this._shiftKey;
    }

    public get metaKey() {
        return this._metaKey;
    }
}
