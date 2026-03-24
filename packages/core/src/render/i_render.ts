import { GRep } from '../grep/grep';

export abstract class IRender {
    /**
     * 修改完场景后通常调用updat才会真正刷新
     */
    public abstract updateView(): void

    /**
     * 清空高亮
     */
    public clearActive() {
        // TODO 补充完整
    }

    /**
     * 清空选择集
     */
    public clearSelection() {
        // TODO 补充完整
    }

    /**
     * 绘制高亮对象
     */
    public abstract drawActives(_greps: GRep[]): void

    /**
     * 绘制选中对象
     */
    public abstract drawSelections(_greps: GRep[]): void
}
