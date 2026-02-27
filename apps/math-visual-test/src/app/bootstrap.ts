import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface ViewportContext {
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    start: (renderFrame: () => void) => void
    dispose: () => void
}

export function createViewport(container: HTMLElement): ViewportContext {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf3f7fb)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const camera = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.01, 1000)
    camera.position.set(0, 0, 100)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableRotate = false
    controls.zoomToCursor = true
    controls.screenSpacePanning = true
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
    }
    controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
    }

    const resize = () => {
        const width = Math.max(container.clientWidth, 1)
        const height = Math.max(container.clientHeight, 1)
        const halfW = 20
        const halfH = halfW * (height / width)
        camera.left = -halfW
        camera.right = halfW
        camera.top = halfH
        camera.bottom = -halfH
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
    }
    resize()
    window.addEventListener('resize', resize)

    const grid = new THREE.GridHelper(200, 100, 0xc0cfdd, 0xd9e4ef)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)
    scene.add(new THREE.AxesHelper(5))

    let rafId = 0
    const start = (renderFrame: () => void) => {
        const loop = () => {
            controls.update()
            renderFrame()
            renderer.render(scene, camera)
            rafId = window.requestAnimationFrame(loop)
        }
        rafId = window.requestAnimationFrame(loop)
    }

    const dispose = () => {
        window.cancelAnimationFrame(rafId)
        window.removeEventListener('resize', resize)
        controls.dispose()
        renderer.dispose()
    }

    return { scene, camera, renderer, controls, start, dispose }
}
