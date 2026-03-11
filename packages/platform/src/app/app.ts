import { CCanvas, IProcessEvent } from '@ccpc/canvas';
import { DebugUtil, IDocument } from '@ccpc/core';
import { cmdMgr } from '../cmd/cmd_mgr';

// TODO app补充完整, 高亮选中等
export class App {
    private _curDoc?: IDocument

    private _curCanvas?: CCanvas

    private _cmdMgr = cmdMgr

    public get doc() {
        DebugUtil.assert(this._curDoc, '请先调用start方法给doc赋值', 'wg', '2026-03-11')
        return this._curDoc
    }

    public start(doc: IDocument) {
        this._curDoc = doc
        doc.isMainDoc = true
    }

    public stop() {
        this._curCanvas?.destroy()
        this._curDoc?.destroy()
        delete this._curCanvas
        delete this._curDoc
    }

    public getCanvas() {
        return this._curCanvas
    }

    public createCanvas(container: HTMLElement) {
        const evtProcess: Array<IProcessEvent> = [this._cmdMgr]
        const cCanvas = new CCanvas(container, evtProcess)
        this._curCanvas = cCanvas
        return cCanvas
    }
}
