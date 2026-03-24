import type { GNode } from '@ccpc/core'
import { GNODE_TYPE } from '@ccpc/core'
import type { Vec2 } from '@ccpc/math'

const allTypes = [
    GNODE_TYPE.GPoint2d,
    GNODE_TYPE.GCurve2d,
    GNODE_TYPE.GGroup,
    GNODE_TYPE.GRep,
    GNODE_TYPE.GPolygon,
    GNODE_TYPE.GPolycurve,
    GNODE_TYPE.GText2d,
]

/**
 * pick 过滤器。
 *
 * 用于约束哪些 GNode 类型可以参与当前这次拾取。
 * 先通过 GNODE_TYPE 做类型过滤，再按需叠加自定义过滤逻辑。
 */
export class PickFilter {
    private _filteredTypes: Set<GNODE_TYPE> = new Set()

    private _customizedFilter?: (gnode: GNode, screenPos: Vec2) => boolean

    /**
     * 允许当前已登记的全部图元类型参与拾取。
     */
    public allowAll(): this {
        allTypes.forEach(type => {
            this.allow(type)
        })
        return this
    }

    /**
     * 禁止所有图元类型参与拾取。
     */
    public disallowAll(): this {
        this._filteredTypes.clear()
        return this
    }

    /**
     * 允许某一种图元类型参与拾取。
     */
    public allow(gnodeType: GNODE_TYPE): this {
        this._filteredTypes.add(gnodeType)
        return this
    }

    /**
     * 禁止某一种图元类型参与拾取。
     */
    public disallow(gnodeType: GNODE_TYPE): this {
        this._filteredTypes.delete(gnodeType)
        return this
    }

    /**
     * 设置自定义过滤函数。
     */
    public setCustomizedFilter(filter: (gnode: GNode, screenPos: Vec2) => boolean): this {
        this._customizedFilter = filter
        return this
    }

    /**
     * 判断某个 gnode 在当前屏幕位置下是否允许被拾取。
     */
    public isEnable(gnode: GNode, screenPos: Vec2): boolean {
        const typeResult = this._filteredTypes.has(gnode.getType())
        if (!typeResult) {
            return false
        }
        if (this._customizedFilter) {
            return this._customizedFilter(gnode, screenPos)
        }
        return true
    }
}
