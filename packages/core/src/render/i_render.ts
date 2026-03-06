import { GRep } from '../grep/grep'

// TODO 补充完整
export interface IRender {
    /**
     * 修改完场景后通常调用updat才会真正刷新
     */
    updateView(): void

    addGRep(grep: GRep): void

    removeGRep(eId: number): void
}
