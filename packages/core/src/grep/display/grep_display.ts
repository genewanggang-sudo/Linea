import type { GRep } from '../grep'
import { dirtyProp } from '../../display/dirty_prop'
import type { IDisplayRenderData } from './display_object'
import { DisplayObject } from './display_object'

export class GrepDisplay extends DisplayObject {
    /**
     * 当前显示对象对应的 GRep。
     */
    @dirtyProp()
    public gRep!: GRep

    /**
     * 关联的 elementId。
     * 先保留，便于继续兼容当前 ModelView 链路。
     */
    public eId!: number

    public getGRep(): GRep {
        return this.gRep
    }

    public override onRender(): IDisplayRenderData | null {
        return { gRep: this.gRep }
    }
}
