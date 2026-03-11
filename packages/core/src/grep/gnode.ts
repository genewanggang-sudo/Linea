import { DiscretizeOptions, Mat4 } from '@ccpc/math'
import { RenderNode } from '../render/render_node'
import { CMathUtil } from '../toolkit/cmath_util'
import { DebugUtil } from '../toolkit/debug_util'

/**
 * 表示图形的基本单元, 包括几何数据和显示样式
 */
export abstract class GNode {
    /**父节点*/
    public parent?: GNode

    /**
     * 对应的渲染节点
     * 一旦创建出来, 会复用并在需要时同步矩阵
     */
    protected _renderNode?: RenderNode

    /**
     * 相对父节点局部矩阵
     */
    protected _localMatrix?: Mat4

    /**
     * 根节点累计到当前的世界矩阵
     */
    protected _globalMatrix?: Mat4

    public get localMatrix(): Mat4 | undefined {
        return this._localMatrix
    }

    public set localMatrix(value: Mat4) {
        this._localMatrix = value
    }

    public get globalMatrix() {
        return this._globalMatrix
    }

    /**
     * GNode->RenderNode入口
     */
    public toRenderNode(discreteParams?: DiscretizeOptions) {
        this.updateRenderNode(discreteParams)
        DebugUtil.assert(this._renderNode, '转RenderNode失败', 'wg', '2026-03-11')
        return this._renderNode
    }

    /**
     * 更新GNode对应的RenderNode
     */
    public updateRenderNode(discreteParams?: DiscretizeOptions) {
        if (!this._renderNode) {
            this._renderNode = this._toRenderNodeWithoutMatrix(discreteParams)
        }
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
    protected _updateMatrix(parentGlobalMatrix?: Mat4) {
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
        let curNode = this.parent
        while (curNode?.parent) {
            curNode = curNode.parent
        }
        return curNode ?? this
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
    protected abstract _toRenderNodeWithoutMatrix(discreteParams?: DiscretizeOptions): RenderNode

    public abstract clone(): GNode

}
