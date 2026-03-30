import { IElement } from '../element/i_element';
import { DebugUtil } from '../toolkit/debug_util';
import { Transaction } from '../transaction/transaction';
import { Document } from './document';
import { IDocFile, IDocument, IElementFile } from './i_document';

export class DocSaver {
    private _doc: IDocument

    constructor(doc: IDocument) {
        this._doc = doc
    }

    public dump() {
        const file: IDocFile = {
            id: this._doc.id,
        }
        file.doc = this._dumpDoc()

        return file
    }

    private _dumpDoc() {
        const doc = this._doc.filterElements().filter(e => !e.dontSave()).map(e => {
            return {
                ctor: e.getSerialId(),
                ...e.dump(),
            } as IElementFile
        })
        return doc
    }

    /**
     * 同步加载
     */
    public syncLoad(file: IDocFile) {
        try {
            const trans = new Transaction(this._doc, 'open doc file')
            trans.canUndo = false
            this._clearDocument()
            this._fillDocument(file)
            const eles = this._doc.filterElements()
            eles.forEach(_ => _.onLoad())
            trans.commit()
            // this._doc.updateView(true)
            return true
        } catch {
            DebugUtil.warn(false, 'parsing saved doc failed', 'wg', '2026-03-30')
        }
        return false
    }

    private _clearDocument() {
        const eles = this._doc.filterElements(e => !e.dontSave())
        eles.forEach(e => {
            this._doc.elementMgr.delete(e.id.asInt())
        })
    }

    private _fillDocument(file: IDocFile) {
        const newEles: IElement[] = []
        if (!file.doc) return
        file.doc.forEach(_ => {
            const Ctor = this._doc.elementMgr.getElementClsByCtor(_.ctor)
            DebugUtil.assert(Ctor, `cant find element ctor ${_.ctor}`, 'wg', '2026-03-30')
            Document.canCreate = true
            const ele = new Ctor()
            ele.setDoc(this._doc)
            ele.load(_)
            newEles.push(ele)
            Document.canCreate = false
        })

        // add to doc
        newEles.forEach(_ => this._doc.elementMgr.add(_))
        this._doc.transactionMgr.getCurrentUndoRedoEntity().onElementsAdded(newEles)
        // reset id pool
        if (newEles.length) {
            const maxId = Math.max(...newEles.map(_ => _.id.asInt()))
            this._doc.idPool.clearStableId(maxId)
        }
        this._doc.id = file.id
        return newEles
    }
}
