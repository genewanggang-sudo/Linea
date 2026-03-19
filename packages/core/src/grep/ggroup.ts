import { DiscreteParam } from '@ccpc/math';
import { RenderGroup, RenderNode } from '../render/render_node';
import { GNode } from './gnode';

export class GGroup extends GNode {
    /**
     * 子节点
     */
    protected _children: Array<GNode> = []

    public get children() {
        return this._children
    }

    public isEmpty(): boolean {
        return this._children.length < 1;
    }

    /**
     * 添加子节点
     */
    public addNode(node: GNode, index?: number) {
        if (node.parent) {
            node.removeFromParent()
        }
        node.parent = this
        if (index !== undefined) {
            this.children.splice(index, 0, node)
        } else {
            this._children.push(node)
        }
        return node
    }

    /**
     * 移除子节点
     */
    public removeNode(node: GNode) {
        const index = this.children.findIndex(_ => _ === node)
        if (index < 0) return false
        node.parent = undefined
        this.children.splice(index, 1)
        return true
    }

    /**
     * 批量添加子节点
     */
    public addNodes(...nodes: Array<GNode | GNode[]>): void {
        nodes.flat().forEach(node => this.addNode(node));
    }

    public getTraverseChildren(): GNode[] {
        return [...this._children];
    }

    protected _toRenderNodeWithoutMatrix(discreteParams?: DiscreteParam): RenderNode {
        const render = new RenderGroup();
        this._children.forEach(child => {
            const renderNode = child.toRenderNode(discreteParams)
            if (renderNode) render.add(renderNode);
        });
        return render;
    }

    public clone(cloneGeo?: boolean): GGroup {
        return new GGroup()._copyFrom(this, cloneGeo)
    }

    protected _copyFrom(another: GGroup, cloneGeo?: boolean): this {
        super._copyFrom(another)
        another._children.forEach(child => {
            this.addNode(child.clone(cloneGeo))
        })
        return this
    }

}
