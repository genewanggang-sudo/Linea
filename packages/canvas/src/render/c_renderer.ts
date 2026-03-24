import { AxesHelper, Group, OrthographicCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three'
import { canvasConfig } from '../toolkit/canvas_config'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import { DisplayObject, DisplayObjectMgr, GNode, GRep, IMgrDisplayRenderData, IRender } from '@ccpc/core'
import { RenderHub } from './render_hub'
import { CONST, Ln3, Vec2, Vec3 } from '@ccpc/math'

export class CRenderer extends IRender {
    private static readonly PICK_TOLERANCE = 16

    private _width: number

    private _height: number

    private _container: HTMLElement

    private _renderer: WebGLRenderer

    private _scene: Scene

    private _camera: OrthographicCamera

    private _cameraControls: OrbitControls

    /**
     * 数据转换器
     */
    private _renderHub: RenderHub

    /**
     * displayId到Group映射
     */
    private _didToObject = new Map<number, Group>()

    // TODO 相关逻辑移动到canvas
    private _resizeObserver: ResizeObserver

    constructor(_container: HTMLElement) {
        super()
        this._container = _container
        this._width = this._container.clientWidth
        this._height = this._container.clientHeight

        this._renderer = new WebGLRenderer({
            antialias: true,
        })
        this._renderer.setPixelRatio(window.devicePixelRatio)
        this._renderer.setClearColor(canvasConfig.common.color_background)
        this._renderer.outputColorSpace = SRGBColorSpace
        this._renderer.setSize(this._width, this._height)
        this._container.appendChild(this._renderer.domElement)
        this._resizeObserver = new ResizeObserver(() => {
            this._onResize()
        })
        this._resizeObserver.observe(this._container)

        this._scene = new Scene()

        const aspect = this._width / this._height
        const vh = 500
        const vw = vh * aspect
        this._camera = new OrthographicCamera(-vw / 2, vw / 2, vh / 2, -vh / 2, 0.1, 100)
        this._camera.position.set(0, 0, 20)

        this._cameraControls = new OrbitControls(this._camera, this._renderer.domElement)
        this._cameraControls.enableRotate = false
        this._cameraControls.enablePan = true

        this._renderHub = new RenderHub()

        // TODO 测试代码
        this._scene.add(new AxesHelper(30))

        this.render()

    }

    /**
     * 修改完场景后,调update才会真正刷新
     */
    public updateView(): void {
        // TODO 添加renderState控制
        console.log('updateView not implemented.')
    }

    /**
     * 根据渲染数据更新显示对象
     */
    private _updateDisplayByRenderData(renderData: IMgrDisplayRenderData) {
        const { id, gRep } = renderData;
        const display = DisplayObjectMgr.instance().getDisplay(id);
        if (display) {
            if (gRep) {
                const obj = this._didToObject.get(display.id);
                if (obj) {
                    this._removeGrepByDisplayId(id);
                    this._addGrepByDisplay(display, gRep);
                } else {
                    this._addGrepByDisplay(display, gRep);
                }
            }
        }
    }

    /**
     * 根据显示对象添加GRep
     */
    private _addGrepByDisplay(display: DisplayObject, gRep: GRep) {
        const dId = display.id
        const group = this._renderHub.addGrep(gRep)
        this._scene.add(group)
        this._didToObject.set(dId, group)
        group.visible = display.testVisible()
    }

    /**
     * 根据显示对象移除GRep
     */
    private _removeGrepByDisplayId(dId: number) {
        const group = this._didToObject.get(dId)
        if (!group) return false
        this._didToObject.delete(dId)
        group.removeFromParent();
        // TODO 内存释放,优先级提高
    }

    public render = () => {
        requestAnimationFrame(this.render)

        const { update, remove } = DisplayObjectMgr.instance().onBeforeRender()
        remove.forEach(dId => {
            this._removeGrepByDisplayId(dId)
        });
        update.forEach(renderData => {
            this._updateDisplayByRenderData(renderData);
        });

        this._cameraControls.update()
        this._renderer.render(this._scene, this._camera)
    }

    /**
     * NDC转屏幕坐标
     */
    public NDCToScreen(ndcX: number, ndcY: number) {
        const screenPos = new Vec2()
        screenPos.x = (this._width * (ndcX + 1)) / 2
        screenPos.y = (this._height * (1 - ndcY)) / 2
        return screenPos
    }

    /**
     * 屏幕坐标转NDC
     */
    public screenToNDC(screenPos: Vec2) {
        const pos = new Vec2()
        pos.x = (screenPos.x / this._width) * 2 - 1
        pos.y = -(screenPos.y / this._height) * 2 + 1
        return pos
    }

    /**
     * NDC坐标转世界坐标
     */
    public NDCToWorld(ndcX: number, ndcY: number) {
        const ndc = new Vector3(ndcX, ndcY, 0)
        const worldPos = ndc.unproject(this._camera)
        return new Vec3(worldPos)
    }

    /**
     * 世界坐标转NDC坐标
     */
    public worldToNDC(worldPos: Vec3) {
        const p = new Vector3(worldPos.x, worldPos.y, 0).project(this._camera)
        return new Vec2(p.x, p.y)
    }

    /**
     * 生成相机射线
     */
    public generateCameraRay(screenPos: Vec2) {
        const raycaster = new Raycaster()
        const ndc = this.screenToNDC(screenPos)
        const pos = new Vector2(ndc.x, ndc.y)
        raycaster.setFromCamera(pos, this._camera)
        const { ray } = raycaster
        const lineRay = new Ln3(ray.origin, ray.direction, [0, 1])
        lineRay.extend(CONST.MODEL_MAX_LENGTH * 100, true)
        return lineRay
    }

    /**
     * 根据屏幕坐标拾取
     */
    public pick(screenX: number, screenY: number): GNode[] {
        const raycaster = new Raycaster()
        const ndc = this.screenToNDC(new Vec2(screenX, screenY))
        raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), this._camera)
        raycaster.params.Line2 = { threshold: CRenderer.PICK_TOLERANCE }
        const intersects = raycaster.intersectObjects(this._scene.children, true)
        const result: GNode[] = []
        const seen = new Set<number>()

        for (const hit of intersects) {
            const gnode = this._renderHub.getGNodesByObject3d(hit.object)
            if (!gnode) continue
            if (seen.has(gnode.globalID)) continue

            seen.add(gnode.globalID)
            result.push(gnode)
        }
        return result
    }

    public drawSelections(_greps: GRep[]): void {
        throw new Error('Method not implemented.')
    }

    public drawActives(_greps: GRep[]): void {
        throw new Error('Method not implemented.')
    }

    /**
     * 监听画布大小变化
     */
    // TODO 需要重写
    protected _onResize() {
        this._width = this._container.clientWidth
        this._height = this._container.clientHeight
        this._renderer.setSize(this._width, this._height)

        const aspect = this._width / this._height
        const vh = 1000
        const vw = vh * aspect
        this._camera.left = -vw / 2
        this._camera.right = vw / 2
        this._camera.top = vh / 2
        this._camera.bottom = -vh / 2
        this._camera.updateProjectionMatrix()
    }

    // TODO 补充完整
    public destroy() {
        this._resizeObserver.disconnect()
        this._renderer.dispose()
        this._renderer.domElement.remove()
    }
}
