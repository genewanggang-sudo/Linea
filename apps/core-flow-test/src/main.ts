import {
    Document,
    Element,
    GCurve2d,
    GRep,
    RegisterElement,
    Request,
    registerRequest,
    requestMgr,
} from '@ccpc/core'
import { Ln2, Plane, Vec2 } from '@ccpc/math'
import { app, Cmd, cmdMgr, registerCmd } from '@ccpc/platform'

type LinePattern = 'horizontal' | 'diagonal' | 'cross'

const logs: string[] = []

function log(line: string): void {
    logs.push(line)
    const logPanel = document.getElementById('log-panel')
    if (logPanel) {
        logPanel.textContent = logs.join('\n')
    }
}

function createToolbar(): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.style.display = 'flex'
    toolbar.style.gap = '12px'
    toolbar.style.marginBottom = '12px'
    document.body.appendChild(toolbar)
    return toolbar
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = label
    button.style.padding = '10px 16px'
    button.style.border = '1px solid #777'
    button.style.background = '#f3f3f3'
    button.style.cursor = 'pointer'
    button.addEventListener('click', onClick)
    return button
}

function createMount(): HTMLElement {
    const mount = document.createElement('div')
    mount.id = 'canvas-mount'
    mount.style.width = '1280px'
    mount.style.height = '720px'
    mount.style.border = '1px solid #999'
    mount.style.background = '#111'
    document.body.appendChild(mount)
    return mount
}

function createLogPanel(): HTMLElement {
    const panel = document.createElement('pre')
    panel.id = 'log-panel'
    panel.style.marginTop = '12px'
    panel.style.padding = '12px'
    panel.style.border = '1px solid #ddd'
    panel.style.background = '#fafafa'
    panel.style.whiteSpace = 'pre-wrap'
    document.body.appendChild(panel)
    return panel
}

function toWorldPos(screenPos: Vec2, mount: HTMLElement): Vec2 {
    return new Vec2(screenPos.x - mount.clientWidth * 0.5, mount.clientHeight * 0.5 - screenPos.y)
}

@RegisterElement('test-line-element')
class TestLineElement extends Element {
    public center = new Vec2(0, 0)

    public pattern: LinePattern = 'horizontal'

    public override markGRepDirty(): void {
        this.C_GRep = buildLineGRep(this)
    }
}

function buildLineGRep(element: TestLineElement): GRep {
    const plane = new Plane()
    const grep = new GRep()
    const { center, pattern } = element

    const addLine = (start: Vec2, end: Vec2) => {
        grep.addNode(new GCurve2d(plane, new Ln2(start, end)))
    }

    if (pattern === 'horizontal') {
        addLine(new Vec2(center.x - 120, center.y), new Vec2(center.x + 120, center.y))
        return grep
    }

    if (pattern === 'diagonal') {
        addLine(new Vec2(center.x - 100, center.y - 100), new Vec2(center.x + 100, center.y + 100))
        addLine(new Vec2(center.x - 100, center.y + 40), new Vec2(center.x + 100, center.y - 40))
        return grep
    }

    addLine(new Vec2(center.x - 110, center.y), new Vec2(center.x + 110, center.y))
    addLine(new Vec2(center.x, center.y - 110), new Vec2(center.x, center.y + 110))
    addLine(new Vec2(center.x - 80, center.y - 80), new Vec2(center.x + 80, center.y + 80))
    addLine(new Vec2(center.x - 80, center.y + 80), new Vec2(center.x + 80, center.y - 80))
    return grep
}

@registerRequest('draw-test-line')
class DrawTestLineReq extends Request {
    constructor(
        private readonly _pattern: LinePattern,
        private readonly _center: Vec2,
    ) {
        super()
    }

    public execute(): TestLineElement {
        const element = this._doc.create(TestLineElement)
        element.name = `test-line-${this._pattern}`
        element.pattern = this._pattern
        element.center = this._center
        element.markGRepDirty()
        return element
    }
}

class BaseDrawLineCmd extends Cmd {
    public override executeImmediately = false

    constructor(private readonly _pattern: LinePattern) {
        super()
    }

    public override execute(): Promise<void> {
        log(`${this._pattern} cmd armed, click canvas to draw`)
        return Promise.resolve()
    }

    public override onClick(evt: { pos: Vec2 }): boolean {
        const mount = document.getElementById('canvas-mount')
        if (!mount) {
            log('canvas mount not found')
            this._resolve()
            return true
        }

        const worldPos = toWorldPos(evt.pos, mount)
        const req = requestMgr.createReq(DrawTestLineReq, this._pattern, worldPos)
        requestMgr.executeReq(req, true)
        log(`draw ${this._pattern} at ${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}`)
        this._resolve()
        return true
    }
}

@registerCmd('draw-horizontal-line-cmd')
class DrawHorizontalLineCmd extends BaseDrawLineCmd {
    constructor() {
        super('horizontal')
    }
}

@registerCmd('draw-diagonal-line-cmd')
class DrawDiagonalLineCmd extends BaseDrawLineCmd {
    constructor() {
        super('diagonal')
    }
}

@registerCmd('draw-cross-line-cmd')
class DrawCrossLineCmd extends BaseDrawLineCmd {
    constructor() {
        super('cross')
    }
}

function armCommand(label: string, cmd: typeof Cmd): void {
    void cmdMgr.sendCmd(cmd).then(() => undefined)
    log(`${label} button clicked`)
}

function run(): void {
    log('=== App + Cmd Draw Test ===')

    const toolbar = createToolbar()
    createLogPanel()
    const mount = createMount()

    toolbar.appendChild(createButton('Horizontal', () => armCommand('horizontal', DrawHorizontalLineCmd)))
    toolbar.appendChild(createButton('Diagonal', () => armCommand('diagonal', DrawDiagonalLineCmd)))
    toolbar.appendChild(createButton('Cross', () => armCommand('cross', DrawCrossLineCmd)))

    const doc = new Document()
    app.start(doc)
    app.createCanvas(mount)

    log('app started')
    log('choose a button, then click inside canvas')
}

try {
    run()
    log('ready')
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`ERROR: ${message}`)
}
