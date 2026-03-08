import { Document, Element, RegisterElement, Request, registerRequest, requestMgr } from '@ccpc/core'
import { GRep } from '../../../packages/core/src/grep/grep'
import type { IRender } from '../../../packages/core/src/render/i_render'

const lines: string[] = []

function log(line: string): void {
    lines.push(line)
    const app = document.getElementById('app')
    if (app) app.textContent = lines.join('\n')
}

@RegisterElement('flow-element')
class FlowElement extends Element {
    public x = 0
    public y = 0
}

class VisibleGRep extends GRep {
    public override isEmpty(): boolean {
        return false
    }
}

class FakeRender implements IRender {
    public readonly calls: string[] = []

    public updateView(): void {
        this.calls.push('updateView')
    }

    public addGRep(grep: GRep): void {
        this.calls.push(`add:${grep.elementId.asInt()}`)
    }

    public removeGRep(eId: number): void {
        this.calls.push(`remove:${eId}`)
    }

    public clear(): void {
        this.calls.length = 0
    }
}

@registerRequest('create-flow-element')
class CreateFlowElementReq extends Request {
    public execute(): FlowElement {
        const e = this._doc.create(FlowElement)
        e.name = 'flow-1'
        e.x = 1
        e.y = 2
        e.C_GRep = new VisibleGRep()
        return e
    }
}

@registerRequest('move-flow-element')
class MoveFlowElementReq extends Request {
    constructor(private readonly id: number, private readonly dx: number, private readonly dy: number) {
        super()
    }

    public execute(): FlowElement {
        const e = this._doc.getElementByIdEnsure<FlowElement>(this.id)
        e.x += this.dx
        e.y += this.dy
        return e
    }
}

@registerRequest('set-flow-element-visible')
class SetFlowElementVisibleReq extends Request {
    constructor(private readonly id: number, private readonly visible: boolean) {
        super()
    }

    public execute(): FlowElement {
        const e = this._doc.getElementByIdEnsure<FlowElement>(this.id)
        e.visible = this.visible
        return e
    }
}

@registerRequest('delete-flow-element')
class DeleteFlowElementReq extends Request {
    constructor(private readonly id: number) {
        super()
    }

    public execute(): boolean {
        return this._doc.deleteElementsById(this.id)
    }
}

function expectEqual(actual: unknown, expected: unknown, title: string): void {
    if (actual !== expected) {
        const formatValue = (value: unknown): string => {
            if (value === null) return 'null'
            const t = typeof value
            if (t === 'string') {
                return value as string
            }
            if (t === 'number' || t === 'boolean' || t === 'bigint') {
                return `${value as number | boolean | bigint}`
            }
            if (t === 'undefined') {
                return 'undefined'
            }
            if (t === 'symbol') {
                return (value as symbol).toString()
            }
            try {
                return JSON.stringify(value)
            } catch {
                return '[Unserializable]'
            }
        }
        const actualStr = formatValue(actual)
        const expectedStr = formatValue(expected)
        throw new Error(`[FAIL] ${title}: actual=${actualStr} expected=${expectedStr}`)
    }
    log(`[PASS] ${title}`)
}

function expectArrayEqual(actual: string[], expected: string[], title: string): void {
    expectEqual(JSON.stringify(actual), JSON.stringify(expected), title)
}

function createDocWithRender(): { doc: Document, render: FakeRender } {
    const doc = new Document()
    const render = new FakeRender()
    doc.modelView.iRender = render
    return { doc, render }
}

function runScenarioCreateUndoRedo(): void {
    const { doc } = createDocWithRender()

    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const created = requestMgr.executeReq(createReq, true)

    expectEqual(created.x, 1, 'create x = 1')
    expectEqual(created.y, 2, 'create y = 2')

    const undoOk = doc.transactionMgr.undo()
    expectEqual(undoOk, true, 'undo create success')
    expectEqual(doc.getElementById(created.id), undefined, 'undo create removes element')

    const redoOk = doc.transactionMgr.redo()
    expectEqual(redoOk, true, 'redo create success')
    const afterRedo = doc.getElementByIdEnsure<FlowElement>(created.id)
    expectEqual(afterRedo.x, 1, 'redo create x = 1')
    expectEqual(afterRedo.y, 2, 'redo create y = 2')
}

