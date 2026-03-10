import { Document, Element, RegisterElement, Request, registerRequest, requestMgr } from '@ccpc/core'
import type { IRender } from '../../../packages/core/src/render/i_render'
import { GRep } from '../../../packages/core/src/grep/grep'
import { GPoint2d } from '../../../packages/core/src/grep/gpoint2d'
import { GCurve2d } from '../../../packages/core/src/grep/gcurve2d'
import { RenderEdge, RenderGroup, RenderNode, RenderPoint } from '../../../packages/core/src/render/render_node'
import { Line2, Plane, Vec2 } from '../../../packages/math/src'

/** 页面日志输出缓存。 */
const lines: string[] = []

/** 追加一行日志，并同步到页面。 */
function log(line: string): void {
    lines.push(line)
    const app = document.getElementById('app')
    if (app) app.textContent = lines.join('\n')
}

/** 断言两个值严格相等。 */
function assertEqual<T>(actual: T, expected: T, title: string): void {
    if (actual !== expected) {
        throw new Error(`[FAIL] ${title}: actual=${String(actual)} expected=${String(expected)}`)
    }
    log(`[PASS] ${title}`)
}

/** 断言条件为真。 */
function assertTrue(condition: boolean, title: string): void {
    assertEqual(condition, true, title)
}

/** 断言字符串数组内容一致。 */
function assertArrayEqual(actual: string[], expected: string[], title: string): void {
    assertEqual(JSON.stringify(actual), JSON.stringify(expected), title)
}

/** 清空页面日志。 */
function clearLog(): void {
    lines.length = 0
}

/**
 * 将 RenderNode 转成简短字符串，便于在测试页展示。
 * 这里只保留最关键的结构信息，不追求完整渲染语义。
 */
function describeRenderNode(node: RenderNode): string {
    if (node instanceof RenderPoint) {
        const { x, y, z } = node.point
        return `Point(${x},${y},${z})`
    }
    if (node instanceof RenderEdge) {
        const path = node.points[0] ?? []
        return `Edge(points=${path.length})`
    }
    if (node instanceof RenderGroup) {
        return `Group(${node.children.map(describeRenderNode).join(',')})`
    }
    return 'Node'
}

/**
 * 假渲染器。
 * 不真正绘制，只记录 ModelView 下发的渲染操作，便于断言。
 */
class FakeRender implements IRender {
    public readonly calls: string[] = []

    public clear(): void {
        this.calls.length = 0
    }

    public updateView(): void {
        this.calls.push('updateView')
    }

    public addGRep(grep: GRep): void {
        const renderNode = grep.toRenderNode()
        const desc = renderNode ? describeRenderNode(renderNode) : 'None'
        this.calls.push(`add:${grep.elementId.asInt()}:${desc}`)
    }

    public removeGRep(eId: number): void {
        this.calls.push(`remove:${eId}`)
    }
}

/** 用于验证事务、视图缓存与 GRep 同步的最小业务元素。 */
@RegisterElement('flow-sketch-element')
class FlowSketchElement extends Element {
    public x = 0
    public y = 0
    public width = 20
    public label = ''

    public override markGRepDirty(): void {
        this.C_GRep = buildSketchGRep(this)
    }
}

/**
 * 为元素构造一份最小 GRep：
 * - 一个点，表示中心
 * - 一条线段，表示水平轮廓
 */
function buildSketchGRep(element: FlowSketchElement): GRep {
    const plane = new Plane()
    const center = new Vec2(element.x, element.y)
    const line = new Line2(
        new Vec2(element.x - element.width * 0.5, element.y),
        new Vec2(element.x + element.width * 0.5, element.y),
    )

    const grep = new GRep()
    grep.addNode(new GPoint2d(plane, center))
    grep.addNode(new GCurve2d(plane, line))
    return grep
}

/** 创建一份独立的文档与假渲染器。 */
function createDoc(): { doc: Document; render: FakeRender } {
    const doc = new Document()
    const render = new FakeRender()
    doc.modelView.iRender = render
    return { doc, render }
}

/** 创建元素请求。 */
@registerRequest('flow-create')
class CreateFlowElementReq extends Request {
    public execute(): FlowSketchElement {
        const element = this._doc.create(FlowSketchElement)
        element.name = 'flow-sketch'
        element.x = 10
        element.y = 20
        element.width = 30
        element.label = 'A'
        element.markGRepDirty()
        return element
    }
}

/** 移动元素请求，同时重建 GRep。 */
@registerRequest('flow-move')
class MoveFlowElementReq extends Request {
    constructor(
        private readonly id: number,
        private readonly dx: number,
        private readonly dy: number,
    ) {
        super()
    }

    public execute(): FlowSketchElement {
        const element = this._doc.getElementByIdEnsure<FlowSketchElement>(this.id)
        element.x += this.dx
        element.y += this.dy
        element.markGRepDirty()
        return element
    }
}

/** 修改一个非视图属性，用于验证不会触发视图刷新。 */
@registerRequest('flow-rename')
class RenameFlowElementReq extends Request {
    constructor(
        private readonly id: number,
        private readonly label: string,
    ) {
        super()
    }

    public execute(): FlowSketchElement {
        const element = this._doc.getElementByIdEnsure<FlowSketchElement>(this.id)
        element.label = this.label
        return element
    }
}

/** 切换可见性请求。 */
@registerRequest('flow-visible')
class SetFlowVisibleReq extends Request {
    constructor(
        private readonly id: number,
        private readonly visible: boolean,
    ) {
        super()
    }

