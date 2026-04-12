import { EN_RNODE_TYPE } from '../types/type_define';
import { Matrix4, types, Vec3 } from '@ccpc/math'
import { IConstructor } from '../types/type_guard';
import { GNode } from '../grep/gnode';
import { IStyle } from '../grep/i_style';
/**
 * 渲染对象，所有的几何对象都要离散为此数据结构
 */
export class RenderNode {
    public parent?: RenderGroup;

    public gnode!: GNode;

    public visible = true

    public style: IStyle = {}

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.UNKOWN;

    public globalMatrix?: Matrix4

    public copyWorldMatrix(m?: Matrix4): void {
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

    public clone() {
        const Ctor = this.constructor as IConstructor<this>
        const copy = new Ctor()
        copy.parent = this.parent
        copy.gnode = this.gnode
        copy.visible = this.visible
        copy.globalMatrix = this.globalMatrix?.clone()
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

    // TODO clone方法
}

export class RenderEdge extends RenderNode {
    public points!: Vec3[];

    public type: EN_RNODE_TYPE = EN_RNODE_TYPE.EDGE;

    // TODO clone方法
}

/**
 * 文字
 */
export class RenderText extends RenderNode {
    public text: string = ''

    public opacity: number = 1;

    public position: types.IXYZ = Vec3.O()

    public clone() {
        const copy = super.clone()
        copy.text = this.text
        copy.opacity = this.opacity
        copy.position = new Vec3(this.position)
        return copy
    }
}

/**
 * 三角面片
 */
export class RenderMesh extends RenderNode {
    private _verts: Float32Array | undefined;

    private _indices: Uint32Array | undefined;

    private _normals: Float32Array | undefined;

    private _uvs: Float32Array | undefined;

    /**
     * 点集,一个点由一个索引组成
     * 离散后的所有顶点, 此数据不渲染,只做存储使用
     */
    public setVerts(verts: types.IXYZ[] | Float32Array) {
        if (verts instanceof Float32Array) {
            this._verts = verts;
        } else {
            this._verts = new Float32Array(3 * verts.length);
            for (let i = 0; i < verts.length; i++) {
                this._verts[i * 3] = verts[i].x;
                this._verts[i * 3 + 1] = verts[i].y;
                this._verts[i * 3 + 2] = verts[i].z;
            }
        }
    }

    public setIndices(indices: number[][] | Uint32Array) {
        if (indices instanceof Uint32Array) {
            this._indices = indices;
        } else {
            this._indices = new Uint32Array(3 * indices.length);
            for (let i = 0; i < indices.length; i++) {
                this._indices[i * 3] = indices[i][0];
                this._indices[i * 3 + 1] = indices[i][1];
                this._indices[i * 3 + 2] = indices[i][2];
            }
        }
    }

    public setNormals(normals: types.IXYZ[] | Float32Array) {
        if (normals instanceof Float32Array) {
            this._normals = normals;
        } else {
            this._normals = new Float32Array(3 * normals.length);
            for (let i = 0; i < normals.length; i++) {
                this._normals[i * 3] = normals[i].x;
                this._normals[i * 3 + 1] = normals[i].y;
                this._normals[i * 3 + 2] = normals[i].z;
            }
        }
    }

    public setUVs(uvs: types.IXY[] | Float32Array) {
        if (uvs instanceof Float32Array) {
            this._uvs = uvs;
        } else {
            this._uvs = new Float32Array(2 * uvs.length);
            for (let i = 0; i < uvs.length; i++) {
                this._uvs[i * 2] = uvs[i].x;
                this._uvs[i * 2 + 1] = uvs[i].y;
            }
        }
    }

    public getVertexes(): Vec3[] {
        if (!this._verts) {
            return [];
        }

        const result: Vec3[] = [];
        for (let i = 0; i < this._verts.length / 3; i++) {
            result.push(new Vec3(this._verts[i * 3], this._verts[i * 3 + 1], this._verts[i * 3 + 2]));
        }

        return result;
    }

    public getVerts(): Float32Array {
        return this._verts ? this._verts : new Float32Array();
    }

    public getIndices(): Uint32Array {
        return this._indices ? this._indices : new Uint32Array();
    }

    public getNormals(): Float32Array {
        return this._normals ? this._normals : new Float32Array();
    }

    public getUVs(): Float32Array {
        return this._uvs ? this._uvs : new Float32Array();
    }

    public clone() {
        const copy = super.clone()
        copy.setVerts(Float32Array.from(this._verts || []));
        copy.setNormals(Float32Array.from(this._normals || []));
        copy.setUVs(Float32Array.from(this._uvs || []));
        copy.setIndices(Uint32Array.from(this._indices || []));
        return copy
    }

    /**
     * 将目标RenderMesh合并到当前RenderMesh, 会改变this
     * @param 目标RenderMesh
     */
    public merge(renderMesh: RenderMesh) {
        if (!renderMesh.getVerts().length) {
            return;
        }
        const verts1: number[] = Array.from(this._verts || []);
        const length1 = verts1.length / 3;
        const verts2: number[] = Array.from(renderMesh.getVerts());
        verts1.push(...verts2);

        const normals1: number[] = Array.from(this._normals || []);
        const normals2: number[] = Array.from(renderMesh.getNormals());
        normals1.push(...normals2);

        const uvs1: number[] = Array.from(this._uvs || []);
        const uvs2: number[] = Array.from(renderMesh.getUVs());
        uvs1.push(...uvs2);

        const indices1: number[] = Array.from(this._indices || []);
        let indices2: number[] = Array.from(renderMesh.getIndices());
        indices2 = indices2.map(n => n + length1);
        indices1.push(...indices2);

        this._verts = new Float32Array(verts1);
        this._normals = new Float32Array(normals1);
        this._uvs = new Float32Array(uvs1);
        this._indices = new Uint32Array(indices1);
    }
}
