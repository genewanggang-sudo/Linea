import { AxesHelper, Group, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { canvasConfig } from '../toolkit/canvas_config'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import { DisplayObject, DisplayObjectMgr, GRep, IMgrDisplayRenderData, IRender } from '@ccpc/core'
import { RenderHub } from './render_hub'

export class CRenderer implements IRender {
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
    private _didMap = new Map<number, Group>()

    // TODO 相关逻辑移动到canvas
    private _resizeObserver: ResizeObserver

    constructor(_container: HTMLElement) {
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
                const obj = this._didMap.get(display.id);
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
     * 移除显示对象
     */
    private _removeDisplayById(did: number) {
        this._removeGrepByDisplayId(did)
    }

    /**
     * 根据显示对象添加GRep
     */
    private _addGrepByDisplay(display: DisplayObject, gRep: GRep) {
        const dId = display.id
        console.log('==========');
        console.log(gRep);
        const group = this._renderHub.addGrep(gRep)
        this._scene.add(group)
        this._didMap.set(dId, group)
        group.visible = display.testVisible()
    }

    /**
     * 根据显示对象移除GRep
     */
    private _removeGrepByDisplayId(dId: number) {
        const group = this._didMap.get(dId)
        if (!group) return false
        this._didMap.delete(dId)
        group.removeFromParent();
        // TODO 内存释放
    }

    public render = () => {
        requestAnimationFrame(this.render)

        const { update, remove } = DisplayObjectMgr.instance().onBeforeRender()
        remove.forEach(id => {
            this._removeDisplayById(id);
        });
        update.forEach(renderData => {
            this._updateDisplayByRenderData(renderData);
        });

        this._cameraControls.update()
        this._renderer.render(this._scene, this._camera)
    }

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