    public execute(): FlowSketchElement {
        const element = this._doc.getElementByIdEnsure<FlowSketchElement>(this.id)
        element.visible = this.visible
        return element
    }
}

/** 删除元素请求。 */
@registerRequest('flow-delete')
class DeleteFlowElementReq extends Request {
    constructor(private readonly id: number) {
        super()
    }

    public execute(): boolean {
        return this._doc.deleteElementsById(this.id)
    }
}

/**
 * 场景 1：
 * 验证创建元素后，数据层入库、缓存清空、视图新增与刷新是否正确。
 */
function runCreateScenario(): void {
    const { doc, render } = createDoc()
    const req = requestMgr.createReq(CreateFlowElementReq)
    const element = requestMgr.executeReq(req, true)

    assertEqual(element.db.x as number, 10, 'create commits x into db')
    assertEqual(element.db.y as number, 20, 'create commits y into db')
    assertEqual(element.db.width as number, 30, 'create commits width into db')
    assertEqual(Object.keys(element.cache).length, 0, 'create clears cache after commit')
    assertArrayEqual(
        render.calls,
        [`add:${element.id.asInt()}:Group(Point(10,20,0),Edge(points=2))`, 'updateView'],
        'create triggers render add and refresh',
    )

    const loaded = doc.getElementByIdEnsure<FlowSketchElement>(element.id)
    assertEqual(loaded.label, 'A', 'created element can be retrieved from document')
}

/**
 * 场景 2：
 * 验证非提交请求会写入 cache，并可通过 cancelReq 回滚。
 */
function runCancelScenario(): void {
    const { doc, render } = createDoc()
    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const element = requestMgr.executeReq(createReq, true)

    render.clear()
    const moveReq = requestMgr.createReq(MoveFlowElementReq, element.id.asInt(), 5, -3)
    requestMgr.executeReq(moveReq, false)

    assertEqual(element.db.x as number, 10, 'non committed move keeps db x unchanged')
    assertEqual(element.cache.x as number, 15, 'non committed move writes x to cache')
    assertArrayEqual(
        render.calls,
        [
            `remove:${element.id.asInt()}`,
            `add:${element.id.asInt()}:Group(Point(15,17,0),Edge(points=2))`,
            'updateView',
        ],
        'non committed move still refreshes current view snapshot',
    )

    render.clear()
    requestMgr.cancelReq()
    assertEqual(element.x, 10, 'cancel request rolls back x')
    assertEqual(element.y, 20, 'cancel request rolls back y')
    assertEqual(Object.keys(element.cache).length, 0, 'cancel request clears cache')
    assertArrayEqual(render.calls, [], 'cancel request without visibility cache adds no extra render ops')

    const again = doc.getElementByIdEnsure<FlowSketchElement>(element.id)
    assertEqual(again.width, 30, 'cancel keeps original width')
}

/**
 * 场景 3：
 * 验证事务会话的提交、undo、redo 是否能正确回放数据变化。
 */
function runSessionScenario(): void {
    const { doc, render } = createDoc()
    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const element = requestMgr.executeReq(createReq, true)

    render.clear()
    requestMgr.startSession('drag')
    requestMgr.executeReq(requestMgr.createReq(MoveFlowElementReq, element.id.asInt(), 2, 0), true)
    requestMgr.executeReq(requestMgr.createReq(MoveFlowElementReq, element.id.asInt(), 3, 1), true)
    requestMgr.commitSession()

    assertEqual(element.x, 15, 'session commit applies cumulative x')
    assertEqual(element.y, 21, 'session commit applies cumulative y')

    const undoOk = doc.transactionMgr.undo()
    assertTrue(undoOk, 'session undo succeeds')
    assertEqual(element.x, 10, 'session undo restores x')
    assertEqual(element.y, 20, 'session undo restores y')

    const redoOk = doc.transactionMgr.redo()
    assertTrue(redoOk, 'session redo succeeds')
    assertEqual(element.x, 15, 'session redo reapplies x')
    assertEqual(element.y, 21, 'session redo reapplies y')

    assertTrue(render.calls.length >= 2, 'session scenario produced render activity')
}

/**
 * 场景 4：
 * 验证视图缓存规则：
 * - 普通属性修改不刷新渲染
 * - visible 改变会删除 GRep
 * - delete 会触发 remove + updateView
 */
function runViewScenario(): void {
    const { doc, render } = createDoc()
    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const element = requestMgr.executeReq(createReq)

    render.clear()
    requestMgr.executeReq(requestMgr.createReq(RenameFlowElementReq, element.id.asInt(), 'B'), true)
    assertArrayEqual(render.calls, [], 'non visual property change does not trigger render update')

    requestMgr.executeReq(requestMgr.createReq(SetFlowVisibleReq, element.id.asInt(), false), true)
    assertArrayEqual(
        render.calls,
        [`remove:${element.id.asInt()}`, 'updateView'],
        'visible false removes grep from render',
    )

    render.clear()
    requestMgr.executeReq(requestMgr.createReq(DeleteFlowElementReq, element.id.asInt()), true)
    assertArrayEqual(
        render.calls,
        [],
        'delete after hidden element produces no extra render ops',
    )

}

/** 运行整套 core 流程验证。 */
function run(): void {
    clearLog()
    log('=== Core Flow Verify ===')
    runCreateScenario()
    runCancelScenario()
    runSessionScenario()
    runViewScenario()
    log('ALL_PASS')
}

try {
    run()
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(message)
    log('FAIL')
    throw error
}
