import { GRep } from '../grep/grep'
import { dirtyProp } from './dirty_prop'
import { StateObject } from './state_object'

export interface IDisplayRenderData {
    gRep?: GRep
}

export interface IMgrDisplayRenderData extends IDisplayRenderData {
    id: number
}

/**
 * 最小单类显示对象。
 * 当前只保留 grep 渲染链路需要的公共能力。
 */
export abstract class DisplayObject extends StateObject {
    private static _dID = 0

    /**
     * 统一显示对象 id，后续可作渲染层主键。
     */
    public readonly id: number

    /**
     * 在 render 层创建出 group 后，设置 visible 属性。
     * display 直接改，modelview 里 updateElementVisible。
     * 控制整棵树显隐，grep 中的 visible 控制图元是否参与渲染。
     */
    @dirtyProp()
    public visible?: boolean

    constructor() {
        super()
        this.id = ++DisplayObject._dID
    }

    /**
     * 统一判断当前对象是否应该显示。
     */
    public testVisible(): boolean {
        const visible = this.visible != null ? this.visible : true
        return visible && this.visibleCheck()
    }

    /**
     * 给子类补充额外显示条件。
     */
    public visibleCheck(): boolean {
        return true
    }

    public onBeforeRender(rebuild = false): IDisplayRenderData | null {
        if (rebuild || this.isDirty()) {
            const data = this.onRender()
            this.unDirty()
            return data
        }
        return null
    }

    public onRender(): IDisplayRenderData | null {
        return null
    }

    public override dispose(): void {
        super.dispose()
    }
}
