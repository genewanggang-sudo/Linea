import { DebugUtil } from '@ccpc/core'

import { PtSnap } from './point_snap_result'
import type { SnapResult } from './snap_result'

/**
 * 吸附候选结果
 */
export class SnapCandidates {
    /**
     * 用于tab切换吸附结果
     */
    private _currentIndex: number

    private _snapResults: SnapResult[]

    constructor() {
        this._currentIndex = -1
        this._snapResults = []
    }

    public get snapResults() {
        return this._snapResults
    }

    public addSnapResult(snapResult: SnapResult) {
        this._snapResults.push(snapResult)
    }

    public addSnapResults(snapResults: SnapResult[]) {
        this._snapResults.push(...snapResults)
    }

    public sort(fun?: (a: SnapResult, b: SnapResult) => number) {
        if (this._snapResults.length < 2) {
            return
        }
        if (fun) {
            this._snapResults.sort(fun)
            return
        }

        const getMinType = (c: PtSnap) => {
            if (c.anotherSnapType !== undefined) {
                return Math.min(c.getSnapType(), c.anotherSnapType)
            }
            return c.getSnapType()
        }

        const snaps = this._snapResults.filter(_ => _ instanceof PtSnap)
        snaps.sort((a, b) => getMinType(a) - getMinType(b) || a.disToCursor - b.disToCursor)
        this._snapResults = [...snaps]
    }

    public getCurrentSnap(): SnapResult | undefined {
        if (this._snapResults.length < 1) {
            return undefined
        }
        return this._snapResults[this.currentIndex]
    }

    public get currentIndex() {
        return this._currentIndex
    }

    public set currentIndex(index: number) {
        DebugUtil.assert(index < this._snapResults.length && index > -1, 'index不合法', 'wg', '2026-03-25')
        this._currentIndex = index
    }
}
