import { Document, requestMgr } from '@ccpc/core'
import { app, cmdMgr } from '@ccpc/platform'
import { ClearTestShapesReq } from './playground_requests'
import { resetDrawingStatus, setToast } from './playground_state'

type DocFile = {
    id: string
    doc?: unknown[]
}

function isDocFile(value: unknown): value is DocFile {
    if (!value || typeof value !== 'object') {
        return false
    }
    const candidate = value as Record<string, unknown>
    if (typeof candidate.id !== 'string') {
        return false
    }
    if (candidate.doc !== undefined && !Array.isArray(candidate.doc)) {
        return false
    }
    return true
}

function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}

function readFileAsText(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
        reader.readAsText(file, 'utf-8')
    })
}

function pickJsonFile() {
    return new Promise<File | undefined>(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => resolve(input.files?.[0])
        input.oncancel = () => resolve(undefined)
        input.click()
    })
}

export function exportCurrentDocument() {
    try {
        const file = app.doc.dump()
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        downloadTextFile(`core-flow-test-doc-${timestamp}.json`, JSON.stringify(file, null, 2))
        setToast('文档已导出为 JSON')
    } catch (error) {
        console.error(error)
        setToast('文档导出失败')
    }
}

export async function importCurrentDocument() {
    try {
        cmdMgr.resetAllActions()
        const file = await pickJsonFile()
        if (!file) {
            return
        }

        const text = await readFileAsText(file)
        const parsed = JSON.parse(text) as unknown
        if (!isDocFile(parsed)) {
            setToast('导入失败，JSON 不是有效的文档格式')
            return
        }

        app.selection.clear()
        app.highLight.clear()
        requestMgr.executeReq(requestMgr.createReq(ClearTestShapesReq), true)

        const newDoc = new Document()
        newDoc.load(parsed as never)
        newDoc.transactionMgr.clear()
        app.start(newDoc)
        if (app.getCanvas()) app.getCanvas().resetModelView(newDoc.modelView)
        newDoc.updateView(true)

        resetDrawingStatus('已从 JSON 加载文档，可继续验证 dump / load 链路。')
        setToast('文档已从 JSON 加载')
    } catch (error) {
        console.error(error)
        setToast('文档加载失败')
    }
}
