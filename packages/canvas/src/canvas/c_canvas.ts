import { GNode, ModelView } from '@ccpc/core'
import { ICCanvas } from './i_c_canvas'
import { CRenderer } from '../render/c_renderer'
import { MouseInteractor } from '../controller/mouse_interactor'
import { IProcessEvent } from '../controller/i_process_event'
import { WorkPlane } from './work_plane'
import { alg, CONST, Ln3, Plane, Vec2, Vec3 } from '@ccpc/math'
import { KeyboardInteractor } from '../controller/keyboard_interactor'

// TODO 先简单分层，canvas中只持有renderer
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

    /**
     * 键盘事件监听器
     */
    private _keyboardInteractor: KeyboardInteractor

    constructor(container: HTMLElement, evtProcess: Array<IProcessEvent>) {
        this._container = container
        this._mouseInteractor = new MouseInteractor(this, this._container, evtProcess)
        this._keyboardInteractor = new KeyboardInteractor(evtProcess)
        this._renderer = new CRenderer(this._container)
    }

    public get container() {
        return this._container
    }

    /**
     * 开启事件监听
     */
    public startListening() {
        this._mouseInteractor.startListening()
        this._keyboardInteractor.startListening()
    }

    /**
     * 停止监听
     */
    public stopListening() {
        this._mouseInteractor.stopListening()
        this._keyboardInteractor.stopListening()
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
     * 屏幕坐标转换为指定平面下的二维局部坐标
     * @param screenPos 屏幕坐标
     * @param plane 目标平面
     */
    public screenToPlaneLocal(screenPos: Vec2, plane: Plane) {
        const pt3 = this.screenToWorldPlane(screenPos, plane)
        return plane.getUVAt(pt3)
    }

    /**
     * 屏幕坐标转换为当前工作平面下的二维局部坐标
     * @param screenPos 屏幕坐标
     */
    public screenToWorkPlaneLocal(screenPos: Vec2) {
        const { plane } = this.getWorkPlane()
        return this.screenToPlaneLocal(screenPos, plane)
    }

    /**
     * 获取当前工作平面下，1世界单位对应多少像素
     */
    public pixelsPerUnit() {
        const { plane } = this.getWorkPlane()
        const p1 = plane.getPtAt({ x: 0, y: 0 })
        const p2 = plane.getPtAt({ x: 1, y: 0 })

        const s1 = this.worldToScreen(p1)
        const s2 = this.worldToScreen(p2)

        return s1.distanceTo(s2)
    }

    /**
     * 生成相机射线
     */
    public generateCameraRay(screenPos: Vec2): Ln3 {
        return this._renderer.generateCameraRay(screenPos)
    }

    public pick(screenX: number, screenY: number): GNode[] {
        return this._renderer.pick(screenX, screenY)
    }

    // TODO 补充完整
    public destroy() {
        this.stopListening()
    }
}
