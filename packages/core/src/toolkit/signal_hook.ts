import { T_SignalCallbackFn } from '../types/type_define';
import { Signal } from './signal';

/**
 * 信号管理工具,便于dispose
 */
export class SignalHook {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _callbacksMap = new Map<Signal<any, any>, T_SignalCallbackFn<any, any>[]>();

    private _listener: unknown;

    public get listener(): unknown {
        return this._listener;
    }

    constructor(_listener?: unknown) {
        this._listener = _listener;
    }

    public listen<T, K>(signal: Signal<T, K>, callback: T_SignalCallbackFn<T, K>): this {
        signal.listen(callback, this._listener);

        let callbacks = this._callbacksMap.get(signal);
        if (!callbacks) {
            callbacks = [];
            this._callbacksMap.set(signal, callbacks);
        }
        callbacks.push(callback);
        return this;
    }

    public unlisten(signal: Signal, callback?: T_SignalCallbackFn): this {
        const callbacks = this._callbacksMap.get(signal) || [];
        const toRemoveCallbacks = callback ? [callback] : callbacks.slice();

        for (const item of toRemoveCallbacks) {
            signal.unlisten(item, this._listener);
            const idx = callbacks.indexOf(item);
            if (idx >= 0) callbacks.splice(idx, 1);
        }

        if (callbacks.length === 0) {
            this._callbacksMap.delete(signal);
        }

        return this;
    }

    public unlistenAll(): this {
        for (const signal of this._callbacksMap.keys()) {
            const callbacks = this._callbacksMap.get(signal) || [];
            for (const item of callbacks) {
                signal.unlisten(item, this._listener);
            }
        }
        this._callbacksMap.clear();
        return this;
    }

    public dispose() {
        this.unlistenAll();
        this._listener = undefined;
    }
}
