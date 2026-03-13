import { DiscreteParam } from '@ccpc/math';
import { RenderGroup, RenderNode } from '../render/render_node';
import { GNode } from './gnode';

export class GGroup extends GNode {
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
        node.parent = this
        if (index !== undefined) {
            this.children.splice(index, 0, node)
        } else {
            this._children.push(node)
        }
        return node
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

    // TODO 和实际使用有区别, 待完善
    public clone(): GGroup {
        const copy = new GGroup();
        copy._localMatrix = this._localMatrix?.clone();
        copy._globalMatrix = this._globalMatrix?.clone();
        this._children.forEach(child => copy.addNode(child.clone()));
        return copy;
    }

}
