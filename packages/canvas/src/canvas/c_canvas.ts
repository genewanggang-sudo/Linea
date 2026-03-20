import { ModelView } from '@ccpc/core'
import { ICCanvas } from './i_c_canvas'
import { CRenderer } from '../render/c_renderer'
import { MouseInteractor } from '../controller/mouse_interactor'
import { IProcessEvent } from '../controller/i_process_event'
import { WorkPlane } from './work_plane'
import { alg, CONST, Ln3, Plane, Vec2, Vec3 } from '@ccpc/math'

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
     * 屏幕坐标投影到世界坐标系中的指定平面上
     * @param screenPos 屏幕坐标
     * @param plane 世界坐标系下的平面
     */
    public screenToWorldPlane(screenPos: Vec2, plane: Plane) {
        const ray = this._renderer.generateCameraRay(screenPos)
        ray.extendDouble(CONST.MODEL_MAX_LENGTH)
        const pts = alg.X.curveSurface(ray, plane)
        if (!pts.length) return Vec3.O()
        return pts[0]
    }

    /**
     * 屏幕坐标转当前工作平面下的世界坐标
     */
    public screenToWorkPlane(screenPos: Vec2) {
        const { plane } = this.getWorkPlane()
        const p = this.screenToWorldPlane(screenPos, plane)
        return p
    }

    /**
     * 世界坐标转屏幕坐标
     */
    public worldToScreen(worldPos: Vec3) {
        const ndc = this._renderer.worldToNDC(worldPos)
        return this.NDCToScreen(ndc.x, ndc.y)
    }

    /**
     * 生成相机射线
     */
    public generateCameraRay(screenPos: Vec2): Ln3 {
        return this._renderer.generateCameraRay(screenPos)
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
