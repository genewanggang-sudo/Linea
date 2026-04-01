import { I_SignalCallbackItem, I_SignalEvent, T_SignalCallbackFn } from '../types/type_define';

export class Signal<S = unknown, D = unknown> {
    public _callbacks: I_SignalCallbackItem<S, D>[] = [];

    constructor(public subject?: S) { }

    /**
     * 事件触发
     * @param 事件参数
     */
    public dispatch(data?: D) {
        const event: I_SignalEvent<S, D> = {
            data,
            subject: this.subject,
        };

        for (const item of this._callbacks) {
            try {
                if (item.listener) {
                    item.fn.call(item.listener, event);
                } else {
                    item.fn(event);
                }
            } catch (e) {
                console.error(e, 'signal error');
            }
        }
    }

    public listen(fn: T_SignalCallbackFn<S, D>, listener?: unknown) {
        const idx = this.getCallbackIndex(fn, listener);
        if (idx < 0) {
            this._callbacks.push({ fn, listener });
        }
    }

    public unlisten(fn: T_SignalCallbackFn<S, D>, listener?: unknown) {
        const idx = this.getCallbackIndex(fn, listener);
        if (idx >= 0) {
            this._callbacks.splice(idx, 1);
        }
    }

    public unlistenAll() {
        this._callbacks.length = 0;
    }

    public dispose() {
        this.unlistenAll();
        this.subject = undefined;
    }

    private getCallbackIndex(fn: T_SignalCallbackFn<S, D>, listener?: unknown) {
        return this._callbacks.findIndex(_ => {
            return _.fn === fn && _.listener === listener;
        });
    }
}
