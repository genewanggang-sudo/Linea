import { ModelView } from '@ccpc/core'
import { CRenderer } from './c_renderer'
import { ICCanvas } from './i_c_canvas'

// TODO 先简单分层,canvas中只持有renderer
export class CCanvas implements ICCanvas {
    private _container: HTMLElement

    private _renderer: CRenderer

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
}
