import { ModelView } from '@ccpc/core'
import { ICCanvas } from './i_c_canvas'
import { CRenderer } from '../render/c_renderer'

// TODO 先简单分层,canvas中只持有renderer
export class CCanvas implements ICCanvas {
    private _container: HTMLElement

    private _renderer: CRenderer

    /**
     * 鼠标事件监听器
     */
    // private _mouse

    constructor(container: HTMLElement) {
        this._container = container
        this._renderer = new CRenderer(this._container)
    }

    public get container() {
        return this._container
    }

    public resetModelView(modelView: ModelView) {
        modelView.iRender = this._renderer
    }

    // TODO 补充完整
    public destroy() {

    }
}
