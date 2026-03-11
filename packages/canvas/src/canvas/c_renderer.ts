import { AxesHelper, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { canvasConfig } from '../toolkit/canvas_config'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import { GRep, IRender } from '@ccpc/core'

export class CRenderer implements IRender {
    private _width: number

    private _height: number

    private _container: HTMLElement

    private _renderer: WebGLRenderer

    private _scene: Scene

    private _camera: OrthographicCamera

    private _cameraControls: OrbitControls

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
        const vh = 1000
        const vw = vh * aspect
        this._camera = new OrthographicCamera(-vw / 2, vw / 2, vh / 2, -vh / 2, 0.1, 100)
        this._camera.position.set(0, 0, 10)

        this._cameraControls = new OrbitControls(this._camera, this._renderer.domElement)
        this._cameraControls.enableRotate = false
        this._cameraControls.enablePan = true

        // TODO 测试代码
        this._scene.add(new AxesHelper(30))

        this.render()

    }

    // TODO 未实现方法添加
    public updateView(): void {
        console.log('updateView not implemented.')
    }

    public removeGRep(_eId: number): void {
        console.log('removeGRep not implemented.')
    }

    public addGRep(_grep: GRep) {
        console.log('addGRep not implemented.')
    }

    public render = () => {
        requestAnimationFrame(this.render)
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
