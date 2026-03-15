import { ModelView } from '@ccpc/core'
import { ICCanvas } from './i_c_canvas'
import { CRenderer } from '../render/c_renderer'
import { MouseInteractor } from '../controller/mouse_interactor'
import { IProcessEvent } from '../controller/i_process_event'
import { WorkPlane } from './work_plane'
import { Vec2, Vec3 } from '@ccpc/math'

// TODO 先简单分层,canvas中只持有renderer
export class CCanvas implements ICCanvas {
    /**
     * 画布容器
     */
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

    /**
     * 给模型层视图绑定渲染器实例
     */
    public resetModelView(modelView: ModelView) {
        modelView.iRender = this._renderer
    }

    /**
     * 获取当前工作平面
     */
    public getWorkPlane() {
        return new WorkPlane()
    }

    /**
     * NDC转屏幕坐标
     */
    public NDCToScreen(ndcX: number, ndcY: number) {
        return this._renderer.NDCToScreen(ndcX, ndcY)
    }

    /**
     * 屏幕坐标转NDC
     */
    public screenToNDC(screenPos: Vec2) {
        return this._renderer.screenToNDC(screenPos)
    }

    /**
     * 屏幕坐标转世界坐标
     */
    public screenToWorld(screenPos: Vec2) {
        const ndc = this.screenToNDC(screenPos)
        const worldPos = this._renderer.NDCToWorld(ndc.x, ndc.y)
        return this.getWorkPlane().plane.getProjectedPtBy(worldPos)
    }

    /**
     * 世界坐标转屏幕坐标
     */
    public worldToScreen(worldPos: Vec3) {
        const ndc = this._renderer.worldToNDC(worldPos)
        return this.NDCToScreen(ndc.x, ndc.y)
    }

    /**
     * 开启事件监听
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
