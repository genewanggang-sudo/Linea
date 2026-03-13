import { Vec3 } from '../../base/vec3';
import { types } from '../../type_define/i_types';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Box3 } from '../../base/box3';
import { registerGeo } from '../../loader/register_geo';
import { TopoObject } from './topo_object';
import { Shell } from './shell';
import { Edge } from './edge';
import { Face } from './face';



import { IDBVertex, IDBTopoObject } from '../type_define/i_types';

// 点的标记: ...| isSmooth |.
const SMOOTH_MASK: number = 1;

/**
 * 点，体上的顶点
 */
@registerGeo
class Vertex extends TopoObject {
    private _point: Vec3 = Vec3.O();

    // 关联的边，运行时数据，不序列化
    private _edges: Set<Edge> = new Set<Edge>();

    constructor(point?: types.IXYZ) {
        super();
        if (point) {
            this._point = new Vec3(point);
        }
    }

    public getPoint() {
        return this._point;
    }

    public setPoint(point: Vec3) {
        this._point = point;
    }

    public getSmooth(): boolean {
        return this._flags !== undefined ? (this._flags! & SMOOTH_MASK) !== 0 : false;
    }

    public setSmooth(isSmooth: boolean) {
        this._flags = this._flags || 0;
        if (isSmooth) {
            this._flags! |= SMOOTH_MASK;
        } else {
            this._flags! &= ~SMOOTH_MASK;
        }
    }

    /**
     * 添加关联的边，只有Edge能使用此函数！
     * @param edge
     */
    public addEdge(edge: Edge): void {
        this._edges.add(edge);
    }

    /**
     * 删除关联的边，只有Edge能使用此函数！
     * @param edge
     */
    public deleteEdge(edge: Edge): void {
        this._edges.delete(edge);
    }

    /**
     * 获取所属的Body
     */
    public getShell(): Shell | undefined {
        return this.getParent() as Shell;
    }

    /**
     * 获取共点的全部edge
     */
    public getEdges(): Edge[] {
        return Array.from(this._edges);
    }

    /**
     * 获取共点的全部Face
     */
    public getFaces(): Face[] {
        const edges = this.getEdges();
        const faceSet: Set<Face> = new Set();
        for (const edge of edges) {
            edge.getFaces().forEach(face => {
                faceSet.add(face);
            });
        }

        return [...faceSet.values()];
    }

    public getBBox(): Box3 {
        return new Box3([this._point.toXYZ()]);
    }

    public dump(): IDBVertex {
        const result = super.dump() as IDBVertex;
        result.p = this._point.toArray3();
        return result;
    }

    public load({ p, tag, flag, data, _d }: IDBVertex): this {
        super.load({ tag, flag, data, _d } as IDBTopoObject);
        this._point = new Vec3(p);
        return this;
    }

    public getType(): EN_GEO_TYPE.BREP_VERTEX {
        return EN_GEO_TYPE.BREP_VERTEX;
    }
}

export { Vertex };