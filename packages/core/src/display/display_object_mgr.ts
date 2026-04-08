import type { IMgrDisplayRenderData } from './display_object'
import { DisplayObject } from './display_object'

export class DisplayObjectMgr {
    /** 显示对象集合。*/
    private _displayMap: Map<number, DisplayObject>

    /** 本轮被移除的显示对象 id。*/
    private _removedSet: Set<number>

    /** 单例实例。*/
    private static _instance: DisplayObjectMgr

    constructor() {
        this._displayMap = new Map()
        this._removedSet = new Set()
    }

    public addDisplay(display: DisplayObject): void {
        this._displayMap.set(display.id, display)
    }

    public getDisplay<T extends DisplayObject>(id: number): T | undefined {
        return this._displayMap.get(id) as T
    }

    public removeDisplayById(id: number): boolean {
        const display = this._displayMap.get(id)
        if (!display) {
            return false
        }
        this._displayMap.delete(id)
        display.dispose()
        this._removedSet.add(id)
        return true
    }

    /**
     * 渲染前准备。
     */
    public onBeforeRender(rebuild = false): {
        update: IMgrDisplayRenderData[]
        remove: number[]
    } {
        const update: IMgrDisplayRenderData[] = []

        for (const [id, display] of this._displayMap) {
            const renderData = display.onBeforeRender(rebuild)
            if (renderData) {
                update.push({ ...renderData, id })
            }
        }

        const remove = Array.from(this._removedSet)
        this._removedSet.clear()

        return { update, remove }
    }

    public clearDisplay(): void {
        for (const [id, display] of this._displayMap) {
            display.dispose()
            this._removedSet.add(id)
        }
        this._displayMap.clear()
    }

    public static instance(): DisplayObjectMgr {
        if (!this._instance) {
            this._instance = new DisplayObjectMgr()
        }
        return this._instance
    }
}
