import { ElementId } from '../element/element_id';
import type { IElement } from '../element/i_element';
import { DebugUtil } from '../toolkit/debug_util';

export class IDPool {
    public static readonly MAX_TMP_NUM = 1000;

    public static readonly MAX_TMP_OFFSET = 2 ** 32 - IDPool.MAX_TMP_NUM;

    public static readonly MAX_UNSTABLE_NUM = 1e6;

    public static readonly MAX_UNSTABLE_OFFSET = 2 ** 32 - IDPool.MAX_UNSTABLE_NUM - IDPool.MAX_TMP_NUM;

    private _unstablePool: number[] = [];

    private _tmpPool: number[] = [];

    private _currentStableIndex: number = 0;

    constructor() {
        this.reset();
    }

    public reset(usedIds?: Set<number>) {
        this._unstablePool.splice(0);
        for (let i = 0; i < IDPool.MAX_UNSTABLE_NUM; i++) {
            const id = IDPool.MAX_UNSTABLE_OFFSET + i;
            if (!usedIds?.has(id)) {
                this._unstablePool.push(id);
                if (this._unstablePool.length >= 1000) {
                    break;
                }
            }
        }

        this._tmpPool.splice(0);
        for (let i = 0; i < IDPool.MAX_TMP_NUM; i++) {
            const id = IDPool.MAX_TMP_OFFSET + i;
            if (!usedIds?.has(id)) {
                this._tmpPool.push(id);
            }
        }
    }

    public genId(e: IElement): ElementId | undefined {
        if (e.isTemporary()) {
            return this.genTmpId();
        }

        if (!e.dontSave()) {
            return this.genStableId();
        }

        return this.genUnstableId();
    }

    public genTmpId(): ElementId | undefined {
        const id = this._tmpPool.pop();
        if (id === undefined) {
            return undefined;
        }
        return new ElementId(id);
    }

    public genUnstableId(): ElementId | undefined {
        const id = this._unstablePool.pop();
        if (id === undefined) {
            return undefined;
        }
        return new ElementId(id);
    }

    public genStableId(): ElementId {
        const id = ++this._currentStableIndex;
        DebugUtil.assert(id < IDPool.MAX_UNSTABLE_OFFSET, 'stable id资源已耗尽', 'wg', '2026-03-04');
        return new ElementId(id);
    }

    /**
     * 重置稳定ID的起始计数
     */
    public clearStableId(startIdx: number) {
        this._currentStableIndex = startIdx;
    }

    public isStableId(id: number) {
        return id < IDPool.MAX_UNSTABLE_OFFSET;
    }
}
