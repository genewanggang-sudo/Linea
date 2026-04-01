import { CCanvas, IProcessEvent } from '@ccpc/canvas';
import { DebugUtil, IDocument } from '@ccpc/core';
import { cmdMgr } from '../cmd/cmd_mgr';
import { editorMgr } from '../cmd/editor_mgr';
import { Selection } from '../selection/selection';
import { HighLight } from '../selection/high_light';

// TODO app补充完整, 高亮选中等
export class App {
    private static _instance: App

    private _curDoc?: IDocument

    private _curCanvas?: CCanvas

    private _cmdMgr = cmdMgr

    public selection: Selection

    public highLight: HighLight

    constructor() {
        this.selection = Selection.instance()
        this.highLight = HighLight.instance()
    }

    public get cmdMgr() {
        return this._cmdMgr
    }

    public static instance() {
        if (!this._instance) {
            this._instance = new App()
        }
        return this._instance
    }

    public get doc() {
        DebugUtil.assert(this._curDoc, '请先调用start方法给doc赋值', 'wg', '2026-03-11')
        return this._curDoc
    }

    /**
     * 获取画布
     */
    public getCanvas() {
        return this._curCanvas!
    }

    public start(doc: IDocument) {
        this._curDoc = doc
        doc.isMainDoc = true
        this.selection.setDoc(doc)
        this.highLight.setDoc(doc)
    }

    public stop() {
        this.highLight.clear()
        this.selection.clear()
        this._curCanvas?.destroy()
        this._curDoc?.destroy()
        delete this._curCanvas
        delete this._curDoc
    }

    /**
     * 创建画布
     */
    public createCanvas(container: HTMLElement) {
        const evtProcess: Array<IProcessEvent> = [this._cmdMgr, editorMgr]
        const cCanvas = new CCanvas(container, evtProcess)
        this._curCanvas = cCanvas
        if (this._curDoc) this._curCanvas.resetModelView(this._curDoc.modelView)
        this._curCanvas.startListening()
        return cCanvas
    }
}

export const app = App.instance()
