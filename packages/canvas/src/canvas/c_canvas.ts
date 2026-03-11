import { ModelView } from '@ccpc/core'
import { ICCanvas } from './i_c_canvas'
import { CRenderer } from '../render/c_renderer'
import { MouseInteractor } from '../controller/mouse_interactor'
import { IProcessEvent } from '../controller/i_process_event'

// TODO 先简单分层,canvas中只持有renderer
export class CCanvas implements ICCanvas {
    private _container: HTMLElement

    private _renderer: CRenderer

    /**
     * 鼠标事件监听器
     */
    private _mouseInteractor: MouseInteractor

    constructor(container: HTMLElement, evtProcess: Array<IProcessEvent>) {
        this._container = container
        this._mouseInteractor = new MouseInteractor(this, this._container, evtProcess)
        this._renderer = new CRenderer(this._container)
    }

    public get container() {
        return this._container
    }

    public resetModelView(modelView: ModelView) {
        modelView.iRender = this._renderer
    }

    /**
     * 开启监听
     */
    public startListening() {
        this._mouseInteractor.startListening()
    }

    /**
     * 停止监听
     */
    public stopListening() {
        this._mouseInteractor.stopListening()
    }

    // TODO 补充完整
    public destroy() {
        this.stopListening()
    }
}
