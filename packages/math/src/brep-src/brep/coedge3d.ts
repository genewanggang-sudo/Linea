import { TopoObject } from './topo_object';
import { Wire } from './wire';
import { Face } from './face';
import { Edge } from './edge';
import { Shell } from './shell';
import { IDBCoedge3d, IDBTopoObject } from '../type_define/i_types';
import { Vertex } from './vertex';
import { Box3 } from '../../base/box3';
import { Vec3 } from '../../base/vec3';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Loader } from '../../loader/loader';
import { registerGeo } from '../../loader/register_geo';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { MathAssert } from '../../util/assert';

/**
 *  三维半边结构
 */
@registerGeo
class Coedge3d extends TopoObject {
    // 对应Edge的索引
    private _edgeTag!: string;

    // 与三维边是否同向
    private _sameDirWithEdge!: boolean;

    // 对应的Edge
    private _edge: Edge | undefined;

    // 在对应曲面上的参数曲线，通常情况下为 undefined
    // 仅当曲面类型为圆锥、圆球时，需在其顶点处维护该参数曲线
    // 另，当曲面为 Nurbs 类型时，可在必要时维护该曲线，以精确表达 Edge
    private _pCurve: Curve2 | undefined;

    constructor();

    constructor(edge: Edge, sameDirWithEdge: boolean, pCurve?: Curve2);

    constructor(edge?: Edge, sameDirWithEdge?: boolean, pCurve?: Curve2) {
        super();

        if (undefined !== edge && undefined !== sameDirWithEdge) {
            this.setEdge(edge);
            this._sameDirWithEdge = sameDirWithEdge;
            this._pCurve = pCurve;
        }
    }

    public getEdgeTag() {
        if (this._edge) {
            return this._edge.tag;
        }
        return this._edgeTag;
    }

    public getSameDirWithEdge() {
        return this._sameDirWithEdge;
    }

    public setSameDirWithEdge(sameDir: boolean) {
        this._sameDirWithEdge = sameDir;
    }

    /**
     * 设置Edge
     * @param edge
     */
    public setEdge(edge: Edge) {
        if (this._edge) {
            this._edge.deleteCoedge3d(this);
        }

        this._edge = edge;
        this._edgeTag = edge.tag;

        if (this._edge) {
            this._edge.addCoedge3d(this);
        }
    }

    /**
     * 获取coedge对应的起始Vertex
     */
    public getStartVertex(): Vertex {
        return this._sameDirWithEdge ? this._edge!.getStartVertex() : this._edge!.getEndVertex();
    }

    /**
     * 获取coedge对应的终止Vertex
     */
    public getEndVertex(): Vertex {
        return this._sameDirWithEdge ? this._edge!.getEndVertex() : this._edge!.getStartVertex();
    }

    /**
     * 获取和半边对应的有界曲线，方向和半边的方向同向
     */
    public getCurve(): Curve3 {
        const cv = this.getEdge()!.getCurve().clone();

        return this._sameDirWithEdge ? cv : cv.reverse();
    }

    public getPCurve(): Curve2 | undefined {
        return this._pCurve;
    }

    public setPCurve(curve: Curve2 | undefined) {
        this._pCurve = curve;
    }

    // 将半边反向
    public reverse() {
        this._sameDirWithEdge = !this._sameDirWithEdge;
    }

    /**
     * 获取所属Wire
     */
    public getWire(): Wire | undefined {
        return this.getParent() as Wire;
    }

    /**
     * 获取所属Face
     */
    public getFace(): Face | undefined {
        const wire = this.getWire();
        if (!wire || !wire.getParent()) {
            return undefined;
        }
        return wire.getParent() as Face;
    }

    /**
     * 获取所属Boby
     */
    public getShell(): Shell | undefined {
        const face = this.getFace();
        if (!face || !face.getParent()) {
            return undefined;
        }
        return face.getParent() as Shell;
    }

    /**
     * 获取其对应edge
     */
    public getEdge(): Edge | undefined {
        return this._edge;
    }

    public dispose() {
        if (this._edge) {
            this._edge.deleteCoedge3d(this);
            if (!this._edge.getCoedge3ds().length) {
                this._edge.dispose();
            }
        }
    }

    public isEdgeInfoValid() {
        return !!this._edge;
    }

    public getIndexInWire() {
        const wire = this.getWire();
        if (!wire) {
            return -1;
        }

        return wire.getCoedge3ds().findIndex(coedge => coedge === this);
    }

    public getPrevCoedge(): Coedge3d | undefined {
        const wire = this.getWire();
        if (!wire) {
            return undefined;
        }
        const index = wire.getCoedge3ds().findIndex(coedge => coedge === this);

        if (index === 0) {
            return wire.getCoedge3dByIndex(wire.getCoedge3ds().length - 1);
        }

        return wire.getCoedge3dByIndex(index - 1);
    }

    public getNextCoedge(): Coedge3d | undefined {
        const wire = this.getWire();
        if (!wire) {
            return undefined;
        }
        const index = wire.getCoedge3ds().findIndex(coedge => coedge === this);

        if (index === wire.getCoedge3ds().length - 1) {
            return wire.getCoedge3dByIndex(0);
        }

        return wire.getCoedge3dByIndex(index + 1);
    }

    public getStartTangent() {
        let stTangent: Vec3;
        if (this.getSameDirWithEdge()) {
            stTangent = this.getEdge()!.getCurve().getStartTangent();
        } else {
            stTangent = this.getEdge()!.getCurve().getEndTangent();
            stTangent.reverse();
        }
        return stTangent;
    }

    public getEndTangent() {
        let endTangent: Vec3;
        if (this.getSameDirWithEdge()) {
            endTangent = this.getEdge()!.getCurve().getEndTangent();
        } else {
            endTangent = this.getEdge()!.getCurve().getStartTangent();
            endTangent.reverse();
        }
        return endTangent;
    }

    public getTwin(): Coedge3d | undefined {
        const edge = this.getEdge();
        if (!edge) return undefined;

        const twins = edge.getOtherCoedge3ds(this);
        if (twins.length === 0) return undefined;
        MathAssert.warn(twins.length === 1, 'Multiple twins found');
        return twins[0];
    }

    /**
     * 获取共享Edge的边
     */
    public getTwins(): Coedge3d[] {
        const edge = this.getEdge();
        if (!edge) {
            return [];
        }

        return edge.getOtherCoedge3ds(this);
    }

    public getBBox(): Box3 {
        return this.getEdge()!.getBBox();
    }

    public getType(): EN_GEO_TYPE.BREP_COEDGE {
        return EN_GEO_TYPE.BREP_COEDGE;
    }

    /**
     *  抽取元数据，用于序列化
     * @returns 返回js对象
     */
    public dump(): IDBCoedge3d {
        const result = super.dump() as IDBCoedge3d;
        result.eTag = this.getEdgeTag();
        result.dir = this._sameDirWithEdge ? 1 : 0;
        if (this._pCurve) result.pCrv = this._pCurve.dump();
        (result as any).tag = undefined;
        return result;
    }

    public load({ tag, flag, data, eTag, dir, pCrv, _d }: IDBCoedge3d): this {
        super.load({ tag, flag, data, _d } as IDBTopoObject);
        this._edgeTag = eTag;
        this._sameDirWithEdge = dir > 0;
        if (pCrv) {
            this._pCurve = Loader.load(pCrv) as Curve2;
        } else {
            this._pCurve = undefined;
        }
        return this;
    }
}

export { Coedge3d };
