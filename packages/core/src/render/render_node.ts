import { EN_RNODE_TYPE } from '../types/type_define';
import { Mat4, Vec3 } from '@ccpc/math'
import { IConstructor } from '../types/type_guard';
import { GNode } from '../grep/gnode';
/**
 * 渲染对象，所有的几何对象都要离散为此数据结构
 */
export class RenderNode {
    public parent?: RenderGroup;

    public gnode!: GNode;

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.UNKOWN;

    public globalMatrix?: Mat4

    public copyWorldMatrix(m?: Mat4): void {
        this.globalMatrix = m?.clone()
    }

    public traverse(callback: (rNode: RenderNode) => void) {
        callback(this)
        if (this instanceof RenderGroup) {
            this.children.forEach(child => {
                child.traverse(callback)
            })
        }
    }

    public clone(): this {
        const Ctor = this.constructor as IConstructor<this>
        const copy = new Ctor()
        copy.globalMatrix = this.globalMatrix?.clone()
        copy.gnode = this.gnode
        return copy
    }

    protected _cloneByCtor<T extends RenderNode>(Ctor: IConstructor<T>) {
        const copy = new Ctor()
        copy.globalMatrix = this.globalMatrix?.clone()
        copy.gnode = this.gnode
        return copy
    }
}

export class RenderGroup extends RenderNode {
    public children: Array<RenderNode> = [];

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.GROUP;

    public add(node: RenderNode): void {
        this.children.push(node);
        node.parent = this;
    }

    public override clone(): this {
        const copy = super.clone();
        this.children.forEach(child => {
            copy.add(child.clone())
        })
        return copy
    }
}

export class RenderPoint extends RenderNode {
    public point!: Vec3

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.POINT;
}

export class RenderEdge extends RenderNode {
    public points!: Vec3[];

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.EDGE;
}