function runScenarioCancelRequest(): void {
    const { doc } = createDocWithRender()

    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const created = requestMgr.executeReq(createReq, true)

    const moveReq = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 10, 5)
    requestMgr.executeReq(moveReq, false)
    requestMgr.cancelReq()

    const afterCancel = doc.getElementByIdEnsure<FlowElement>(created.id)
    expectEqual(afterCancel.x, 1, 'cancel request rollback x')
    expectEqual(afterCancel.y, 2, 'cancel request rollback y')
}

function runScenarioSessionCommitAndUndo(): void {
    const { doc } = createDocWithRender()

    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const created = requestMgr.executeReq(createReq, true)

    requestMgr.startSession('drag-session')
    const moveReq1 = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 2, 0)
    requestMgr.executeReq(moveReq1, true)
    const moveReq2 = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 3, 0)
    const moved = requestMgr.executeReq(moveReq2, true)
    requestMgr.commitSession()

    expectEqual(moved.x, 6, 'session commit final x = 6')
    expectEqual(moved.y, 2, 'session commit final y = 2')

    const undoOk = doc.transactionMgr.undo()
    expectEqual(undoOk, true, 'session undo success')
    const afterUndo = doc.getElementByIdEnsure<FlowElement>(created.id)
    expectEqual(afterUndo.x, 1, 'session undo rollback x = 1')
    expectEqual(afterUndo.y, 2, 'session undo rollback y = 2')

    const redoOk = doc.transactionMgr.redo()
    expectEqual(redoOk, true, 'session redo success')
    const afterRedo = doc.getElementByIdEnsure<FlowElement>(created.id)
    expectEqual(afterRedo.x, 6, 'session redo x = 6')
    expectEqual(afterRedo.y, 2, 'session redo y = 2')
}

function runScenarioSessionAbort(): void {
    const { doc } = createDocWithRender()

    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const created = requestMgr.executeReq(createReq, true)

    requestMgr.startSession('abort-session')
    const moveReq1 = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 4, 0)
    requestMgr.executeReq(moveReq1, true)
    const moveReq2 = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 5, 0)
    requestMgr.executeReq(moveReq2, true)
    requestMgr.abortSession()

    const afterAbort = doc.getElementByIdEnsure<FlowElement>(created.id)
    expectEqual(afterAbort.x, 1, 'session abort rollback x')
    expectEqual(afterAbort.y, 2, 'session abort rollback y')
}

function runScenarioViewCreateUpdateDelete(): void {
    const { doc, render } = createDocWithRender()

    const createReq = requestMgr.createReq(CreateFlowElementReq)
    const created = requestMgr.executeReq(createReq, true)

    doc.updateView(false)
    expectArrayEqual(
        render.calls,
        [`remove:${created.id.asInt()}`, `add:${created.id.asInt()}`, 'updateView'],
        'create triggers render refresh',
    )

    render.clear()
    const moveReq = requestMgr.createReq(MoveFlowElementReq, created.id.asInt(), 10, 5)
    requestMgr.executeReq(moveReq, true)
    doc.updateView(false)
    expectArrayEqual(render.calls, [], 'move x y does not trigger view refresh')

    render.clear()
    const hideReq = requestMgr.createReq(SetFlowElementVisibleReq, created.id.asInt(), false)
    requestMgr.executeReq(hideReq, true)
    doc.updateView(false)
    expectArrayEqual(
        render.calls,
        [`remove:${created.id.asInt()}`, 'updateView'],
        'visible false removes grep from render',
    )

    const undoVisibleOk = doc.transactionMgr.undo()
    expectEqual(undoVisibleOk, true, 'undo visible change success')
    render.clear()
    doc.updateView(false)
    expectArrayEqual(
        render.calls,
        [`remove:${created.id.asInt()}`, `add:${created.id.asInt()}`, 'updateView'],
        'undo visible change adds grep back',
    )

    render.clear()
    const deleteReq = requestMgr.createReq(DeleteFlowElementReq, created.id.asInt())
    const deleteOk = requestMgr.executeReq(deleteReq, true)
    expectEqual(deleteOk, true, 'delete element success')
    doc.updateView(false)
    expectArrayEqual(
        render.calls,
        [`remove:${created.id.asInt()}`, 'updateView'],
        'delete removes grep from render',
    )
}

function runFlow(): void {
    log('=== Core Flow Verify ===')
    runScenarioCreateUndoRedo()
    runScenarioCancelRequest()
    runScenarioSessionCommitAndUndo()
    runScenarioSessionAbort()
    runScenarioViewCreateUpdateDelete()
    log('ALL_PASS')
}

try {
    runFlow()
} catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(msg)
    log('FAIL')
    throw err
}
