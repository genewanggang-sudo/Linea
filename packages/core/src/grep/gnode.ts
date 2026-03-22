import { DiscreteParam, Matrix4 } from '@ccpc/math'
import { RenderNode } from '../render/render_node'
import { CMathUtil } from '../toolkit/cmath_util'
import { DebugUtil } from '../toolkit/debug_util'
import { ElementId } from '../element/element_id'
import { GRep } from './grep'
import { GGroup } from './ggroup'

/**
 * 表示图形的基本单元, 包括几何数据和显示样式
 */
export abstract class GNode {

    public static gId = 0
    /**
     * dynamic global incremental
     */
    public readonly globalID: number

    public parent?: GNode

    /**
     * 相对父节点局部矩阵
     */
    protected _localMatrix?: Matrix4

    /**
     * 根节点累计到当前的世界矩阵
     */
    protected _globalMatrix?: Matrix4

    /**
     * 对应的渲染节点
     * 一旦创建出来, 会复用并在需要时同步矩阵
     */
    protected _renderNode?: RenderNode

    public get elementId() {
        const root = this.getRoot()
        return root instanceof GRep
            ? root.elementId
            : ElementId.INVALID
    }

    public get localMatrix(): Matrix4 | undefined {
        return this._localMatrix
    }

    public set localMatrix(value: Matrix4) {
        this._localMatrix = value
    }

    public get globalMatrix() {
        return this._globalMatrix
    }

    constructor() {
        GNode.gId += 1
        this.globalID = GNode.gId
    }

    /**
     * GNode->RenderNode入口
     */
    public toRenderNode(discreteParams?: DiscreteParam) {
        this.updateRenderNode(discreteParams)
        DebugUtil.assert(this._renderNode, '转RenderNode失败', 'wg', '2026-03-11')
        return this._renderNode
    }

    /**
     * 更新GNode对应的RenderNode
     */
    public updateRenderNode(discreteParams?: DiscreteParam) {
        if (!this._renderNode) {
            this._renderNode = this._toRenderNodeWithoutMatrix(discreteParams)
        }
        this._renderNode.gnode = this
        if (this._globalMatrix) {
            this._renderNode.copyWorldMatrix(this._globalMatrix)
        }
    }

    /**
     * 从当前节点的树根计算整棵子树的世界矩阵
     */
    public updateGlobalMatrix() {
        const root = this.getRoot()
        root._updateMatrix()
    }

    /**
     * 递归计算当前节点及子节点的世界矩阵
     */
    protected _updateMatrix(parentGlobalMatrix?: Matrix4) {
        this._globalMatrix = CMathUtil.composeMatrix(parentGlobalMatrix, this._localMatrix)
        if (this._renderNode) {
            this._renderNode.globalMatrix = this._globalMatrix?.clone()
        }
        const children = this.getTraverseChildren()
        children.forEach(child => {
            child._updateMatrix(this._globalMatrix)
        })
    }

    /**
     * 查整根树的根节点
     */
    public getRoot() {
        let curNode: GNode = this.parent || this
        while (curNode.parent) {
            curNode = curNode.parent
        }
        return curNode
    }

    public traverse(callback: (gnode: GNode) => void) {
        callback(this)
        this.getTraverseChildren().forEach(child => {
            child.traverse(callback)
        })
    }

    /**
     * 返回当前节点的可遍历子节点
     */
    public getTraverseChildren(): Array<GNode> {
        return []
    }

    /**
     * 通过离散等方式生成对应的RenderNode
     */
    protected abstract _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderNode

    /**
     * 清除_renderNode
     * @param clearChildren 是否清除子节点renderNode
     * @param clearParent 是否清除父节点renderNode
     */
    public clearRenderNode(clearChildren = false, clearParent = false) {
        delete this._renderNode
        if (clearParent) {
            let gnode = this.parent
            while (gnode) {
                delete gnode._renderNode
                gnode = gnode.parent
            }
            return
        }
        if (clearChildren) {
            this.getTraverseChildren().forEach(child => {
                child.clearRenderNode(clearChildren)
            })
        }
    }

    /**
     * 从父节点移除
     */
    public removeFromParent() {
        if (!this.parent || !(this.parent instanceof GGroup)) return false
        return this.parent.removeNode(this)
    }

    /**
     * 克隆
     * @param cloneGeo 是否深拷贝底层几何对象
     */
    public abstract clone(cloneGeo?: boolean): GNode

    /**
     * 从其它实例复制状态
     */
    protected _copyFrom(another: GNode) {
        this._localMatrix = another._localMatrix?.clone()
        this._globalMatrix = another._globalMatrix?.clone()
        return this
    }

}
